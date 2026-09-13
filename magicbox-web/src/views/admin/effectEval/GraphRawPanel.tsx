"use client";

import type { ReactNode } from "react";
import type {
  GraphChunk,
  GraphQueryResult,
} from "@/ee/lib/search/graphDebug";

/**
 * 9621 /query/data 原始响应面板：
 * metadata 回显（实际 mode + LightRAG 抽取关键词 + 处理统计）与
 * 实体 / 关系 / 文本块 / 引用四类原始数据，附完整 JSON 查看。
 */

/** 列表展示上限：原始数据可能很大，超出部分引导查看 JSON */
const ROW_CAP = 50;

const PROCESSING_INFO_LABELS: Record<string, string> = {
  total_entities_found: "检索到实体",
  total_relations_found: "检索到关系",
  entities_after_truncation: "截断后实体",
  relations_after_truncation: "截断后关系",
  merged_chunks_count: "合并文本块",
  final_chunks_count: "最终文本块",
};

const PROCESSING_INFO_ORDER = [
  "total_entities_found",
  "total_relations_found",
  "entities_after_truncation",
  "relations_after_truncation",
  "merged_chunks_count",
  "final_chunks_count",
];

function truncateMiddle(value: string, maxLen = 64): string {
  if (value.length <= maxLen) return value;
  const head = Math.ceil((maxLen - 3) / 2);
  return `${value.slice(0, head)}…${value.slice(-head)}`;
}

