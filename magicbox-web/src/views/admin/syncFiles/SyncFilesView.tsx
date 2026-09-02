"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import useSWR from "swr";

import {
  Button,
  createTableColumns,
  EmptyMessageCard,
  MessageCard,
  Pagination,
  Table,
  Text,
} from "@opal/components";
import { Section } from "@/layouts/general-layouts";
import { SettingsLayouts } from "@opal/layouts";
import { DefaultDropdown, StringOrNumberOption } from "@/components/Dropdown";
import useSyncAttemptsPaginatedFetch from "@/app/admin/connector/[ccPairId]/useSyncAttemptsPaginatedFetch";
import { useConnectorStatus } from "@/lib/hooks";
import { errorHandlingFetcher } from "@/lib/fetcher";
import { SWR_KEYS } from "@/lib/swr-keys";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { formatDateTimeLog } from "@/lib/dateUtils";

import {
  ATTEMPT_STATUS_LABELS,
  DocumentSummaryItem,
  DocumentsResponse,
  KG_STAGE_LABELS,
  SyncAttemptItem,
  SyncFileItem,
  sourceLabel,
} from "./types";

const ITEMS_PER_PAGE = 10;
const PAGES_PER_BATCH = 3;

const SELECT_CONNECTOR_PROMPT =
  "请选择连接器类型（可仅选类型）或连接器实例，点击「检索」查看对应的同步任务与批次文件；选择连接器实例后，「图谱分析」可跳转知识图谱按该实例条件分析。";

