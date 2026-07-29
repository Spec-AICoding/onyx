# Tasks: Add Graph Processing Celery Worker

## 1. Add Constants
- [ ] Add `GRAPH_PROCESSING` to `OnyxCeleryQueues`
- [ ] Add `CHECK_FOR_GRAPH_PROCESSING` and `PROCESS_DOCUMENT_GRAPH` to `OnyxCeleryTask`
- [ ] Add `GRAPH_PROCESSING_BEAT_LOCK`, `GRAPH_PROCESSING_LOCK_PREFIX`, `GRAPH_PROCESSING_QUEUED_PREFIX` to `OnyxRedisLocks`
- [ ] Add `GRAPH_PROCESSING_TASK_EXPIRES` and `GRAPH_PROCESSING_MAX_QUEUE_DEPTH` constants
- [ ] Add `POSTGRES_CELERY_WORKER_GRAPH_PROCESSING_APP_NAME`
- **File**: `backend/onyx/configs/constants.py`

## 2. Add App Configs
- [ ] Add `GRAPH_PROCESSING_API_URL` env var
- [ ] Add `GRAPH_PROCESSING_API_TIMEOUT` env var
- [ ] Add `CELERY_WORKER_GRAPH_PROCESSING_CONCURRENCY` env var
- **File**: `backend/onyx/configs/app_configs.py`

## 3. Create Graph Processing Tasks
- [ ] Create `backend/onyx/background/celery/tasks/graph_processing/__init__.py`
- [ ] Implement `check_for_graph_processing` (beat task: scan document table, enqueue with guard)
- [ ] Implement `process_document_graph` (worker task: lookup file_record, POST graph API, update kg_stage)
- **Files**: `tasks/graph_processing/__init__.py`, `tasks/graph_processing/tasks.py`

## 4. Create Celery Config
- [ ] Create config module reusing shared base config
- [ ] Set worker_concurrency, worker_pool, worker_prefetch_multiplier
- **File**: `backend/onyx/background/celery/configs/graph_processing.py`

## 5. Create Celery App
- [ ] Create app module with signal handlers
- [ ] Register `graph_processing` task module for autodiscovery
- **File**: `backend/onyx/background/celery/apps/graph_processing.py`

## 6. Create Versioned App Factory
- [ ] Create factory stub for `celery -A` invocation
- **File**: `backend/onyx/background/celery/versioned_apps/graph_processing.py`

## 7. Register Beat Schedule
- [ ] Add `check_for_graph_processing` entry to `beat_task_templates`
- **File**: `backend/onyx/background/celery/tasks/beat_schedule.py`

## 8. Add Worker Startup
- [ ] Add `graph_processing` worker process definition
- [ ] Add to `all_workers` list
- **File**: `backend/scripts/dev_run_background_jobs.py`

## 9. Verify
- [ ] Ensure Python imports resolve (no ModuleNotFoundError)
- [ ] Verify `process_document_graph` task constructs correct API payload
- [ ] Verify `check_for_graph_processing` scans and enqueues correctly
