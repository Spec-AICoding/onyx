/**
 * LightRAG 图谱原始查询客户端 ——「效果评测」页使用。
 *
 * 请求经 next.config.js 的 /lightrag-api rewrite 转发到 9621（同源代理），
 * 不经过 onyx 后端，因此可与 onyx 融合通道（/api/search）平行对照，
 * 观察图谱通道的真实入参/出参（含 LightRAG 自行抽取的关键词等）。
 */

export type GraphQueryMode = "local" | "global" | "hybrid" | "mix" | "naive";

export interface GraphQueryParams {
  mode: GraphQueryMode;
  top_k: number;
  chunk_top_k: number;
  enable_rerank: boolean;
}

export interface GraphEntity {
  entity_name: string;
  entity_type: string;
  description: string;
  source_id: string;
  file_path: string | null;
  created_at: string | null;
}

export interface GraphRelationship {
  src_id: string;
  tgt_id: string;
  description: string;
  keywords: string;
  weight: number | null;
  source_id: string;
  file_path: string | null;
  created_at: string | null;
}

export interface GraphChunk {
  reference_id: string;
  content: string;
  file_path: string | null;
  chunk_id: number;
  rerank_score: number | null;
}

export interface GraphReference {
  reference_id: string;
  file_path: string | null;
}

export interface GraphRawData {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  chunks: GraphChunk[];
  references: GraphReference[];
}

/** 9621 /query/data 的 metadata：回显实际入参 + LightRAG 抽取的关键词 */
export interface GraphQueryMetadata {
  query_mode: string;
  keywords?: { high_level?: string[] | null; low_level?: string[] | null };
  processing_info?: Record<string, number>;
}

export interface GraphRawResponse {
  status: string;
  message?: string;
  data?: GraphRawData;
  metadata?: GraphQueryMetadata;
}

export interface TimedResult {
  durationMs: number;
}

export interface GraphQueryResult extends TimedResult {
  response: GraphRawResponse;
}

export const GRAPH_QUERY_MODES: GraphQueryMode[] = [
  "local",
  "global",
  "hybrid",
  "mix",
  "naive",
];

export const GRAPH_MODE_LABELS: Record<GraphQueryMode, string> = {
  local: "实体局部（local）",
  global: "社区全局（global）",
  hybrid: "局部 + 全局（hybrid）",
  mix: "图谱 + 向量（mix）",
  naive: "纯向量（naive）",
};

/** 图谱原始响应 body：直接透传查询参数，不注入 hl/ll 关键词（让 LightRAG 自行抽取） */
interface GraphQueryBody extends GraphQueryParams {
  query: string;
}

/**
 * 直连 LightRAG 9621 /query/data（非流式）。
 * 抛错信息带 HTTP 状态与后端 detail（若有）。
 */
export async function runGraphQuery(
  query: string,
  params: GraphQueryParams,
  signal?: AbortSignal
): Promise<GraphQueryResult> {
  const startedAt = performance.now();

  const body: GraphQueryBody = {
    query,
    mode: params.mode,
    top_k: params.top_k,
    chunk_top_k: params.chunk_top_k,
    enable_rerank: params.enable_rerank,
  };

  const response = await fetch("/lightrag-api/query/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = (await response.json()) as { detail?: string };
      detail = errorBody.detail ?? "";
    } catch {
      // 非 JSON 错误体，忽略
    }
    throw new Error(
      `图谱查询失败（HTTP ${response.status}${detail ? `: ${detail}` : ""}）`
    );
  }

  const json = (await response.json()) as GraphRawResponse;
  return { response: json, durationMs: performance.now() - startedAt };
}