export function SyncFilesView() {
  const [selectedCcPairId, setSelectedCcPairId] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  // 点击「检索」时才提交的条件；下拉切换本身不触发任何请求
  const [searchState, setSearchState] = useState<{
    source: string | null;
    ccPairId: number | null;
  } | null>(null);

  const connectorStatusResult = useConnectorStatus();
  const allConnectors = connectorStatusResult.data ?? [];

  // 连接器类型选项（按出现顺序去重；"all" = 全部类型）
  const sourceOptions: StringOrNumberOption[] = useMemo(() => {
    const sources = Array.from(
      new Set(allConnectors.map((c) => c.connector.source))
    );
    return [
      { name: "全部类型", value: "all" },
      ...sources.map((s) => ({ name: sourceLabel(s), value: s })),
    ];
  }, [allConnectors]);

  const filteredConnectors = useMemo(
    () =>
      selectedSource === null
        ? allConnectors
        : allConnectors.filter((c) => c.connector.source === selectedSource),
    [allConnectors, selectedSource]
  );

  const router = useRouter();

  // 当前选中的连接器实例：「图谱分析」跳转需要实例名与类型
  const selectedConnector = useMemo(
    () => allConnectors.find((c) => c.cc_pair_id === selectedCcPairId) ?? null,
    [allConnectors, selectedCcPairId]
  );

  // 跳转知识图谱：深链预填 connector（图谱侧 Neo4j label 用大写）与
  // connectorName（实例名）；图谱页自动按该条件检索，无需手动点「应用」
  const handleGraphAnalysis = () => {
    const params = new URLSearchParams();
    // 未显式选类型时从实例反查类型，保证图谱页级联下拉可正常预填
    const source = selectedSource ?? selectedConnector?.connector.source ?? null;
    if (source) params.set("connector", source.toUpperCase());
    if (selectedConnector) params.set("connectorName", selectedConnector.name);
    router.push(`/admin/rag?${params.toString()}` as Route);
  };

  const connectorOptions: StringOrNumberOption[] = useMemo(
    () =>
      filteredConnectors.map((connector) => ({
        name: `${connector.name} (#${connector.cc_pair_id})`,
        // 值统一为字符串，与 DefaultDropdown 的 selected(string) 保持一致
        value: String(connector.cc_pair_id),
      })),
    [filteredConnectors]
  );

  const handleSourceSelect = (value: string | number | null) => {
    const source = value === null ? null : String(value);
    // 切换类型时清空已选连接器，重置列表
    setSelectedSource(source === null || source === "all" ? null : source);
    setSelectedCcPairId(null);
  };

  return (
    <SettingsLayouts.Root width="full">
      <SettingsLayouts.Header
        icon={ADMIN_ROUTES.SYNC_FILES.icon}
        title={ADMIN_ROUTES.SYNC_FILES.title}
        divider
      />
      <SettingsLayouts.Body>
        <Section gap={1} alignItems="stretch" height="auto">
          <Text as="p" font="secondary-body" color="text-03">
            按连接器类型与连接器查看同步任务、批次文件及其处理状态。批次文件由连接器索引任务写入对象存储；已删除的批次仍会保留（软删除语义）。
          </Text>

          <div className="flex items-center gap-3">
            <div className="w-44">
              <DefaultDropdown
                options={sourceOptions}
                selected={selectedSource}
                onSelect={handleSourceSelect}
              />
            </div>
            <div className="w-72">
              <DefaultDropdown
                options={connectorOptions}
                selected={selectedCcPairId?.toString() ?? null}
                onSelect={(value) =>
                  setSelectedCcPairId(value === null ? null : Number(value))
                }
              />
            </div>
            <Button
              disabled={selectedSource === null && selectedCcPairId === null}
              onClick={() =>
                setSearchState({
                  source: selectedSource,
                  ccPairId: selectedCcPairId,
                })
              }
            >
              检索
            </Button>
            <Button
              disabled={selectedConnector === null}
              tooltip={selectedConnector === null ? "请先选择连接器实例" : undefined}
              onClick={handleGraphAnalysis}
            >
              图谱分析
            </Button>
          </div>

          {searchState === null ? (
            <EmptyMessageCard
              sizePreset="main-ui"
              title="未选择检索条件"
              description={SELECT_CONNECTOR_PROMPT}
            />
          ) : (
            // key 确保切换检索条件时重置任务列表分页与下钻状态
            <SyncAttemptsView
              key={`${searchState.source ?? "*"}-${searchState.ccPairId ?? "*"}`}
              source={searchState.source}
              ccPairId={searchState.ccPairId}
            />
          )}
        </Section>
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}

/* ── 任务列表（连接器 → 任务 → 文件） ─────────────────────────────────── */

function SyncAttemptsView({
  source,
  ccPairId,
}: {
  source: string | null;
  ccPairId: number | null;
}) {
  const [selectedAttempt, setSelectedAttempt] =
    useState<SyncAttemptItem | null>(null);

  if (selectedAttempt !== null) {
    return (
      <Section gap={0.75} alignItems="stretch" height="auto">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="cursor-pointer text-link hover:underline"
            onClick={() => setSelectedAttempt(null)}
          >
            ← 返回任务列表
          </button>
          <Text as="span" font="main-ui-body" color="text-04">
            {`任务 #${selectedAttempt.id} · ${ATTEMPT_STATUS_LABELS[selectedAttempt.status]} · ${selectedAttempt.total_docs_indexed ?? 0} 文档 · ${selectedAttempt.file_count} 个批次文件`}
          </Text>
        </div>
        <SyncFilesTabBody
          ccPairId={selectedAttempt.cc_pair_id}
          indexAttemptId={selectedAttempt.id}
        />
      </Section>
    );
  }

  return (
    <SyncAttemptsTable
      source={source}
      ccPairId={ccPairId}
      onSelectAttempt={setSelectedAttempt}
    />
  );
}

const syncAttemptsColumns = createTableColumns<SyncAttemptItem>();

function SyncAttemptsTable({
  source,
  ccPairId,
  onSelectAttempt,
}: {
  source: string | null;
  ccPairId: number | null;
  onSelectAttempt: (attempt: SyncAttemptItem) => void;
}) {
  // filter 对象需保持引用稳定（usePaginatedFetch 以其为缓存重置依赖）
  const filter = useMemo(
    (): Record<string, string | number | boolean | string[] | Date> =>
      ccPairId !== null
        ? { cc_pair_id: ccPairId }
        : { source: source ?? "" },
    [ccPairId, source]
  );

  const result = useSyncAttemptsPaginatedFetch<SyncAttemptItem>({
    endpoint: SWR_KEYS.syncAttempts,
    swrProbeKey:
      ccPairId !== null
        ? SWR_KEYS.syncAttemptsProbe(ccPairId)
        : SWR_KEYS.syncAttemptsSourceProbe(source ?? ""),
    filter,
    itemsPerPage: ITEMS_PER_PAGE,
    pagesPerBatch: PAGES_PER_BATCH,
  });

  const columns = useMemo(
    () => [
      syncAttemptsColumns.column("id", {
        header: "任务 ID",
        weight: 10,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-01">
            {String(value)}
          </Text>
        ),
      }),
      syncAttemptsColumns.column("status", {
        header: "状态",
        weight: 13,
        enableSorting: false,
        // 失败红色；悬停显示失败原因（error_msg）
        cell: (value, row) => (
          <Text
            as="span"
            font="main-ui-body"
            color={value === "failed" ? "status-error-05" : "text-01"}
            title={row.error_msg ?? undefined}
          >
            {ATTEMPT_STATUS_LABELS[value]}
          </Text>
        ),
      }),
      syncAttemptsColumns.column("total_docs_indexed", {
        header: "文档数",
        weight: 8,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {value === null ? "—" : String(value)}
          </Text>
        ),
      }),
      syncAttemptsColumns.column("file_count", {
        header: "文件数",
        weight: 8,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {String(value)}
          </Text>
        ),
      }),
      syncAttemptsColumns.column("completed_batches", {
        header: "批次进度",
        weight: 10,
        enableSorting: false,
        cell: (value, row) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {row.total_batches === null
              ? "—"
              : `${String(value ?? 0)}/${String(row.total_batches)}`}
          </Text>
        ),
      }),
      syncAttemptsColumns.column("time_started", {
        header: "开始时间",
        weight: 15,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {value === null ? "—" : formatDateTimeLog(String(value))}
          </Text>
        ),
      }),
      syncAttemptsColumns.column("id", {
        header: "操作",
        weight: 12,
        enableSorting: false,
        cell: (value, row) =>
          row.file_count > 0 ? (
            <button
              type="button"
              className="cursor-pointer text-link hover:underline"
              onClick={() => onSelectAttempt(row)}
            >
              查看文件
            </button>
          ) : (
            <Text as="span" font="main-ui-body" color="text-04">
              —
            </Text>
          ),
      }),
    ],
    [onSelectAttempt]
  );

  if (result.applicableError) {
    return (
      <MessageCard
        variant="error"
        title="加载失败"
        description={result.applicableError.message}
      />
    );
  }
  if (result.applicableIsLoading || result.applicable === null) {
    return (
      <Section
        flexDirection="row"
        justifyContent="center"
        height="auto"
        className="min-h-64"
      >
        <Text as="p" font="secondary-body" color="text-03">
          加载中…
        </Text>
      </Section>
    );
  }
  if (result.isLoading && result.currentPageData === null) {
    return (
      <Section
        flexDirection="row"
        justifyContent="center"
        height="auto"
        className="min-h-64"
      >
        <Text as="p" font="secondary-body" color="text-03">
          加载中…
        </Text>
      </Section>
    );
  }
  if (result.error) {
    return (
      <MessageCard
        variant="error"
        title="加载失败"
        description={result.error.message}
      />
    );
  }

  const items = result.currentPageData ?? [];

  if (items.length === 0) {
    return (
      <EmptyMessageCard
        sizePreset="main-ui"
        title="暂无同步任务"
        description="该连接器尚未产生索引任务。连接器启用后按刷新周期自动创建任务；失败的任务也会在此列出。"
      />
    );
  }

  return (
    <Section gap={0.75} alignItems="stretch" height="auto">
      <Table
        data={items}
        columns={columns}
        getRowId={(row) => String(row.id)}
      />
      {result.totalPages > 1 && (
        <Section
          flexDirection="row"
          justifyContent="center"
          height="auto"
          className="pt-1"
        >
          <Pagination
            variant="list"
            currentPage={result.currentPage}
            totalPages={result.totalPages}
            onChange={result.goToPage}
          />
        </Section>
      )}
    </Section>
  );
}

