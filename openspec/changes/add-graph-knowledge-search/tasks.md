# Tasks: Add External Graph Knowledge Search

- [x] Add `GRAPH_API_URL`, `GRAPH_API_AUTH_TOKEN`, `GRAPH_API_QUERY_MODE`, `GRAPH_API_TOP_K` to `backend/onyx/configs/app_configs.py`
- [x] Add `GRAPH = "graph"` to `DocumentSource` enum in `backend/onyx/configs/constants.py`
- [x] Create `backend/onyx/context/search/graph_search/` package with `__init__.py` and `graph_knowledge_search.py`
- [x] Wire `search_graph()` into `search_chunks()` in `backend/onyx/context/search/retrieval/search_runner.py`
- [ ] Run `python -c "from onyx.context.search.graph_search.graph_knowledge_search import search_graph"` to verify imports
- [ ] Integration test: configure env vars, make a search query, verify graph results appear in pipeline
