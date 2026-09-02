import hashlib
import json
from datetime import datetime
from typing import Any

import httpx

from onyx.configs.app_configs import (
    GRAPH_API_AUTH_TOKEN,
    GRAPH_API_QUERY_MODE,
    GRAPH_API_SCORE_WEIGHT,
    GRAPH_API_TOP_K,
    GRAPH_API_URL,
)
from onyx.configs.constants import DocumentSource
from onyx.context.search.models import ChunkIndexRequest, InferenceChunk
from onyx.utils.logger import setup_logger

logger = setup_logger()

# Rank-based score mapping for graph chunks. The graph API's raw rerank
# scores (~0.001-0.01) are not comparable with the vector similarity scores
# (~0.2-0.8) of the regular retrieval channel, so a chunk's rank within the
# graph response is mapped onto a comparable scale: rank0 -> 0.9,
# rank1 -> 0.8, ... floored at 0.1. GRAPH_API_SCORE_WEIGHT then scales the
# mapped score to tune the graph's share of the fused ranking.
_GRAPH_RANK_TOP_SCORE = 0.9
_GRAPH_RANK_STEP = 0.1
_GRAPH_RANK_MIN_SCORE = 0.1


def _stable_chunk_int(chunk_id_str: str) -> int:
    """Return a stable int for the (document_id, chunk_id) dedup key.

    The graph API returns chunk ids like "chunk-<32-hex-hash>"; the first 8
    hex chars of the hash form a stable, collision-tolerant int. Falls back
    to md5-derived ints for any other chunk id shape.
    """
    if not chunk_id_str:
        return 0
    hex_part = chunk_id_str.rsplit("-", 1)[-1]
    if len(hex_part) >= 8:
        try:
            return int(hex_part[:8], 16)
        except ValueError:
            pass
    return int(hashlib.md5(chunk_id_str.encode("utf-8")).hexdigest()[:8], 16)


def _parse_graph_chunk_content(
    chunk: dict[str, Any], chunk_int: int
) -> tuple[str, str | None, str]:
    """Extract (document_id, source_link, semantic_identifier) from a chunk.

    For documents ingested through the onyx sync path, content is the
    serialized onyx Document JSON whose `id` field equals the onyx document
    id (the graph's biz_id). Non-JSON content (e.g. plain-text files ingested
    through the native pipeline) falls back to a stable hash-based id.
    """
    content = chunk.get("content", "")
    file_path = chunk.get("file_path", "")
    document_id = f"graph-{hashlib.md5(f'{file_path}:{chunk_int}'.encode()).hexdigest()[:16]}"
    source_link: str | None = None
    semantic_identifier = file_path

    try:
        parsed = json.loads(content)
    except (ValueError, TypeError):
        parsed = None

    if isinstance(parsed, dict):
        if parsed.get("id"):
            source_link = str(parsed["id"])
            document_id = source_link
        sem_id = parsed.get("semantic_identifier") or parsed.get("title")
        if sem_id:
            semantic_identifier = str(sem_id)

    return document_id, source_link, semantic_identifier