/* ── 文件列表 ─────────────────────────────────────────────────────────── */

function SyncFilesTabBody({
  ccPairId,
  indexAttemptId,
}: {
  ccPairId: number;
  indexAttemptId?: number;
}) {
  // filter 对象需保持引用稳定（usePaginatedFetch 以其为缓存重置依赖）
  const filter = useMemo(() => {
    const base: Record<string, string | number | boolean | string[] | Date> = {
      cc_pair_id: ccPairId,
    };
    if (indexAttemptId !== undefined) {
      base.index_attempt_id = indexAttemptId;
    }
    return base;
  }, [ccPairId, indexAttemptId]);

  const result = useSyncAttemptsPaginatedFetch<SyncFileItem>({
    endpoint: SWR_KEYS.syncFiles,
    swrProbeKey: SWR_KEYS.syncFilesProbe(ccPairId),
    filter,
    itemsPerPage: ITEMS_PER_PAGE,
    pagesPerBatch: PAGES_PER_BATCH,
  });

  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);

  if (result.applicableError) {
    return (
      <MessageCard
        variant="error"
        title="加载失败"
        description={result.applicableError.message}
      />
    );
  }
  if (result.applicableIsLoading || result.applicable === null) {
    return (
      <Section
        flexDirection="row"
        justifyContent="center"
        height="auto"
        className="min-h-64"
      >
        <Text as="p" font="secondary-body" color="text-03">
          加载中…
        </Text>
      </Section>
    );
  }
  if (result.isLoading && result.currentPageData === null) {
    return (
      <Section
        flexDirection="row"
        justifyContent="center"
        height="auto"
        className="min-h-64"
      >
        <Text as="p" font="secondary-body" color="text-03">
          加载中…
        </Text>
      </Section>
    );
  }
  if (result.error) {
    return (
      <MessageCard
        variant="error"
        title="加载失败"
        description={result.error.message}
      />
    );
  }

  const items = result.currentPageData ?? [];

  if (items.length === 0) {
    return (
      <EmptyMessageCard
        sizePreset="main-ui"
        title="暂无同步文件"
        description="该连接器尚未同步出批次文件。批次文件由连接器索引任务写入（file_id 前缀 iab/{连接器}/），可能尚未运行或没有文档被同步。"
      />
    );
  }

  return (
    <Section gap={0.75} alignItems="stretch" height="auto">
      <SyncFilesTable
        items={items}
        expandedFileId={expandedFileId}
        onToggleExpand={(fileId) =>
          setExpandedFileId((prev) => (prev === fileId ? null : fileId))
        }
      />
      {expandedFileId !== null && (
        <FileDocumentsPanel fileId={expandedFileId} ccPairId={ccPairId} />
      )}
      {result.totalPages > 1 && (
        <Section
          flexDirection="row"
          justifyContent="center"
          height="auto"
          className="pt-1"
        >
          <Pagination
            variant="list"
            currentPage={result.currentPage}
            totalPages={result.totalPages}
            onChange={result.goToPage}
          />
        </Section>
      )}
    </Section>
  );
}