export function GraphRawPanel({ result }: { result: GraphQueryResult }) {
  const { response, durationMs } = result;
  const data = response.data;
  const metadata = response.metadata;

  const entities = data?.entities ?? [];
  const relationships = data?.relationships ?? [];
  const chunks = data?.chunks ?? [];
  const references = data?.references ?? [];

  const highLevel = metadata?.keywords?.high_level ?? [];
  const lowLevel = metadata?.keywords?.low_level ?? [];

  const processingInfo = metadata?.processing_info ?? {};
  const processingEntries = [
    ...PROCESSING_INFO_ORDER.filter((key) => key in processingInfo),
    ...Object.keys(processingInfo).filter(
      (key) => !PROCESSING_INFO_ORDER.includes(key)
    ),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 概要 + metadata 回显 */}
      <div className="flex flex-col gap-2 rounded-lg border border-border-01 bg-background-tint-00 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold text-text-01">图谱原始响应</span>
          <span className="text-text-04">{`实体 ${entities.length} · 关系 ${relationships.length} · 文本块 ${chunks.length} · 引用 ${references.length}`}</span>
          <span className="text-text-04">{`耗时 ${durationMs.toFixed(0)}ms`}</span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-text-03">{`status: ${response.status}`}</span>
          {metadata?.query_mode && (
            <span className="text-text-03">{`实际 query_mode: ${metadata.query_mode}（服务端回显，可核对参数是否生效）`}</span>
          )}
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-text-03">
            LightRAG 自行抽取关键词（非透传，来自 9621 内部 LLM 抽取）
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <KeywordChips label="high_level" values={highLevel} />
            <KeywordChips label="low_level" values={lowLevel} />
          </div>
        </div>

        {processingEntries.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-03">
            {processingEntries.map((key) => (
              <span key={key}>{`${PROCESSING_INFO_LABELS[key] ?? key}: ${processingInfo[key]}`}</span>
            ))}
          </div>
        )}
      </div>

      {/* 实体 */}
      <ResultSection
        title="实体"
        total={entities.length}
        capped={entities.length > ROW_CAP}
      >
        <EntityTable entities={entities.slice(0, ROW_CAP)} />
      </ResultSection>

      {/* 关系 */}
      <ResultSection
        title="关系"
        total={relationships.length}
        capped={relationships.length > ROW_CAP}
      >
        <RelationshipTable relationships={relationships.slice(0, ROW_CAP)} />
      </ResultSection>

      {/* 文本块 */}
      <ResultSection title="文本块" total={chunks.length} capped={chunks.length > ROW_CAP}>
        <ChunkList chunks={chunks.slice(0, ROW_CAP)} />
      </ResultSection>

      {/* 引用 */}
      <ResultSection
        title="引用文件"
        total={references.length}
        capped={references.length > ROW_CAP}
      >
        <ReferenceList references={references.slice(0, ROW_CAP)} />
      </ResultSection>

      {/* 原始 JSON */}
      <details className="rounded-lg border border-border-01 bg-background-tint-00">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-text-01">
          查看完整原始 JSON
        </summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-anywhere px-3 pb-3 text-xs text-text-03">
          {JSON.stringify(response, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function KeywordChips({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return (
      <span className="text-xs text-text-04">{`${label}: （无）`}</span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-text-04">{`${label}:`}</span>
      {values.map((keyword) => (
        <span
          key={keyword}
          className="rounded-md border border-border-01 bg-background-tint-01 px-1.5 py-0.5 text-xs text-text-03"
        >
          {keyword}
        </span>
      ))}
    </div>
  );
}

function ResultSection({
  title,
  total,
  capped,
  children,
}: {
  title: string;
  total: number;
  capped: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="text-sm">
        <span className="font-semibold text-text-01">{title}</span>
        <span className="ml-2 text-text-04">{`共 ${total} 条`}</span>
        {capped && (
          <span className="ml-2 text-text-04">{`仅展示前 ${ROW_CAP} 条，完整数据见下方 JSON`}</span>
        )}
      </div>
      {total === 0 ? (
        <div className="rounded-lg border border-border-01 bg-background-tint-00 px-3 py-2 text-sm text-text-04">
          无数据
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function EntityTable({
  entities,
}: {
  entities: { entity_name: string; entity_type: string; description: string; file_path: string | null }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-01 bg-background-tint-00">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border-01 text-text-04">
            <th className="px-2 py-1.5 font-medium">实体</th>
            <th className="px-2 py-1.5 font-medium">类型</th>
            <th className="px-2 py-1.5 font-medium">描述</th>
            <th className="px-2 py-1.5 font-medium">来源</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <tr key={entity.entity_name} className="border-b border-border-01 align-top last:border-b-0">
              <td className="px-2 py-1.5 font-medium text-text-01">{entity.entity_name}</td>
              <td className="px-2 py-1.5 text-text-03">{entity.entity_type}</td>
              <td className="line-clamp-2 max-w-md px-2 py-1.5 break-anywhere text-text-04">
                {entity.description || "-"}
              </td>
              <td className="px-2 py-1.5 break-anywhere text-text-04" title={entity.file_path ?? ""}>
                {entity.file_path ? truncateMiddle(entity.file_path) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RelationshipTable({
  relationships,
}: {
  relationships: {
    src_id: string;
    tgt_id: string;
    description: string;
    weight: number | null;
    file_path: string | null;
  }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-01 bg-background-tint-00">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border-01 text-text-04">
            <th className="px-2 py-1.5 font-medium">头实体</th>
            <th className="px-2 py-1.5 font-medium">尾实体</th>
            <th className="px-2 py-1.5 font-medium">描述</th>
            <th className="px-2 py-1.5 font-medium">权重</th>
          </tr>
        </thead>
        <tbody>
          {relationships.map((relation, index) => (
            <tr
              // src_id/tgt_id 在 KG 中按文档分桶时可能重复，回退到行序
              key={`${relation.src_id}-${relation.tgt_id}-${index}`}
              className="border-b border-border-01 align-top last:border-b-0"
            >
              <td className="max-w-[10rem] px-2 py-1.5 break-anywhere text-text-01" title={relation.src_id}>
                {truncateMiddle(relation.src_id)}
              </td>
              <td className="max-w-[10rem] px-2 py-1.5 break-anywhere text-text-01" title={relation.tgt_id}>
                {truncateMiddle(relation.tgt_id)}
              </td>
              <td className="line-clamp-2 max-w-md px-2 py-1.5 break-anywhere text-text-04">
                {relation.description || "-"}
              </td>
              <td className="px-2 py-1.5 text-text-03">
                {relation.weight === null ? "-" : relation.weight.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChunkList({ chunks }: { chunks: GraphChunk[] }) {
  return (
    <ul className="flex flex-col gap-2 rounded-lg border border-border-01 bg-background-tint-00 p-2">
      {chunks.map((chunk) => (
        <li key={chunk.reference_id} className="flex flex-col gap-1 border-b border-border-01 pb-2 last:border-b-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-04">
            <span className="min-w-0 truncate break-anywhere" title={chunk.file_path ?? ""}>
              {chunk.file_path ?? chunk.reference_id}
            </span>
            <span>{`chunk #${chunk.chunk_id}`}</span>
            {chunk.rerank_score !== null && (
              <span>{`rerank ${chunk.rerank_score.toFixed(4)}`}</span>
            )}
          </div>
          <div className="line-clamp-3 break-anywhere text-xs text-text-03">{chunk.content}</div>
        </li>
      ))}
    </ul>
  );
}

function ReferenceList({
  references,
}: {
  references: { reference_id: string; file_path: string | null }[];
}) {
  return (
    <ul className="flex flex-col gap-1 rounded-lg border border-border-01 bg-background-tint-00 p-2 text-xs text-text-03">
      {references.map((reference) => (
        <li key={reference.reference_id} className="break-anywhere">
          {reference.file_path ?? reference.reference_id}
        </li>
      ))}
    </ul>
  );
}
