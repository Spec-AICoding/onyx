# Proposal: Add Graph Processing Celery Worker

## Summary

Add a dedicated Celery worker (`graph_processing`) that invokes an external knowledge graph API for every document after it is indexed into Onyx.

## Motivation

When a document is uploaded or synced into Onyx, we want to also process it through an external knowledge graph pipeline. The graph API accepts an S3 path and handles extraction independently with its own storage. This should run asynchronously and be fully decoupled from the indexing pipeline.

## Scope

- Add a new `graph_processing` Celery worker with one task (`process_document_graph`)
- Add a Beat-orchestrated scanner (`check_for_graph_processing`) that discovers eligible documents
- Reuse the existing `document.kg_stage` column (`NOT_STARTED → EXTRACTING → EXTRACTED / FAILED`) for state tracking
- POST document S3 info (`{file_type, objects: [{bucket, key}]}`) to the external graph API
- Configure the graph API URL and worker concurrency via environment variables

## Non-Goals

- No changes to the indexing pipeline itself
- No graph results stored in Onyx (graphs stored externally)
- No modification to the existing KG extraction code in `onyx/kg/`
- No UI changes
