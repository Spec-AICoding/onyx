import datetime
import os
from uuid import UUID

import httpx
from celery import Task, shared_task
from redis.lock import Lock as RedisLock
from sqlalchemy import select, text

from onyx.background.celery.apps.app_base import task_logger
from onyx.background.celery.celery_redis import (
    celery_get_broker_client,
    celery_get_queue_length,
)
from onyx.configs.app_configs import (
    GRAPH_PROCESSING_API_TIMEOUT,
    GRAPH_PROCESSING_API_URL,
)
from onyx.configs.constants import (
    CELERY_GENERIC_BEAT_LOCK_TIMEOUT,
    CELERY_GRAPH_PROCESSING_TASK_EXPIRES,
    GRAPH_PROCESSING_MAX_QUEUE_DEPTH,
    OnyxCeleryPriority,
    OnyxCeleryQueues,
    OnyxCeleryTask,
    OnyxRedisLocks,
)
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.models import FileRecord
from onyx.redis.redis_pool import get_redis_client
from onyx.kg.models import KGStage


def _file_extension(display_name: str | None) -> str:
    """Extract the file extension (without dot) from a display name."""
    if not display_name:
        return ""
    ext = os.path.splitext(display_name)[1]
    return ext.lstrip(".").lower()


def _graph_processing_queued_key(file_id: str) -> str:
    return f"{OnyxRedisLocks.GRAPH_PROCESSING_QUEUED_PREFIX}:{file_id}"


@shared_task(
    name=OnyxCeleryTask.CHECK_FOR_GRAPH_PROCESSING,
    soft_time_limit=300,
    bind=True,
    ignore_result=True,
)
def check_for_graph_processing(self: Task, *, tenant_id: str) -> None:
    """Scan file_records with processed=true and kg_stage=NOT_STARTED and enqueue per-file tasks.

    Only file records that finished docprocessing (processed=true) and have
    not been graph-processed yet (kg_stage=not_started) are eligible.
    Three protections against queue runaway:
    1. Queue depth backpressure
    2. Per-file queued guard (Redis SETNX)
    3. Task expiry auto-drain
    """
    task_logger.info("check_for_graph_processing - Starting")

    redis_client = get_redis_client(tenant_id=tenant_id)
    lock: RedisLock = redis_client.lock(
        OnyxRedisLocks.GRAPH_PROCESSING_BEAT_LOCK,
        timeout=CELERY_GENERIC_BEAT_LOCK_TIMEOUT,
    )

    if not lock.acquire(blocking=False):
        return None

    enqueued = 0
    skipped_guard = 0
    try:
        r_celery = celery_get_broker_client(self.app)
        queue_len = celery_get_queue_length(
            OnyxCeleryQueues.GRAPH_PROCESSING, r_celery
        )
        if queue_len > GRAPH_PROCESSING_MAX_QUEUE_DEPTH:
            task_logger.warning(
                f"check_for_graph_processing - Queue depth {queue_len} exceeds "
                f"{GRAPH_PROCESSING_MAX_QUEUE_DEPTH}, skipping enqueue for "
                f"tenant={tenant_id}"
            )
            return None

        with get_session_with_current_tenant() as db_session:
            rows = db_session.execute(
                text(
                    "SELECT file_id FROM file_record "
                    "WHERE processed = true AND kg_stage = 'not_started'"
                )
            ).fetchall()

            for row in rows:
                file_id = str(row[0])
                queued_key = _graph_processing_queued_key(file_id)
                guard_set = redis_client.set(
                    queued_key,
                    1,
                    ex=CELERY_GRAPH_PROCESSING_TASK_EXPIRES,
                    nx=True,
                )
                if not guard_set:
                    skipped_guard += 1
                    continue

                try:
                    self.app.send_task(
                        OnyxCeleryTask.PROCESS_FILE_RECORD_GRAPH,
                        kwargs={
                            "file_id": file_id,
                            "tenant_id": tenant_id,
                        },
                        queue=OnyxCeleryQueues.GRAPH_PROCESSING,
                        priority=OnyxCeleryPriority.MEDIUM,
                        expires=CELERY_GRAPH_PROCESSING_TASK_EXPIRES,
                    )
                except Exception:
                    redis_client.delete(queued_key)
                    raise
                enqueued += 1

    finally:
        if lock.owned():
            lock.release()

    task_logger.info(
        f"check_for_graph_processing - Enqueued {enqueued} "
        f"skipped_guard={skipped_guard} for tenant={tenant_id}"
    )
    return None


