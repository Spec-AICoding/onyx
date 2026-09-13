"use client";

import type { SearchDocWithContent, SearchFullResponse } from "@/lib/search/interfaces";
import { isGraphDoc, sourceLabel } from "./OnyxResultList";

/**
 * 「图谱通道开 vs 关」差异对比：
 * 同一查询在 disable_graph_search=false / true 下各执行一次，
 * 以 document_id 归并对齐（同一文档取 score 最高的一条），
 * 给出 仅图谱开侧独有 / 两侧共有（含双评分）/ 仅图谱关侧独有 三类。
 *
 * 注意：图谱开侧的图谱来源条目并不必然只出现在开侧——
 * 图谱文档若与向量库文档共享 document_id，关闭图谱后仍可能命中（融合打分差异）。
 */

interface ComparisonRow {
  doc: SearchDocWithContent;
  onScore: number | null;
  offScore: number | null;
}

function formatScore(score: number | null): string {
  return score === null ? "-" : score.toFixed(3);
}

/** 同一 document_id 可能对应多条 chunk 结果，取 score 最高的一条代表该文档 */
function pickTopDocByDocumentId(
  docs: SearchDocWithContent[]
): Map<string, SearchDocWithContent> {
  const picked = new Map<string, SearchDocWithContent>();
  for (const doc of docs) {
    const existing = picked.get(doc.document_id);
    if (!existing || (doc.score ?? -Infinity) > (existing.score ?? -Infinity)) {
      picked.set(doc.document_id, doc);
    }
  }
  return picked;
}

interface ComparisonPanelProps {
  graphOnResponse: SearchFullResponse;
  graphOffResponse: SearchFullResponse;
  graphOnDurationMs: number;
  graphOffDurationMs: number;
}