const syncFilesColumns = createTableColumns<SyncFileItem>();

function SyncFilesTable({
  items,
  expandedFileId,
  onToggleExpand,
}: {
  items: SyncFileItem[];
  expandedFileId: string | null;
  onToggleExpand: (fileId: string) => void;
}) {
  const columns = useMemo(
    () => [
      syncFilesColumns.column("file_id", {
        header: "文件 ID",
        weight: 26,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-01">
            {String(value)}
          </Text>
        ),
      }),
      syncFilesColumns.column("document_count", {
        header: "文档数",
        weight: 8,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {value === null ? "—" : String(value)}
          </Text>
        ),
      }),
      syncFilesColumns.column("created_at", {
        header: "同步时间",
        weight: 13,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {value === null ? "—" : formatDateTimeLog(String(value))}
          </Text>
        ),
      }),
      syncFilesColumns.column("processed", {
        header: "文件处理",
        weight: 9,
        enableSorting: false,
        cell: (value) => (
          <Text
            as="span"
            font="main-ui-body"
            color={value ? "text-01" : "text-04"}
          >
            {value ? "处理完成" : "未处理"}
          </Text>
        ),
      }),
      syncFilesColumns.column("kg_stage", {
        header: "图谱处理",
        weight: 9,
        enableSorting: false,
        cell: (value) => (
          <Text
            as="span"
            font="main-ui-body"
            color={value === "failed" ? "status-error-05" : "text-01"}
          >
            {value ? KG_STAGE_LABELS[value] : "—"}
          </Text>
        ),
      }),
      syncFilesColumns.column("kg_processing_time", {
        header: "图谱耗时",
        weight: 12,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {value === null ? "—" : formatDateTimeLog(String(value))}
          </Text>
        ),
      }),
      syncFilesColumns.column("file_id", {
        header: "操作",
        weight: 23,
        enableSorting: false,
        cell: (value, row) => (
          <div className="flex gap-3">
            <button
              type="button"
              className="cursor-pointer text-link hover:underline"
              onClick={() => onToggleExpand(row.file_id)}
            >
              {expandedFileId === row.file_id ? "收起详情" : "查看详情"}
            </button>
            <a
              href={SWR_KEYS.syncFileDownload(row.file_id)}
              download
              className="text-link hover:underline"
            >
              下载
            </a>
          </div>
        ),
      }),
    ],
    [expandedFileId, onToggleExpand]
  );

  return (
    <Table data={items} columns={columns} getRowId={(row) => row.id} />
  );
}

