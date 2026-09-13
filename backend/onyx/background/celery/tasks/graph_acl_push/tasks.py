"""Celery tasks for pushing document-table ACLs to the external graph service.

The doc_sync loop refreshes the ``document`` ACL columns and bumps
``document.last_modified`` only when values actually change. These tasks
ship that delta to magicbox-backend ``POST /acl/sync``, which maintains
``:AclDocument`` snapshot nodes and recomputes entity ACLs from them.
"""

import datetime

import httpx
from celery import Task, shared_task
from redis.lock import Lock as RedisLock
from sqlalchemy import select, text

from onyx.background.celery.apps.app_base import task_logger
from onyx.configs.app_configs import (
    GRAPH_ACL_PUSH_ENABLED,
    GRAPH_ACL_PUSH_SOURCES,
    GRAPH_ACL_PUSH_URL,
)
from onyx.configs.constants import (
    CELERY_GENERIC_BEAT_LOCK_TIMEOUT,
    OnyxCeleryPriority,
    OnyxCeleryQueues,
    OnyxCeleryTask,
    OnyxRedisLocks,
)
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.models import GraphAclPushState
from onyx.redis.redis_pool import get_redis_client

# Watermark floor for sources that have no state row yet (first round is a
# full sync of every document in the source).
_EPOCH_WATERMARK = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)

# The watermark advances to snapshot_time - overlap, so rows modified inside
# the window are re-read (and idempotently re-pushed) by the next round.
GRAPH_ACL_PUSH_WATERMARK_OVERLAP_SECONDS = 60

# Full first rounds can carry thousands of documents.
GRAPH_ACL_PUSH_HTTP_TIMEOUT = 600


@shared_task(
    name=OnyxCeleryTask.CHECK_FOR_GRAPH_ACL_PUSH,
    soft_time_limit=300,
    bind=True,
    ignore_result=True,
)
def check_for_graph_acl_push(self: Task, *, tenant_id: str) -> None:
    """Beat task: enqueue one graph ACL push round when the feature is enabled.

    The Redis beat lock prevents overlapping rounds from multiple beat
    processes (modeled on check_for_graph_processing).
    """
    if not GRAPH_ACL_PUSH_ENABLED:
        return None

    redis_client = get_redis_client(tenant_id=tenant_id)
    lock: RedisLock = redis_client.lock(
        OnyxRedisLocks.GRAPH_ACL_PUSH_BEAT_LOCK,
        timeout=CELERY_GENERIC_BEAT_LOCK_TIMEOUT,
    )
    if not lock.acquire(blocking=False):
        return None

    try:
        self.app.send_task(
            OnyxCeleryTask.PUSH_GRAPH_ACL,
            kwargs={"tenant_id": tenant_id},
            queue=OnyxCeleryQueues.GRAPH_ACL_PUSH,
            priority=OnyxCeleryPriority.LOW,
        )
    finally:
        if lock.owned():
            lock.release()

    return None


@shared_task(
    name=OnyxCeleryTask.PUSH_GRAPH_ACL,
    soft_time_limit=1200,
    bind=True,
    ignore_result=True,
)
def push_graph_acl(self: Task, *, tenant_id: str) -> None:  # noqa: ARG001
    """Push document-table ACL deltas to the external graph service.

    Per whitelisted source, select documents with ``last_modified >
    watermark`` (filtered to the source via the
    document_by_connector_credential_pair → connector join), merge all
    deltas into one batch, and POST to ``GRAPH_ACL_PUSH_URL + /acl/sync``.
    Per-source watermarks advance only on HTTP 2xx, to the snapshot time
    minus a 60s overlap window, so a failed round re-pushes the same delta.
    """
    if not GRAPH_ACL_PUSH_ENABLED:
        task_logger.info("push_graph_acl - disabled, skipping")
        return None

    snapshot_ts = datetime.datetime.now(datetime.timezone.utc)
    docs: list[dict] = []
    touched_sources: set[str] = set()

    with get_session_with_current_tenant() as db_session:
        states = {
            state.source: state
            for state in db_session.execute(select(GraphAclPushState)).scalars()
        }

        for source in GRAPH_ACL_PUSH_SOURCES:
            watermark = (
                states[source].watermark if source in states else _EPOCH_WATERMARK
            )
            rows = db_session.execute(
                text(
                    """
                    SELECT DISTINCT d.id, d.external_user_emails,
                           d.external_user_group_ids, d.is_public
                    FROM document d
                    JOIN document_by_connector_credential_pair dbccp
                        ON dbccp.id = d.id
                    JOIN connector c ON c.id = dbccp.connector_id
                    WHERE c.source = :source
                      AND d.last_modified > :watermark
                    """
                ),
                {"source": source, "watermark": watermark},
            ).fetchall()

            if not rows:
                continue

            touched_sources.add(source)
            for row in rows:
                docs.append(
                    {
                        "doc_id": row[0],
                        "external_user_emails": row[1] or [],
                        "external_user_group_ids": row[2] or [],
                        "is_public": bool(row[3]),
                    }
                )

        if not docs:
            task_logger.info("push_graph_acl - no ACL deltas, nothing to push")
            return None

        task_logger.info(
            "push_graph_acl - pushing %d docs for sources=%s",
            len(docs),
            sorted(touched_sources),
        )

        try:
            response = httpx.post(
                f"{GRAPH_ACL_PUSH_URL}/acl/sync",
                json={"docs": docs},
                timeout=GRAPH_ACL_PUSH_HTTP_TIMEOUT,
            )
            response.raise_for_status()
        except Exception as e:
            task_logger.error("push_graph_acl - POST failed: %s", e)
            # Do not advance watermarks: the next round re-pushes the same delta.
            for source in touched_sources:
                state = states.get(source) or GraphAclPushState(source=source)
                state.last_error = str(e)[:5000]
                db_session.merge(state)
            db_session.commit()
            return None

        # Advance watermarks only after the service confirmed the batch.
        new_watermark = snapshot_ts - datetime.timedelta(
            seconds=GRAPH_ACL_PUSH_WATERMARK_OVERLAP_SECONDS
        )
        for source in touched_sources:
            state = states.get(source)
            if state is None:
                state = GraphAclPushState(source=source, watermark=new_watermark)
                db_session.add(state)
            else:
                # Never move a watermark backward.
                if new_watermark > state.watermark:
                    state.watermark = new_watermark
            state.last_pushed_at = snapshot_ts
            state.last_error = None
        db_session.commit()

    task_logger.info(
        "push_graph_acl - pushed %d docs, advanced watermarks for sources=%s",
        len(docs),
        sorted(touched_sources),
    )
    return None