@shared_task(
    name=OnyxCeleryTask.PROCESS_FILE_RECORD_GRAPH,
    bind=True,
    ignore_result=True,
)
def process_file_record_graph(
    self: Task,  # noqa: ARG001
    *,
    file_id: str,
    tenant_id: str,
) -> None:
    """Call external graph API with S3 file info for a processed file record.

    1. Set kg_stage → EXTRACTING + kg_processing_time on file_record
    2. Look up FileRecord to get bucket, key, display_name
    3. POST to graph API
    4. Set kg_stage → EXTRACTED + kg_processing_time (success) or FAILED (error)
    """
    task_logger.info(f"process_file_record_graph - Processing file_id={file_id}")

    with get_session_with_current_tenant() as db_session:
        # 1. Mark EXTRACTING with processing time
        db_session.execute(
            text(
                "UPDATE file_record SET kg_stage = :stage, "
                "kg_processing_time = :ts WHERE file_id = :file_id"
            ),
            {
                "stage": KGStage.EXTRACTING.value,
                "ts": datetime.datetime.now(datetime.timezone.utc),
                "file_id": file_id,
            },
        )

        # 2. Look up FileRecord
        file_record = db_session.execute(
            select(FileRecord).where(FileRecord.file_id == file_id)
        ).scalar_one_or_none()

        if not file_record:
            task_logger.warning(
                f"process_file_record_graph - No file_record found for file_id={file_id}"
            )
            db_session.execute(
                text(
                    "UPDATE file_record SET kg_stage = :stage WHERE file_id = :file_id"
                ),
                {"stage": KGStage.FAILED.value, "file_id": file_id},
            )
            db_session.commit()
            return None

        # 3. Build and send API request
        file_type = _file_extension(file_record.display_name)

        payload = {
            "file_type": file_type,
            "objects": [
                {
                    "bucket": file_record.bucket_name,
                    "key": file_record.object_key,
                }
            ],
        }

        task_logger.info(
            f"process_file_record_graph - POST to graph API: "
            f"file_id={file_id} file_type={file_type}"
        )

        try:
            response = httpx.post(
                GRAPH_PROCESSING_API_URL,
                json=payload,
                timeout=GRAPH_PROCESSING_API_TIMEOUT,
            )
            response.raise_for_status()
            db_session.execute(
                text(
                    "UPDATE file_record SET kg_stage = :stage, "
                    "kg_processing_time = :ts WHERE file_id = :file_id"
                ),
                {
                    "stage": KGStage.EXTRACTED.value,
                    "ts": datetime.datetime.now(datetime.timezone.utc),
                    "file_id": file_id,
                },
            )
            task_logger.info(
                f"process_file_record_graph - Success for file_id={file_id}"
            )
        except Exception as e:
            task_logger.error(
                f"process_file_record_graph - Failed for file_id={file_id}: {e}"
            )
            db_session.execute(
                text(
                    "UPDATE file_record SET kg_stage = :stage WHERE file_id = :file_id"
                ),
                {"stage": KGStage.FAILED.value, "file_id": file_id},
            )

        db_session.commit()

    return None


def _user_file_graph_processing_queued_key(user_file_id: str) -> str:
    return f"{OnyxRedisLocks.USER_FILE_GRAPH_PROCESSING_QUEUED_PREFIX}:{user_file_id}"


@shared_task(
    name=OnyxCeleryTask.CHECK_FOR_USER_FILE_GRAPH_PROCESSING,
    soft_time_limit=300,
    bind=True,
    ignore_result=True,
)
def check_for_user_file_graph_processing(
    self: Task, *, tenant_id: str
) -> None:
    """Scan user-uploaded files with kg_stage=NOT_STARTED and enqueue per-file tasks.

    Only COMPLETED user files are eligible (indexing must be done before
    graph processing). Same three backpressure protections as the connector
    file graph processing:
    1. Queue depth backpressure
    2. Per-file queued guard (Redis SETNX)
    3. Task expiry auto-drain
    """
    task_logger.info("check_for_user_file_graph_processing - Starting")

    redis_client = get_redis_client(tenant_id=tenant_id)
    lock: RedisLock = redis_client.lock(
        OnyxRedisLocks.USER_FILE_GRAPH_PROCESSING_BEAT_LOCK,
        timeout=CELERY_GENERIC_BEAT_LOCK_TIMEOUT,
    )

    if not lock.acquire(blocking=False):
        return None

    enqueued = 0
    skipped_guard = 0
    try:
        r_celery = celery_get_broker_client(self.app)
        queue_len = celery_get_queue_length(
            OnyxCeleryQueues.GRAPH_PROCESSING, r_celery
        )
        if queue_len > GRAPH_PROCESSING_MAX_QUEUE_DEPTH:
            task_logger.warning(
                f"check_for_user_file_graph_processing - Queue depth "
                f"{queue_len} exceeds {GRAPH_PROCESSING_MAX_QUEUE_DEPTH}, "
                f"skipping enqueue for tenant={tenant_id}"
            )
            return None

        with get_session_with_current_tenant() as db_session:
            rows = db_session.execute(
                text(
                    "SELECT id FROM user_file "
                    "WHERE status = 'COMPLETED' AND kg_stage = 'not_started'"
                )
            ).fetchall()

            for row in rows:
                user_file_id = str(row[0])
                queued_key = _user_file_graph_processing_queued_key(user_file_id)
                guard_set = redis_client.set(
                    queued_key,
                    1,
                    ex=CELERY_GRAPH_PROCESSING_TASK_EXPIRES,
                    nx=True,
                )
                if not guard_set:
                    skipped_guard += 1
                    continue

                try:
                    self.app.send_task(
                        OnyxCeleryTask.PROCESS_USER_FILE_GRAPH,
                        kwargs={
                            "user_file_id": user_file_id,
                            "tenant_id": tenant_id,
                        },
                        queue=OnyxCeleryQueues.GRAPH_PROCESSING,
                        priority=OnyxCeleryPriority.MEDIUM,
                        expires=CELERY_GRAPH_PROCESSING_TASK_EXPIRES,
                    )
                except Exception:
                    redis_client.delete(queued_key)
                    raise
                enqueued += 1

    finally:
        if lock.owned():
            lock.release()

    task_logger.info(
        f"check_for_user_file_graph_processing - Enqueued {enqueued} "
        f"skipped_guard={skipped_guard} for tenant={tenant_id}"
    )
    return None