export default SyncFilesView;

/* ── 批次文件详情（读 MinIO 批次 JSON + document 表补充） ─────────────── */

function FileDocumentsPanel({
  fileId,
  ccPairId,
}: {
  fileId: string;
  ccPairId: number;
}) {
  const { data, isLoading, error } = useSWR<DocumentsResponse>(
    SWR_KEYS.syncFileDocuments(fileId),
    errorHandlingFetcher
  );

  // 「文档图谱」跳转需要实例名与类型；cc_pair_id 反查连接器
  //（SWR 缓存与页面顶部的 useConnectorStatus 共享，不产生额外请求）
  const connectorStatusResult = useConnectorStatus();
  const connector = useMemo(
    () =>
      (connectorStatusResult.data ?? []).find((c) => c.cc_pair_id === ccPairId) ??
      null,
    [connectorStatusResult.data, ccPairId]
  );

  return (
    <Section
      gap={0.5}
      alignItems="stretch"
      height="auto"
      className="rounded-lg border border-border p-3"
    >
      <Text as="h3" font="heading-h3" color="text-01">
        {`批次文件文档：${fileId}`}
      </Text>
      {isLoading && (
        <Text as="p" font="secondary-body" color="text-03">
          加载文档中…
        </Text>
      )}
      {error && (
        <MessageCard
          variant="error"
          title="文档加载失败"
          description={error.message}
        />
      )}
      {data && data.items.length === 0 && (
        <Text as="p" font="secondary-body" color="text-03">
          该批次文件不包含任何文档。
        </Text>
      )}
      {data && data.items.length > 0 && (
        <FileDocumentsTable
          items={data.items}
          connectorName={connector?.name ?? null}
          connectorSource={connector?.connector.source ?? null}
        />
      )}
    </Section>
  );
}

const documentsColumns = createTableColumns<DocumentSummaryItem>();

