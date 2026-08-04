# Design: User File Graph Processing

## Architecture

```
Beat Worker (existing)                         graph_processing Worker (existing)
┌──────────────────────────────────┐       ┌──────────────────────────────────────┐
│ check_for_graph_processing       │       │ process_document_graph               │
│ (connector files)                │       │ (connector files, unchanged)         │
│                                  │       │                                      │
│ scan document WHERE              │       ├──────────────────────────────────────┤
│   kg_stage='not_started'         │       │ process_user_file_graph (NEW)        │
│   AND id LIKE 'FILE_CONNECTOR%' │       │                                      │
├──────────────────────────────────┤       │ 1. kg_stage → EXTRACTING (raw SQL)   │
│ check_for_user_file_graph_       │enqueue│ 2. user_file.file_id → FileRecord    │
│ processing (NEW)                 │──────▶│ 3. POST graph API                    │
│                                  │  GRAPH│    {file_type, objects:              │
│ scan user_file WHERE             │_PROCE │     [{bucket, key}]}                 │
│   status='COMPLETED'             │ SSING │ 4. kg_stage → EXTRACTED/FAILED       │
│   AND kg_stage='not_started'     │       │         (raw SQL)                    │
└──────────────────────────────────┘       └──────────────────────────────────────┘
```

## Data Flow

```
User uploads file via /user/projects/file/upload
    │
    ▼
create_user_files() → INSERT user_file (ORM)
    │  kg_stage column NOT in ORM → PostgreSQL DEFAULT 'not_started'
    ▼
user_file: status=PROCESSING, kg_stage='not_started'
    │
    ▼
indexing pipeline → UserFileIndexingAdapter
    │  post_index(): status → COMPLETED
    │  kg_stage untouched ('not_started')
    ▼
user_file: status=COMPLETED, kg_stage='not_started'
    │
    ▼
check_for_user_file_graph_processing (beat, every 20s)
    │  SELECT id FROM user_file
    │  WHERE status='COMPLETED' AND kg_stage='not_started'
    ▼
enqueue process_user_file_graph(user_file_id)
    ▼
process_user_file_graph (worker)
    ├── UPDATE user_file SET kg_stage='extracting'
    ├── SELECT file_id FROM user_file WHERE id=?
    ├── SELECT * FROM file_record WHERE file_id=?
    ├── POST {file_type, objects: [{bucket, key}]}
    └── UPDATE user_file SET kg_stage='extracted' | 'failed'
```

## DB Schema Change

Standalone SQL script at `backend/deployment/db/add_user_file_kg_stage.sql`:

```sql
ALTER TABLE user_file
    ADD COLUMN IF NOT EXISTS kg_stage VARCHAR(32) DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS kg_processing_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_user_file_kg_stage
    ON user_file (kg_stage);
```

Key design decision: `DEFAULT 'not_started'` eliminates the need to set `kg_stage` in application code. Since `models.py` is NOT modified, SQLAlchemy ORM INSERTs omit the `kg_stage` column, and PostgreSQL applies the default automatically.

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `backend/deployment/db/add_user_file_kg_stage.sql` | Standalone DB init script (manual execution) |

### Modified Files

| File | Change |
|------|--------|
| `onyx/configs/constants.py` | Add `OnyxCeleryTask` entries, `OnyxRedisLocks` keys |
| `onyx/background/celery/tasks/graph_processing/tasks.py` | Add `check_for_user_file_graph_processing` + `process_user_file_graph` |
| `onyx/background/celery/tasks/beat_schedule.py` | Register new beat entry |

### NOT Modified

| File | Reason |
|------|--------|
| `onyx/db/models.py` | `kg_stage` column managed entirely via raw SQL + DB default |
| `onyx/indexing/adapters/user_file_indexing_adapter.py` | DB DEFAULT handles initialization |
| `onyx/background/celery/apps/graph_processing.py` | Task autodiscovery covers new tasks in same module |
| `onyx/background/celery/configs/graph_processing.py` | Reuses existing `GRAPH_PROCESSING` queue config |

## Backpressure Protections (same as connector file path)

1. **Beat lock** — Redis lock prevents overlapping generator runs
2. **Queue backpressure** — Skip enqueue if `GRAPH_PROCESSING` queue depth exceeds `GRAPH_PROCESSING_MAX_QUEUE_DEPTH`
3. **Per-file guard** — Redis SETNX with TTL prevents duplicate enqueue
4. **Task expiry** — `expires=60s` auto-drains stale tasks

## Edge Cases

- **Re-indexing**: `post_index()` doesn't touch `kg_stage`, so already-processed files keep their state
- **File not found in file_record**: `kg_stage = FAILED`, logged as warning
- **Graph API unreachable/timeout**: `kg_stage = FAILED`, no retry (beat re-scans NOT_STARTED on next cycle)
- **Legacy data**: `kg_stage IS NULL` rows are ignored (beat filters `kg_stage = 'not_started'`)
