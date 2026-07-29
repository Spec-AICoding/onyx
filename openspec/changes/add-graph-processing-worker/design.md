# Design: Graph Processing Celery Worker

## Architecture

```
Beat Worker (existing)                         graph_processing Worker (new)
┌───────────────────────────┐              ┌────────────────────────────────┐
│ check_for_graph_          │   enqueue    │ process_document_graph         │
│ processing (every 20s)    │ ──────────▶  │                                │
│                           │  graph_      │ 1. kg_stage → extracting        │
│ Scan document WHERE       │  processing  │ 2. Lookup file_record by        │
│   kg_stage = 'not_started'│  queue       │    document.file_id             │
│                           │              │ 3. POST graph API               │
│ Redis guard dedup         │              │    {file_type, objects:         │
│ Queue backpressure        │              │     [{bucket, key}]}            │
│ Task expiry auto-drain    │              │ 4. kg_stage → extracted/failed  │
└───────────────────────────┘              └────────────────────────────────┘
```

## Data Flow

1. Document indexed → `kg_stage` defaults to `NOT_STARTED`
2. Beat scans `document WHERE kg_stage = 'not_started'` every 20s
3. Beat enqueues `process_document_graph(document_id)` to `graph_processing` queue
4. Worker picks up task, sets `kg_stage = EXTRACTING`
5. Worker looks up `file_record` by `document.file_id` to get `{bucket_name, object_key, display_name}`
6. Worker POSTs to `GRAPH_PROCESSING_API_URL` with:
   ```json
   {
     "file_type": "docx",
     "objects": [{"bucket": "onyx-file-store-bucket", "key": "onyx-files/..."}]
   }
   ```
7. On success: `kg_stage = EXTRACTED`; on failure: `kg_stage = FAILED`

## File Changes

### New Files (5)

| File | Purpose |
|------|---------|
| `celery/tasks/graph_processing/__init__.py` | Package |
| `celery/tasks/graph_processing/tasks.py` | `check_for_graph_processing` + `process_document_graph` |
| `celery/configs/graph_processing.py` | Celery config (broker, concurrency, etc.) |
| `celery/apps/graph_processing.py` | Celery app + worker signal handlers |
| `celery/versioned_apps/graph_processing.py` | App factory for `celery -A` |

All paths relative to `backend/onyx/background/`.

### Modified Files (4)

| File | Change |
|------|--------|
| `configs/constants.py` | Add `OnyxCeleryTask` entries, `OnyxCeleryQueues.GRAPH_PROCESSING`, `OnyxRedisLocks` keys |
| `configs/app_configs.py` | Add `GRAPH_PROCESSING_API_URL`, `GRAPH_PROCESSING_API_TIMEOUT`, concurrency, queue depth |
| `celery/tasks/beat_schedule.py` | Register `check_for_graph_processing` in `beat_task_templates` |
| `scripts/dev_run_background_jobs.py` | Add `graph_processing` worker process definition |

## Beat Task: check_for_graph_processing

Follows the same three-protection pattern as `check_user_file_processing`:

1. **Beat lock** — Redis lock prevents overlapping generator runs
2. **Queue backpressure** — Skip enqueue if `graph_processing` queue depth exceeds `GRAPH_PROCESSING_MAX_QUEUE_DEPTH`
3. **Per-document guard** — Redis SETNX with TTL prevents duplicate enqueue
4. **Task expiry** — `expires=GRAPH_PROCESSING_TASK_EXPIRES` auto-drains stale tasks

## Worker Task: process_document_graph

```python
@shared_task(name=OnyxCeleryTask.PROCESS_DOCUMENT_GRAPH)
def process_document_graph(*, document_id: str, tenant_id: str) -> None:
    # 1. Set kg_stage = EXTRACTING
    # 2. Lookup file_record by document.file_id (join document → file_record)
    # 3. Extract file extension from display_name
    # 4. HTTP POST to GRAPH_PROCESSING_API_URL
    # 5. On success: kg_stage = EXTRACTED; on error: kg_stage = FAILED
```

## Configuration (app_configs.py)

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAPH_PROCESSING_API_URL` | `""` | External graph API endpoint |
| `GRAPH_PROCESSING_API_TIMEOUT` | `300` | Request timeout in seconds |
| `GRAPH_PROCESSING_MAX_QUEUE_DEPTH` | `500` | Max tasks allowed in queue |
| `GRAPH_PROCESSING_TASK_EXPIRES` | `60` | Task expiry in seconds |
| `CELERY_WORKER_GRAPH_PROCESSING_CONCURRENCY` | `2` | Worker thread count |

## Error Handling

- Graph API unreachable → `kg_stage = FAILED`, log and return (no retry in this worker — Beat will re-scan NOT_STARTED docs on next cycle)
- File not found in `file_record` → `kg_stage = FAILED`, log warning
- HTTP timeout → `kg_stage = FAILED`

## Startup

Add to `dev_run_background_jobs.py`:

```python
cmd_worker_graph_processing = [
    "celery", "-A", "onyx.background.celery.versioned_apps.graph_processing",
    "worker", "--pool=threads",
    "--concurrency=2", "--prefetch-multiplier=1",
    "--loglevel=INFO", "--hostname=graph_processing@%n",
    "-Q", "graph_processing",
]
```
