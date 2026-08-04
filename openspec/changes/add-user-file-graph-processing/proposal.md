# Proposal: Extend Graph Processing to User-Uploaded Files

## Summary

Extend the existing graph processing pipeline to support user-uploaded files (project file uploads), not just connector-synced `FILE_CONNECTOR__` documents.

## Motivation

The current `check_for_graph_processing` beat task only scans the `document` table for `FILE_CONNECTOR__`-prefixed entries. User-uploaded files go to a separate `user_file` table and are never picked up by graph processing. This change adds a parallel beat + worker task pair that processes `user_file` entries through the same external graph API.

## Scope

- Add `kg_stage` and `kg_processing_time` columns to the `user_file` table via standalone SQL script
- Add `check_for_user_file_graph_processing` beat task — scans `user_file` for eligible entries
- Add `process_user_file_graph` worker task — POSTs S3 info to external graph API
- Reuse the existing `GRAPH_PROCESSING` Celery queue and backpressure limits
- Register new beat schedule entry (every 20s)

## Non-Goals

- No modification to `models.py` — all DB operations on new columns use raw SQL
- No handling of legacy data (existing `user_file` rows with `kg_stage IS NULL`)
- No new Celery queue or worker — tasks share `GRAPH_PROCESSING` queue
- No UI changes