def _map_graph_chunk_to_inference_chunk(
    chunk: dict[str, Any], rank: int
) -> InferenceChunk:
    """Map a single graph API chunk to an InferenceChunk.

    document_id comes from the embedded onyx document JSON (`id` field, the
    document's biz_id), chunk_id is a stable int derived from the graph chunk
    hash, and the score is rank-based so graph chunks can compete with
    vector-retrieved chunks in the fused ranking.
    """
    chunk_int = _stable_chunk_int(chunk.get("chunk_id", ""))
    document_id, source_link, semantic_identifier = _parse_graph_chunk_content(
        chunk, chunk_int
    )

    rank_score = max(
        _GRAPH_RANK_MIN_SCORE,
        _GRAPH_RANK_TOP_SCORE - _GRAPH_RANK_STEP * rank,
    )
    score = rank_score * GRAPH_API_SCORE_WEIGHT

    file_path = chunk.get("file_path", "")

    # Graph chunks have no chunk-level links; cite the document itself.
    # onyx indexes links by in-chunk offset and consumers read source_links[0],
    # so the document link must sit at key 0 (see web_search/utils.py).
    source_links = {0: source_link} if source_link else None

    # The graph API does not provide per-section links, images, or section
    # continuity info. Map updated_at best-effort when the API supplies it.
    updated_at = None
    raw_updated_at = chunk.get("updated_at")
    if isinstance(raw_updated_at, str):
        try:
            updated_at = datetime.fromisoformat(raw_updated_at)
        except ValueError:
            pass

    return InferenceChunk(
        document_id=document_id,
        chunk_id=chunk_int,
        source_type=DocumentSource.GRAPH,
        semantic_identifier=semantic_identifier,
        title=semantic_identifier,
        boost=0,
        score=score,
        hidden=False,
        content=chunk.get("content", ""),
        blurb="",
        metadata={},
        match_highlights=[],
        doc_summary="",
        chunk_context="",
        is_federated=False,
        file_id=file_path,
        source_links=source_links,
        image_file_id=None,
        section_continuation=False,
        updated_at=updated_at,
    )


def search_graph(query_request: ChunkIndexRequest) -> list[InferenceChunk]:
    """Search the external graph knowledge API and return InferenceChunks.

    Called as a parallel search function in search_chunks(). Skips
    the call when GRAPH_API_URL is not configured.
    """
    if not GRAPH_API_URL:
        return []

    # The graph API runs in guest mode (auth disabled), so the token is
    # optional; attach Authorization only when configured.
    auth_token = GRAPH_API_AUTH_TOKEN

    payload: dict[str, Any] = {
        "query": query_request.query,
        "mode": GRAPH_API_QUERY_MODE,
        "top_k": GRAPH_API_TOP_K,
    }

    logger.info(
        "Graph search request: url=%s mode=%s top_k=%s query=%s",
        GRAPH_API_URL,
        GRAPH_API_QUERY_MODE,
        GRAPH_API_TOP_K,
        query_request.query[:200],
    )

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        response = httpx.post(
            GRAPH_API_URL,
            json=payload,
            headers=headers,
            timeout=30.0,
        )
        response.raise_for_status()
        logger.info(
            "Graph search response: status=%s query=%s",
            response.status_code,
            query_request.query[:200],
        )
    except httpx.HTTPError as e:
        logger.warning("Graph search HTTP error: %s", e)
        return []
    except Exception as e:
        logger.error("Graph search unexpected error: %s", e)
        return []

    try:
        data = response.json()
    except ValueError:
        logger.warning("Graph search: invalid JSON response")
        return []

    if data.get("status") != "success":
        error_msg = data.get("message", "unknown error")
        logger.warning("Graph search: API returned non-success status: %s", error_msg)
        return []

    chunks_data: list[dict[str, Any]] = data.get("data", {}).get("chunks", [])
    if not chunks_data:
        logger.info(
            "Graph search: no chunks returned for query=%s",
            query_request.query[:200],
        )
        return []

    # The graph API returns chunks ordered by rerank_score desc; re-sort
    # defensively so rank-based scoring holds regardless of graph config.
    ordered_chunks = sorted(
        chunks_data, key=lambda c: c.get("rerank_score", 0.0), reverse=True
    )

    inference_chunks: list[InferenceChunk] = []
    for rank, chunk in enumerate(ordered_chunks):
        inference_chunks.append(_map_graph_chunk_to_inference_chunk(chunk, rank))

    logger.info(
        "Graph search result: query=%s returned %d/%d chunks, samples=%s",
        query_request.query[:200],
        len(inference_chunks),
        len(chunks_data),
        [
            {
                "chunk_id": chunk.get("chunk_id"),
                "file_path": chunk.get("file_path"),
                "rerank_score": chunk.get("rerank_score"),
                "content_len": len(chunk.get("content") or ""),
                "content_preview": (chunk.get("content") or "")[:120].replace(
                    "\n", " "
                ),
            }
            for chunk in chunks_data[:3]
        ],
    )
    return inference_chunks