export function ComparisonPanel({
  graphOnResponse,
  graphOffResponse,
  graphOnDurationMs,
  graphOffDurationMs,
}: ComparisonPanelProps) {
  const onMap = pickTopDocByDocumentId(graphOnResponse.search_docs ?? []);
  const offMap = pickTopDocByDocumentId(graphOffResponse.search_docs ?? []);

  // 仅图谱开侧独有（图谱通道贡献的新增文档）
  const onlyOn: ComparisonRow[] = Array.from(onMap.entries())
    .filter(([docId]) => !offMap.has(docId))
    .map(([, doc]) => ({ doc, onScore: doc.score, offScore: null }))
    .sort((a, b) => (b.onScore ?? 0) - (a.onScore ?? 0));

  // 仅图谱关侧独有（开侧被图谱通道挤出，或排序抖动）
  const onlyOff: ComparisonRow[] = Array.from(offMap.entries())
    .filter(([docId]) => !onMap.has(docId))
    .map(([, doc]) => ({ doc, onScore: null, offScore: doc.score }))
    .sort((a, b) => (b.offScore ?? 0) - (a.offScore ?? 0));

  // 两侧共有：展示开/关双评分与差值
  const common: ComparisonRow[] = Array.from(onMap.entries())
    .filter(([docId]) => offMap.has(docId))
    .map(([docId, doc]) => ({
      doc,
      onScore: doc.score,
      offScore: offMap.get(docId)?.score ?? null,
    }))
    .sort((a, b) => (b.onScore ?? 0) - (a.onScore ?? 0));

  const graphSourceCountInOn = Array.from(onMap.values())
    .filter((doc) => isGraphDoc(doc))
    .length;

  const deltaLabel = (row: ComparisonRow): string | null => {
    if (row.onScore === null || row.offScore === null) return null;
    const delta = row.onScore - row.offScore;
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 概要统计 */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-border-01 bg-background-tint-00 p-3 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-semibold text-text-01">差异总览</span>
          <span className="text-text-04">{`图谱开 ${onMap.size} 篇 · 图谱关 ${offMap.size} 篇`}</span>
          <span className="text-text-04">{`仅开侧独有 ${onlyOn.length} 篇 · 仅关侧独有 ${onlyOff.length} 篇 · 共有 ${common.length} 篇`}</span>
          <span className="text-text-04">{`开侧含图谱来源 ${graphSourceCountInOn} 篇`}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-text-04">
          <span>{`开侧耗时 ${graphOnDurationMs.toFixed(0)}ms`}</span>
          <span>{`关侧耗时 ${graphOffDurationMs.toFixed(0)}ms`}</span>
        </div>
        {onlyOn.length === graphSourceCountInOn ? (
          <div className="text-text-03">
            「仅开侧独有」与图谱来源条目数量一致：图谱通道贡献可独立识别。
          </div>
        ) : (
          <div className="text-text-03">
            「仅开侧独有」（{onlyOn.length}）与图谱来源条目（{graphSourceCountInOn}）不一致：
            部分图谱文档与向量索引共享 document_id，关闭图谱通道后仍可能以普通条目命中。
          </div>
        )}
      </div>

      {/* 仅图谱开侧独有 */}
      <section className="flex flex-col gap-1.5">
        <div className="text-sm">
          <span className="font-semibold text-text-01">仅图谱开侧独有（图谱通道新增）</span>
          <span className="ml-2 text-text-04">{`${onlyOn.length} 篇`}</span>
        </div>
        {onlyOn.length === 0 ? (
          <EmptyNotice text="无独有文档：图谱通道未引入新文档" />
        ) : (
          <ComparisonRowList rows={onlyOn} side="on" />
        )}
      </section>

      {/* 两侧共有（双评分） */}
      <section className="flex flex-col gap-1.5">
        <div className="text-sm">
          <span className="font-semibold text-text-01">两侧共有（评分对比）</span>
          <span className="ml-2 text-text-04">{`${common.length} 篇`}</span>
        </div>
        {common.length === 0 ? (
          <EmptyNotice text="无共有文档" />
        ) : (
          <ul className="flex flex-col rounded-lg border border-border-01 bg-background-tint-00">
            {common.map((row, index) => {
              const delta = deltaLabel(row);
              return (
                <li
                  key={row.doc.document_id}
                  className="flex flex-col gap-1 border-b border-border-01 px-3 py-2 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-xs text-text-04">{index + 1}</span>
                    {isGraphDoc(row.doc) && <GraphBadge />}
                    <span className="shrink-0 rounded-md bg-background-tint-01 px-1.5 py-0.5 text-xs text-text-04">
                      {sourceLabel((row.doc.source_type as string) ?? "unknown")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text-01" title={row.doc.semantic_identifier}>
                      {row.doc.semantic_identifier || row.doc.document_id}
                    </span>
                    <span className="shrink-0 text-xs text-text-03">
                      {`开 ${formatScore(row.onScore)} → 关 ${formatScore(row.offScore)}`}
                    </span>
                    {delta !== null && (
                      <span
                        className={`shrink-0 text-xs font-semibold ${
                          delta.startsWith("-") ? "text-status-error-05" : "text-status-success-05"
                        }`}
                      >
                        {`Δ${delta}`}
                      </span>
                    )}
                  </div>
                  {row.doc.blurb && (
                    <div className="line-clamp-2 pl-6 break-anywhere text-xs text-text-04">{row.doc.blurb}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 仅图谱关侧独有 */}
      <section className="flex flex-col gap-1.5">
        <div className="text-sm">
          <span className="font-semibold text-text-01">仅图谱关侧独有</span>
          <span className="ml-2 text-text-04">{`${onlyOff.length} 篇`}</span>
        </div>
        {onlyOff.length === 0 ? (
          <EmptyNotice text="无独有文档：关闭图谱通道未出现额外文档" />
        ) : (
          <ComparisonRowList rows={onlyOff} side="off" />
        )}
      </section>
    </div>
  );
}

function GraphBadge() {
  return (
    <span className="shrink-0 rounded-md border border-border-01 bg-background-tint-02 px-1.5 py-0.5 text-xs font-semibold text-status-error-05">
      图谱
    </span>
  );
}

function EmptyNotice({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border-01 bg-background-tint-00 px-3 py-2 text-sm text-text-04">
      {text}
    </div>
  );
}

function ComparisonRowList({
  rows,
  side,
}: {
  rows: ComparisonRow[];
  side: "on" | "off";
}) {
  return (
    <ul className="flex flex-col rounded-lg border border-border-01 bg-background-tint-00">
      {rows.map((row, index) => (
        <li
          key={row.doc.document_id}
          className="flex flex-col gap-1 border-b border-border-01 px-3 py-2 last:border-b-0"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-xs text-text-04">{index + 1}</span>
            {isGraphDoc(row.doc) && <GraphBadge />}
            <span className="shrink-0 rounded-md bg-background-tint-01 px-1.5 py-0.5 text-xs text-text-04">
              {sourceLabel((row.doc.source_type as string) ?? "unknown")}
            </span>
            <span className="min-w-0 flex-1 truncate text-text-01" title={row.doc.semantic_identifier}>
              {row.doc.semantic_identifier || row.doc.document_id}
            </span>
            <span className="shrink-0 text-xs text-text-03">
              {side === "on"
                ? `图谱开评分 ${formatScore(row.onScore)}`
                : `图谱关评分 ${formatScore(row.offScore)}`}
            </span>
          </div>
          {row.doc.blurb && (
            <div className="line-clamp-2 pl-6 break-anywhere text-xs text-text-04">{row.doc.blurb}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
