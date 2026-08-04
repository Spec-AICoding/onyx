import re
from datetime import datetime
from typing import Any

import httpx

from onyx.configs.app_configs import (
    GRAPH_API_AUTH_TOKEN,
    GRAPH_API_QUERY_MODE,
    GRAPH_API_TOP_K,
    GRAPH_API_URL,
)
from onyx.configs.constants import DocumentSource
from onyx.context.search.models import ChunkIndexRequest, InferenceChunk
from onyx.utils.logger import setup_logger

logger = setup_logger()

# Pattern to parse chunk_id: "doc-{document_id}-chunk-{chunk_num}"
_CHUNK_ID_PATTERN = re.compile(r"^(doc-.+)-chunk-(\d+)$")


def _map_graph_chunk_to_inference_chunk(
    chunk: dict[str, Any], chunk_index: int
) -> InferenceChunk | None:
    """Map a single graph API chunk to an InferenceChunk.

    Returns None if the chunk_id cannot be parsed.
    """
    chunk_id_str = chunk.get("chunk_id", "")
    match = _CHUNK_ID_PATTERN.match(chunk_id_str)
    if not match:
        logger.warning(
            "Graph search: could not parse chunk_id %s, skipping chunk", chunk_id_str
        )
        return None

    document_id = match.group(1)
    chunk_int = int(match.group(2))

    file_path = chunk.get("file_path", "")
    rerank_score = chunk.get("rerank_score", 0.0)

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
        semantic_identifier=file_path,
        title=file_path,
        boost=0,
        score=float(rerank_score),
        hidden=False,
        content=chunk.get("content", ""),
        blurb="",
        metadata={},
        match_highlights=[],
        doc_summary="",
        chunk_context="",
        is_federated=False,
        file_id=file_path,
        source_links=None,
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

    auth_token = GRAPH_API_AUTH_TOKEN
    if not auth_token:
        logger.warning("Graph search: GRAPH_API_AUTH_TOKEN not configured, skipping")
        return []

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

    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}",
    }

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

    inference_chunks: list[InferenceChunk] = []
    for chunk in chunks_data:
        mapped = _map_graph_chunk_to_inference_chunk(chunk, len(inference_chunks))
        if mapped is not None:
            inference_chunks.append(mapped)

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
