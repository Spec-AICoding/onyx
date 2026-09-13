# Tasks: Add Graph ACL Push Pipeline

## 1. Onyx — Watermark Table & Configs

- [x] Create `backend/deployment/db/add_graph_acl_push_state.sql` (idempotent DDL: `graph_acl_push_state` with `source` unique, `watermark`, `last_pushed_at`, `last_error`)
- [x] Add `GraphAclPushState` ORM model to `backend/onyx/db/models.py`
- [x] Add `GRAPH_ACL_PUSH` to `OnyxCeleryQueues`
- [x] Add `CHECK_FOR_GRAPH_ACL_PUSH` and `PUSH_GRAPH_ACL` to `OnyxCeleryTask`
- [x] Add Redis lock keys for the beat guard (modeled on graph_processing)
- **Files**: `deployment/db/`, `onyx/db/models.py`, `onyx/configs/constants.py`

## 2. Onyx — App Configs

- [x] Add `GRAPH_ACL_PUSH_ENABLED` (default `False`)
- [x] Add `GRAPH_ACL_PUSH_URL` (magicbox-backend base URL)
- [x] Add `GRAPH_ACL_PUSH_SOURCES` (default `"CONFLUENCE,JIRA"`)
- [x] Add `GRAPH_ACL_PUSH_FREQUENCY` (default 30 minutes)
- **File**: `backend/onyx/configs/app_configs.py`

## 3. Onyx — Celery Worker

- [x] Create `backend/onyx/background/celery/tasks/graph_acl_push/__init__.py`
- [x] Implement `check_for_graph_acl_push` (beat task; no-op when disabled; enqueue `push_graph_acl`)
- [x] Implement `push_graph_acl` (per-source incremental query via document → dbccp → ccp → connector join; batch POST to `GRAPH_ACL_PUSH_URL + /acl/sync`; advance watermark only on 2xx with 60s overlap)
- [x] Create `backend/onyx/background/celery/configs/graph_acl_push.py` (modeled on `graph_processing`)
- [x] Create `backend/onyx/background/celery/apps/graph_acl_push.py`
- [x] Create `backend/onyx/background/celery/versioned_apps/graph_acl_push.py`
- **Files**: `onyx/background/celery/tasks/graph_acl_push/`, `onyx/background/celery/configs/`, `onyx/background/celery/apps/`, `onyx/background/celery/versioned_apps/`

## 4. Onyx — Registration

- [x] Register `check_for_graph_acl_push` in `beat_schedule.py` `beat_task_templates`
- [x] Add `graph_acl_push` worker process definition to `scripts/dev_run_background_jobs.py`
- **Files**: `onyx/background/celery/tasks/beat_schedule.py`, `scripts/dev_run_background_jobs.py`

## 5. magicbox-backend — ACL Sync

- [x] Create `LightRAG/magicbox/backend/app/acl_sync.py`: snapshot upsert (`MERGE :AclDocument`) followed by entity recompute (union emails / union groups / OR is_public across snapshots referenced by `biz_id`; overwrite SET); ordering constraint enforced in one batch
- [x] Create `LightRAG/magicbox/backend/app/routers/acl.py`: `POST /acl/sync` (no auth; empty batch → 200 zero counts; response `{docs_updated, entities_updated}`)
- [x] Mount router in `LightRAG/magicbox/backend/app/main.py`
- [x] Add `ACL_SYNC_ENABLED` switch to `LightRAG/magicbox/backend/app/config.py`
- **Files**: `magicbox/backend/app/acl_sync.py`, `magicbox/backend/app/routers/acl.py`, `magicbox/backend/app/main.py`, `magicbox/backend/app/config.py`

## 6. Verification

- [x] Apply `add_graph_acl_push_state.sql` to the local Onyx PG
- [x] Start magicbox-backend with the new router; smoke-test `POST /acl/sync` with an empty batch and a one-doc batch
- [x] Run one full round (watermark=epoch) with `GRAPH_ACL_PUSH_ENABLED=true`; verify `:AclDocument` snapshot nodes and entity ACL properties in Neo4j (Confluence entities gain ACL; Jira entities keep theirs)
- [x] Change one Confluence page restriction, wait for doc_sync, run the next round; verify narrowing propagates
- [x] Kill magicbox-backend, run a round, verify watermark does not advance and the next round re-pushes
