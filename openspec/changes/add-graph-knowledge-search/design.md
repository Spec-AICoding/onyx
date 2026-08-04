# Design: Graph Knowledge Search Integration

## Architecture

```
search_chunks()  ← modified
  ├── federated search (Slack etc.)
  ├── hybrid/keyword search (OpenSearch)
  ├── graph search (NEW) ── if GRAPH_API_URL is configured
  │     POST {GRAPH_API_URL}/query/data
  │     {query, mode, top_k} + Bearer auth
  │     └→ chunk[] → InferenceChunk[]
  └── combine_retrieval_results() → dedup by (doc_id, chunk_id)
```

## Data Flow

```
Graph API response:
  chunks: [{chunk_id: "doc-uuid-chunk-002", content, rerank_score, file_path}]
    ↓ _map_graph_chunk_to_inference_chunk()
  InferenceChunk: {document_id, chunk_id, content, score=rerank_score, source_type=GRAPH}
    ↓ combine_retrieval_results()
  Merged with OpenSearch results, dedup by (document_id, chunk_id), keep higher score
    ↓ SearchTool.run()
  WRRF + LLM relevance filtering + context expansion → LLM prompt
```

## Key Design Decisions

### 1. Source type: `DocumentSource.GRAPH = "graph"`
Graph search results get their own source type, enabling future filtering and tracking
without affecting existing source types.

### 2. Score mapping: `rerank_score → InferenceChunk.score`
The graph API returns a `rerank_score` per chunk. This is used directly as the
`InferenceChunk.score`, enabling fair competition with vector/kw results in
`combine_retrieval_results` and WRRF.

### 3. Deduplication by `(document_id, chunk_id)`
The graph API's `chunk_id` format (`doc-{uuid}-chunk-{num}`) maps to
`document_id=doc-{uuid}`, `chunk_id={num}`. If a graph chunk matches an OpenSearch
chunk with the same document_id and chunk_id, `combine_retrieval_results` keeps
the higher-scored one.

### 4. Optional feature gating
When `GRAPH_API_URL` is empty, graph search is silently skipped — zero overhead
and no behavioral change for existing deployments.

### 5. Loose coupling
Graph search lives in a standalone package (`graph_search/`). The only integration
point is 4 lines in `search_runner.py`. The module can be evolved independently
(caching, retry, timeouts, API versioning) without touching the rest of the pipeline.

## Configuration

| Env Variable | Default | Purpose |
|-------------|---------|---------|
| `GRAPH_API_URL` | `""` | Graph API endpoint. Empty disables graph search. |
| `GRAPH_API_AUTH_TOKEN` | `""` | Bearer token for auth header |
| `GRAPH_API_QUERY_MODE` | `"local"` | Query mode passed to graph API |
| `GRAPH_API_TOP_K` | `5` | Max results from graph API |

## Backpressure & Reliability

- Graph search runs in parallel with other searches via `run_functions_tuples_in_parallel`
- HTTP failures (timeout, 4xx, 5xx) degrade gracefully — returns empty list
- Invalid JSON or non-success API status → logged warning, returns empty list
- Malformed `chunk_id` → individual chunk skipped with warning
- Thread-safe: each call creates its own httpx request (no shared mutable state)
