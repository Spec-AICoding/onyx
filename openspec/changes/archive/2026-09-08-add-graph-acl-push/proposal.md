# Proposal: Add Graph ACL Push Pipeline

## Summary

Add a dedicated Celery worker (`graph_acl_push`, modeled after the `graph_processing` worker) that periodically pushes incremental ACL changes from the Onyx `document` table to a new `POST /acl/sync` endpoint on the LightRAG magicbox-backend service. The endpoint persists ACLs as snapshot nodes in Neo4j and recomputes entity ACL properties with overwrite semantics.

## Motivation

- Confluence indexing runs with `initial_index_should_sync=False`, so batch files carry `external_access=None`; the LightRAG ingest ACL injection is a no-op and graph entities end up with no ACL properties.
- The `document` table's three columns (`external_user_emails` / `external_user_group_ids` / `is_public`) are the authoritative ACL, refreshed continuously by the doc_sync pipeline. `document.last_modified` is only updated when ACL values actually change, making it a natural incremental watermark.
- A continuous sync link from Onyx's authoritative ACL to the graph is required for visibility-based filtering of graph data.

## Scope

- **Onyx**: a new `graph_acl_push` Celery worker with one task (`push_graph_acl`), a Beat-orchestrated scheduler (`check_for_graph_acl_push`), a watermark state table (hand-written DDL under `deployment/db/`), and env-configurable switches.
- **magicbox-backend (LightRAG)**: a new `POST /acl/sync` endpoint (no auth) that upserts `:AclDocument` snapshot nodes and recomputes entity ACL properties (`is_public`, `external_user_emails`, `external_user_group_ids`) for affected entities.
- First run starts from watermark 0, which naturally performs a full sync; subsequent rounds are incremental.

## Non-Goals

- Document-deletion tombstones (V1)
- Authentication on magicbox-backend
- Changes to the indexing pipeline, doc_sync, or the existing s3_routes ACL injection
- Storing graph data in Onyx
