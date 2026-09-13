"use client";

import type { SearchDocWithContent, SearchFullResponse } from "@/lib/search/interfaces";

/**
 * onyx 融合检索结果列表。
 *
 * 图谱通道条目在 onyx 结果中以 source_type="graph" 标记
 * （graph 不在前端 ValidSources 枚举中，故以字符串比较识别）。
 */

export const GRAPH_SOURCE_TYPE = "graph";

const SOURCE_LABELS: Record<string, string> = {
  [GRAPH_SOURCE_TYPE]: "图谱",
  jira: "Jira",
  confluence: "Confluence",
  slack: "Slack",
  google_drive: "Google Drive",
  gmail: "Gmail",
  file: "文件",
  web: "网页",
  notebook: "笔记本",
};

export function sourceLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? sourceType;
}

export function isGraphDoc(doc: Pick<SearchDocWithContent, "source_type">): boolean {
  return (doc.source_type as string) === GRAPH_SOURCE_TYPE;
}

function formatScore(score: number | null): string {
  return score === null ? "-" : score.toFixed(3);
}

interface OnyxResultListProps {
  /** 单条结果列表标题（如「图谱通道开启」） */
  title: string;
  response: SearchFullResponse;
  durationMs: number;
  /** 是否高亮图谱来源条目 */
  highlightGraph?: boolean;
}

export function OnyxResultList({
  title,
  response,
  durationMs,
  highlightGraph = false,
}: OnyxResultListProps) {
  const docs = response.search_docs ?? [];
  const graphCount = highlightGraph
    ? docs.filter((doc) => isGraphDoc(doc)).length
    : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-text-01">{title}</span>
        <span className="text-text-04">
          {`共 ${docs.length} 条结果`}
          {highlightGraph && graphCount > 0
            ? `（含图谱 ${graphCount} 条）`
            : ""}
        </span>
        <span className="text-text-04">{`耗时 ${durationMs.toFixed(0)}ms`}</span>
        {response.all_executed_queries.length > 1 && (
          <span className="text-text-04">
            {`展开查询 ${response.all_executed_queries.length - 1} 条`}
          </span>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="py-2 text-sm text-text-04">无检索结果</div>
      ) : (
        <ul className="flex flex-col">
          {docs.map((doc, index) => (
            <SearchDocRow
              key={`${doc.document_id}-${doc.chunk_ind}`}
              doc={doc}
              highlightGraph={highlightGraph}
              rank={index + 1}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchDocRow({
  doc,
  highlightGraph,
  rank,
}: {
  doc: SearchDocWithContent;
  highlightGraph: boolean;
  rank: number;
}) {
  const isGraph = isGraphDoc(doc);
  const sourceType = (doc.source_type as string) ?? "unknown";
  // 仅当该列表需要高亮图谱来源时展示标记，避免普通结果列表出现无关样式
  const showGraphBadge = highlightGraph && isGraph;

  const preview = doc.content ?? doc.blurb;

  return (
    <li className="flex flex-col gap-1 border-b border-border-01 py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-6 shrink-0 text-right text-sm text-text-04">{rank}</span>
          {showGraphBadge && (
            <span className="shrink-0 rounded-md border border-border-01 bg-background-tint-02 px-1.5 py-0.5 text-xs font-semibold text-status-error-05">
              图谱
            </span>
          )}
          <span className="shrink-0 rounded-md bg-background-tint-01 px-1.5 py-0.5 text-xs text-text-04">
            {sourceLabel(sourceType)}
          </span>
          <span
            className="truncate text-sm text-text-01"
            title={doc.semantic_identifier}
          >
            {doc.semantic_identifier || doc.document_id}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {doc.score !== null && (
            <span
              className="h-1.5 w-24 overflow-hidden rounded-full bg-background-tint-01"
              title={`score=${formatScore(doc.score)}`}
            >
              <span
                className="block h-full rounded-full bg-action-selection-05"
                style={{ width: `${Math.min(100, Math.max(0, doc.score * 100))}%` }}
              />
            </span>
          )}
          <span className="w-14 text-right text-xs text-text-03">
            {formatScore(doc.score)}
          </span>
        </div>
      </div>

      {preview && (
        <div className="line-clamp-3 break-anywhere pl-8 text-sm text-text-04">
          {preview}
        </div>
      )}

      <div className="flex items-center gap-3 pl-8 text-xs text-text-04">
        <span className="min-w-0 truncate break-anywhere" title={doc.document_id}>
          {doc.document_id}
        </span>
        {doc.updated_at && (
          <span className="shrink-0">{doc.updated_at.replace("T", " ").slice(0, 19)}</span>
        )}
        {doc.link && (
          <a
            href={doc.link}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-link hover:underline"
          >
            打开
          </a>
        )}
      </div>
    </li>
  );
}
