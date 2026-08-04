# Tasks: Extend Graph Processing to User-Uploaded Files

## 1. DB Schema Init Script
- [x] Add `kg_stage` and `kg_processing_time` columns to `user_file`
- [x] Add index on `kg_stage`
- **File**: `backend/deployment/db/add_user_file_kg_stage.sql`
- **Deploy**: Manual `psql -f` before starting updated code

## 2. Add Constants
- [x] Add `USER_FILE_GRAPH_PROCESSING_BEAT_LOCK` to `OnyxRedisLocks`
- [x] Add `USER_FILE_GRAPH_PROCESSING_LOCK_PREFIX` to `OnyxRedisLocks`
- [x] Add `USER_FILE_GRAPH_PROCESSING_QUEUED_PREFIX` to `OnyxRedisLocks`
- [x] Add `CHECK_FOR_USER_FILE_GRAPH_PROCESSING` to `OnyxCeleryTask`
- [x] Add `PROCESS_USER_FILE_GRAPH` to `OnyxCeleryTask`
- **File**: `backend/onyx/configs/constants.py`

## 3. Add Beat Task
- [x] Implement `check_for_user_file_graph_processing` — scan `user_file` for `status='COMPLETED' AND kg_stage='not_started'`
- [x] Use same three backpressure protections as connector file beat task
- **File**: `backend/onyx/background/celery/tasks/graph_processing/tasks.py`

## 4. Add Worker Task
- [x] Implement `process_user_file_graph` — raw SQL for kg_stage transitions, ORM for FileRecord lookup, POST to graph API
- [x] Use `user_file.file_id` → `FileRecord.file_id` chain (no FILE_CONNECTOR__ prefix stripping needed)
- **File**: `backend/onyx/background/celery/tasks/graph_processing/tasks.py`

## 5. Register Beat Schedule
- [x] Add `check-for-user-file-graph-processing` entry to `beat_task_templates`
- **File**: `backend/onyx/background/celery/tasks/beat_schedule.py`

## 6. Verify
- [x] All files pass `python3 -m py_compile`
- [ ] Run SQL script against target database
- [ ] Restart Celery Beat and graph_processing worker
- [ ] Upload a file via project, verify `kg_stage` transitions through states in Flower
