# Design: Graph ACL Push Pipeline

## Architecture

```
Beat Worker (existing)                      graph_acl_push Worker (new)
┌────────────────────────────┐          ┌──────────────────────────────────┐
│ check_for_graph_acl_push   │ enqueue  │ push_graph_acl                   │
│ (every GRAPH_ACL_PUSH_     │─────────▶│                                  │
│  FREQUENCY, default 30min) │ graph_   │ 1. For each source in            │
│                            │ acl_push │    GRAPH_ACL_PUSH_SOURCES:       │
└────────────────────────────┘ queue    │    SELECT ... FROM document     │
                                        │      JOIN dbccp → ccp → connector│
                                        │    WHERE last_modified > wm      │
                                        │ 2. Merge all deltas into one     │
                                        │    batch, POST /acl/sync         │
                                        │ 3. On 2xx: advance per-source    │
                                        │    watermark in graph_acl_push_  │
                                        │    state                          │
                                        └───────────────┬──────────────────┘
                                                        │ HTTP POST
                                          ┌─────────────▼──────────────┐
                                          │ magicbox-backend POST       │
                                          │ /acl/sync (idempotent)      │
                                          │ 1. MERGE :AclDocument       │
                                          │    {doc_id, emails, groups, │
                                          │     is_public, updated_at}  │
                                          │ 2. Recompute affected       │
                                          │    entities (pure Cypher)   │
                                          └─────────────────────────────┘
```

## Data Flow

1. doc_sync refreshes `document` ACL columns and bumps `document.last_modified` **only when values actually change** (existing change-detection in `ee/onyx/db/document.py`).
2. Beat fires `check_for_graph_acl_push` on the configured frequency; if `GRAPH_ACL_PUSH_ENABLED` is false, it is a no-op.
3. `push_graph_acl` queries, per whitelisted source, the documents with `last_modified > watermark` (watermark starts at 0 → first round is a full sync).
4. All deltas are merged into one batch and POSTed to `GRAPH_ACL_PUSH_URL + /acl/sync`:
   ```json
   {"docs": [{"doc_id": "https://...", "external_user_emails": [...],
              "external_user_group_ids": [...], "is_public": false}]}
   ```
5. Only on HTTP 2xx does the task advance the per-source watermark to the snapshot time (minus a 60s overlap window).
6. magicbox-backend upserts one `:AclDocument` snapshot node per doc and then recomputes affected entities:
   - affected = entities whose `biz_id` list contains any pushed `doc_id`
   - entity ACL = union of emails / union of groups / OR of `is_public` across ALL `:AclDocument` nodes referenced by the entity's `biz_id`
   - overwrite (SET), so permission narrowing takes effect and deleted/unknown docs drop out of the union naturally

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Push vs pull | **Push** (Onyx → HTTP → magicbox) | Explicit HTTP contract instead of an implicit PG schema coupling; incremental semantics (`last_modified`) live at the data source; reuses Celery scheduling/retry/observability |
| Aggregation self-sufficiency | **`:AclDocument` snapshot nodes in Neo4j** | Entity ACL is a union over ALL contributing docs; an incremental push only carries changed docs, so the receiving side must retain the rest. Snapshots keep aggregation pure-Cypher and give magicbox zero PG dependency |
| Ordering constraint | **Upsert snapshots first, then recompute** | First round must not wipe ACLs injected by ingest (Jira batch path) before its snapshot exists |
| Watermark granularity | **Per source (CONFLUENCE / JIRA), one row each** | A document can be indexed by multiple cc_pairs (document_by_connector_credential_pair is many-to-many); per-cc_pair watermarks would push the same delta twice. Aligns with the source whitelist |
| Write semantics | **Overwrite (recompute from snapshots)** | Union-only accumulation never reflects permission narrowing; recompute-from-snapshots does, and stays idempotent |
| Default state | **`GRAPH_ACL_PUSH_ENABLED=false`** | Forked upstream code must not affect the main line unless explicitly enabled |
| Failure compensation | Watermark advances only after successful POST; endpoint idempotent | Failed rounds re-push the same delta; partial writes are healed by the next round |
| Document deletion | Out of scope V1 | True doc deletion is owned by the LightRAG purge flow; ACL narrowing for surviving docs is covered by doc_sync REPLACE + recompute |

## File Changes

### Onyx (`backend/`)

New files:

| File | Purpose |
|---|---|
| `deployment/db/add_graph_acl_push_state.sql` | Idempotent DDL: `graph_acl_push_state` table |
| `onyx/db/models.py` (addition) | `GraphAclPushState` ORM model |
| `onyx/background/celery/tasks/graph_acl_push/__init__.py` | Package |
| `onyx/background/celery/tasks/graph_acl_push/tasks.py` | `check_for_graph_acl_push` + `push_graph_acl` |
| `onyx/background/celery/configs/graph_acl_push.py` | Celery config (modeled on `graph_processing`) |
| `onyx/background/celery/apps/graph_acl_push.py` | Celery app + worker signal handlers |
| `onyx/background/celery/versioned_apps/graph_acl_push.py` | App factory for `celery -A` |

Modified files:

| File | Change |
|---|---|
| `onyx/configs/constants.py` | Add `OnyxCeleryTask` entries, `OnyxCeleryQueues.GRAPH_ACL_PUSH`, Redis lock keys |
| `onyx/configs/app_configs.py` | Add `GRAPH_ACL_PUSH_ENABLED` (default false), `GRAPH_ACL_PUSH_URL`, `GRAPH_ACL_PUSH_SOURCES`, `GRAPH_ACL_PUSH_FREQUENCY` |
| `onyx/background/celery/tasks/beat_schedule.py` | Register `check_for_graph_acl_push` in `beat_task_templates` |
| `scripts/dev_run_background_jobs.py` | Add `graph_acl_push` worker process definition |

### magicbox-backend (`LightRAG/magicbox/backend/`)

New files:

| File | Purpose |
|---|---|
| `app/acl_sync.py` | Snapshot upsert + entity recompute (Cypher), ordering constraint enforced |
| `app/routers/acl.py` | `POST /acl/sync` route (no auth) |

Modified files:

| File | Change |
|---|---|
| `app/main.py` | `include_router` for the acl router |
| `app/config.py` | `ACL_SYNC_ENABLED` switch (default true, endpoint always mounted) |

## Watermark Table

```sql
CREATE TABLE IF NOT EXISTS graph_acl_push_state (
    id SERIAL PRIMARY KEY,
    source VARCHAR(64) NOT NULL UNIQUE,   -- 'CONFLUENCE', 'JIRA'
    watermark TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
    last_pushed_at TIMESTAMPTZ,
    last_error TEXT
);
```