function FileDocumentsTable({
  items,
  connectorName,
  connectorSource,
}: {
  items: DocumentSummaryItem[];
  connectorName: string | null;
  connectorSource: string | null;
}) {
  const router = useRouter();
  const columns = useMemo(
    () => [
      documentsColumns.column("semantic_identifier", {
        header: "文档",
        weight: 20,
        enableSorting: false,
        cell: (value, row) => (
          <div className="flex flex-col gap-0.5">
            <Text as="span" font="main-ui-body" color="text-01">
              {value ?? row.id}
            </Text>
            <Text as="span" font="secondary-body" color="text-04">
              {row.id}
            </Text>
          </div>
        ),
      }),
      documentsColumns.column("link", {
        header: "链接",
        weight: 13,
        enableSorting: false,
        cell: (value) =>
          value ? (
            <a
              href={String(value)}
              target="_blank"
              rel="noreferrer"
              className="break-all text-link hover:underline"
            >
              {String(value)}
            </a>
          ) : (
            <Text as="span" font="main-ui-body" color="text-04">
              —
            </Text>
          ),
      }),
      documentsColumns.column("doc_updated_at", {
        header: "更新时间",
        weight: 9,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {value === null ? "—" : formatDateTimeLog(String(value))}
          </Text>
        ),
      }),
      documentsColumns.column("last_synced", {
        header: "索引状态",
        weight: 10,
        enableSorting: false,
        cell: (value, row) => (
          <div className="flex flex-col gap-0.5">
            <Text
              as="span"
              font="main-ui-body"
              color={value ? "text-01" : "text-04"}
            >
              {value ? "已索引" : "未索引"}
            </Text>
            {value && row.chunk_count !== null && (
              <Text as="span" font="secondary-body" color="text-04">
                {`${String(row.chunk_count)} 个分块`}
              </Text>
            )}
          </div>
        ),
      }),
      documentsColumns.column("external_user_emails", {
        header: "外部用户",
        weight: 13,
        enableSorting: false,
        cell: (value) => {
          const list = value ?? [];
          const joined = list.join(", ");
          return (
            <Text
              as="span"
              font="main-ui-body"
              color={joined ? "text-01" : "text-04"}
              maxLines={2}
              title={joined || undefined}
            >
              {joined || "—"}
            </Text>
          );
        },
      }),
      documentsColumns.column("external_user_group_ids", {
        header: "外部用户组",
        weight: 13,
        enableSorting: false,
        cell: (value) => {
          const list = value ?? [];
          const joined = list.join(", ");
          return (
            <Text
              as="span"
              font="main-ui-body"
              color={joined ? "text-01" : "text-04"}
              maxLines={2}
              title={joined || undefined}
            >
              {joined || "—"}
            </Text>
          );
        },
      }),
      documentsColumns.column("is_public", {
        header: "是否公开",
        weight: 6,
        enableSorting: false,
        cell: (value) => {
          if (value === null) {
            return (
              <Text as="span" font="main-ui-body" color="text-04">
                —
              </Text>
            );
          }
          return (
            <Text
              as="span"
              font="main-ui-body"
              color={value ? "status-success-05" : "text-02"}
            >
              {value ? "公开" : "私有"}
            </Text>
          );
        },
      }),
      documentsColumns.column("id", {
        header: "操作",
        weight: 7,
        enableSorting: false,
        cell: (value) => (
          <button
            type="button"
            className="cursor-pointer text-link hover:underline"
            onClick={() => {
              // doc = 文档 id（即图谱 biz_id）；深链预填后图谱页自动按文档检索
              const params = new URLSearchParams();
              if (connectorSource) {
                params.set("connector", connectorSource.toUpperCase());
              }
              if (connectorName) params.set("connectorName", connectorName);
              params.set("doc", String(value));
              router.push(`/admin/rag?${params.toString()}` as Route);
            }}
          >
            文档图谱
          </button>
        ),
      }),
    ],
    [connectorName, connectorSource, router]
  );

  return (
    <Table data={items} columns={columns} getRowId={(row) => row.id} />
  );
}
