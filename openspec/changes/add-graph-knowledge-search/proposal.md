# Proposal: Add External Graph Knowledge Search to Retrieval Pipeline

## Issues to Address

The existing Onyx search pipeline only retrieves results from OpenSearch (hybrid/keyword)
and federated connectors (Slack). An external graph knowledge search service provides
entity-aware retrieval that can surface relevant document chunks alongside structured
entity/relationship knowledge. This change integrates that external service into the
search pipeline with minimal intrusion.

## Approach

Add graph search as an optional, parallel retrieval source in `search_chunks()`.
Results are mapped to `InferenceChunk` and merged with existing results via
`combine_retrieval_results`, which deduplicates by `(document_id, chunk_id)` keeping
the higher score.

Configuration is environment-variable driven. When `GRAPH_API_URL` is not set, the
graph search is silently skipped — no disruption to existing behavior.

## File Changes

| File | Operation | Description |
|------|-----------|-------------|
| `backend/onyx/configs/app_configs.py` | Modify | Add `GRAPH_API_URL`, `GRAPH_API_AUTH_TOKEN`, `GRAPH_API_QUERY_MODE`, `GRAPH_API_TOP_K` |
| `backend/onyx/configs/constants.py` | Modify | Add `GRAPH = "graph"` to `DocumentSource` enum |
| `backend/onyx/context/search/graph_search/__init__.py` | Create | Package init |
| `backend/onyx/context/search/graph_search/graph_knowledge_search.py` | Create | HTTP call + `InferenceChunk` mapping |
| `backend/onyx/context/search/retrieval/search_runner.py` | Modify | Wire graph search into `search_chunks()` |