@shared_task(
    name=OnyxCeleryTask.PROCESS_USER_FILE_GRAPH,
    bind=True,
    ignore_result=True,
)
def process_user_file_graph(
    self: Task,  # noqa: ARG001
    *,
    user_file_id: str,
    tenant_id: str,
) -> None:
    """Call external graph API with S3 file info for a user-uploaded file.

    1. Set kg_stage → EXTRACTING on user_file
    2. Get file_id from user_file table
    3. Look up FileRecord to get bucket, key, display_name
    4. POST to graph API
    5. Set kg_stage → EXTRACTED (success) or FAILED (error)
    """
    task_logger.info(
        f"process_user_file_graph - Processing user_file_id={user_file_id}"
    )

    with get_session_with_current_tenant() as db_session:
        # 1. Set kg_stage = EXTRACTING
        db_session.execute(
            text(
                "UPDATE user_file SET kg_stage = :stage, "
                "kg_processing_time = :ts WHERE id = :id"
            ),
            {
                "stage": KGStage.EXTRACTING.value,
                "ts": datetime.datetime.now(datetime.timezone.utc),
                "id": UUID(user_file_id),
            },
        )

        # 2. Get file_id from user_file
        row = db_session.execute(
            text("SELECT file_id FROM user_file WHERE id = :id"),
            {"id": UUID(user_file_id)},
        ).fetchone()

        if not row:
            task_logger.warning(
                f"process_user_file_graph - No user_file found for id={user_file_id}"
            )
            db_session.commit()
            return None

        file_id = row[0]

        # 3. Look up FileRecord
        file_record = db_session.execute(
            select(FileRecord).where(FileRecord.file_id == file_id)
        ).scalar_one_or_none()

        if not file_record:
            task_logger.warning(
                f"process_user_file_graph - No file_record found for "
                f"user_file_id={user_file_id} file_id={file_id}"
            )
            db_session.execute(
                text(
                    "UPDATE user_file SET kg_stage = :stage WHERE id = :id"
                ),
                {"stage": KGStage.FAILED.value, "id": UUID(user_file_id)},
            )
            db_session.commit()
            return None

        # 4. Build and send API request
        file_type = _file_extension(file_record.display_name)

        payload = {
            "file_type": file_type,
            "objects": [
                {
                    "bucket": file_record.bucket_name,
                    "key": file_record.object_key,
                }
            ],
        }

        task_logger.info(
            f"process_user_file_graph - POST to graph API: "
            f"user_file_id={user_file_id} file_type={file_type}"
        )

        try:
            response = httpx.post(
                GRAPH_PROCESSING_API_URL,
                json=payload,
                timeout=GRAPH_PROCESSING_API_TIMEOUT,
            )
            response.raise_for_status()
            db_session.execute(
                text(
                    "UPDATE user_file SET kg_stage = :stage WHERE id = :id"
                ),
                {"stage": KGStage.EXTRACTED.value, "id": UUID(user_file_id)},
            )
            task_logger.info(
                f"process_user_file_graph - Success for user_file_id={user_file_id}"
            )
        except Exception as e:
            task_logger.error(
                f"process_user_file_graph - Failed for "
                f"user_file_id={user_file_id}: {e}"
            )
            db_session.execute(
                text(
                    "UPDATE user_file SET kg_stage = :stage WHERE id = :id"
                ),
                {"stage": KGStage.FAILED.value, "id": UUID(user_file_id)},
            )

        db_session.commit()

    return None
