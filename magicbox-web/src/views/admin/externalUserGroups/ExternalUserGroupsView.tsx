"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  createTableColumns,
  EmptyMessageCard,
  MessageCard,
  Pagination,
  Table,
  Tabs,
  Text,
} from "@opal/components";
import { Section } from "@/layouts/general-layouts";
import { DefaultDropdown, StringOrNumberOption } from "@/components/Dropdown";
import useSyncAttemptsPaginatedFetch from "@/app/admin/connector/[ccPairId]/useSyncAttemptsPaginatedFetch";
import { useConnectorStatus } from "@/lib/hooks";
import { errorHandlingFetcher } from "@/lib/fetcher";
import { SWR_KEYS } from "@/lib/swr-keys";

import {
  ExternalGroupItem,
  ExternalGroupMembersResponse,
  NOT_APPLICABLE_REASON_MESSAGES,
  PublicExternalGroupItem,
  PublicExternalGroupResponse,
} from "./types";

enum ExternalGroupsTab {
  MAPPINGS = "mappings",
  PUBLIC = "public",
}

const ITEMS_PER_PAGE = 10;
const PAGES_PER_BATCH = 3;

const SELECT_CONNECTOR_PROMPT = "请先选择连接器，再查看对应的外部用户组数据。";
const PUBLIC_EMPTY_DESCRIPTION =
  "该连接器没有公开外部组。仅 Google Drive（“任何知道链接的人”/“网域内所有人”）会写入公开外部组。";

export function ExternalUserGroupsView() {
  const [tab, setTab] = useState<ExternalGroupsTab>(ExternalGroupsTab.MAPPINGS);
  const [selectedCcPairId, setSelectedCcPairId] = useState<number | null>(null);

  const connectorStatusResult = useConnectorStatus();
  const connectorOptions: StringOrNumberOption[] = useMemo(
    () =>
      (connectorStatusResult.data ?? []).map((connector) => ({
        name: `${connector.name} (#${connector.cc_pair_id})`,
        // 值统一为字符串，与 DefaultDropdown 的 selected(string) 保持一致
        value: String(connector.cc_pair_id),
      })),
    [connectorStatusResult.data]
  );

  return (
    <Section gap={1} alignItems="stretch" height="auto" className="p-4">
      <Text as="h2" font="heading-h2" color="text-01">
        外部用户组
      </Text>
      <Text as="p" font="secondary-body" color="text-03">
        按连接器查看由源系统同步过来的外部用户组及其成员。数据来自连接器的外部权限同步（访问模式 SYNC）。
      </Text>

      <div className="w-72">
        <DefaultDropdown
          options={connectorOptions}
          selected={selectedCcPairId?.toString() ?? null}
          onSelect={(value) =>
            setSelectedCcPairId(value === null ? null : Number(value))
          }
        />
      </div>

      {selectedCcPairId === null ? (
        <EmptyMessageCard
          sizePreset="main-ui"
          title="未选择连接器"
          description={SELECT_CONNECTOR_PROMPT}
        />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as ExternalGroupsTab)}
        >
          <Tabs.List>
            <Tabs.Trigger value={ExternalGroupsTab.MAPPINGS}>
              用户-组映射
            </Tabs.Trigger>
            <Tabs.Trigger value={ExternalGroupsTab.PUBLIC}>
              公开外部组
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value={ExternalGroupsTab.MAPPINGS}>
            <GroupMappingsTabBody ccPairId={selectedCcPairId} />
          </Tabs.Content>
          <Tabs.Content value={ExternalGroupsTab.PUBLIC}>
            <PublicGroupsTabBody ccPairId={selectedCcPairId} />
          </Tabs.Content>
        </Tabs>
      )}
    </Section>
  );
}

/* ── Tab1：用户-组映射（按组聚合 + 展开成员） ─────────────────────────── */

function GroupMappingsTabBody({ ccPairId }: { ccPairId: number }) {
  // filter 对象需保持引用稳定（usePaginatedFetch 以其为缓存重置依赖）
  const filter = useMemo(() => ({ cc_pair_id: ccPairId }), [ccPairId]);

  const result = useSyncAttemptsPaginatedFetch<ExternalGroupItem>({
    endpoint: SWR_KEYS.externalUserGroups,
    swrProbeKey: SWR_KEYS.externalUserGroupsProbe(ccPairId),
    filter,
    itemsPerPage: ITEMS_PER_PAGE,
    pagesPerBatch: PAGES_PER_BATCH,
  });

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

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
  if (result.applicable === false) {
    const reasonKey =
      result.applicableReason === "unsupported_source" ||
      result.applicableReason === "not_synced"
        ? result.applicableReason
        : "not_synced";
    return (
      <MessageCard
        variant="info"
        title="不适用"
        description={NOT_APPLICABLE_REASON_MESSAGES[reasonKey]}
      />
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
        title="暂无外部用户组"
        description="该连接器尚未同步出外部用户组数据。外部组由连接器的外部权限同步任务写入，可能尚未运行或源系统没有组。"
      />
    );
  }

  return (
    <Section gap={0.75} alignItems="stretch" height="auto">
      <GroupMappingsTable
        items={items}
        expandedGroupId={expandedGroupId}
        onToggleExpand={(groupId) =>
          setExpandedGroupId((prev) => (prev === groupId ? null : groupId))
        }
      />
      {expandedGroupId !== null && (
        <GroupMembersPanel ccPairId={ccPairId} groupId={expandedGroupId} />
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

const mappingsColumns = createTableColumns<ExternalGroupItem>();

function GroupMappingsTable({
  items,
  expandedGroupId,
  onToggleExpand,
}: {
  items: ExternalGroupItem[];
  expandedGroupId: string | null;
  onToggleExpand: (groupId: string) => void;
}) {
  const columns = useMemo(
    () => [
      mappingsColumns.column("external_user_group_id", {
        header: "外部用户组",
        weight: 55,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-01">
            {String(value)}
          </Text>
        ),
      }),
      mappingsColumns.column("member_count", {
        header: "成员数",
        weight: 15,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {String(value)}
          </Text>
        ),
      }),
      mappingsColumns.column("stale", {
        header: "Stale",
        weight: 10,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {value ? "是" : "否"}
          </Text>
        ),
      }),
      mappingsColumns.column("external_user_group_id", {
        header: "成员",
        weight: 20,
        enableSorting: false,
        cell: (value, row) => (
          <button
            type="button"
            className="cursor-pointer text-link hover:underline"
            onClick={() => onToggleExpand(row.external_user_group_id)}
          >
            {expandedGroupId === row.external_user_group_id
              ? "收起成员"
              : "查看成员"}
          </button>
        ),
      }),
    ],
    [expandedGroupId, onToggleExpand]
  );

  return (
    <Table data={items} columns={columns} getRowId={(row) => row.id} />
  );
}

function GroupMembersPanel({
  ccPairId,
  groupId,
}: {
  ccPairId: number;
  groupId: string;
}) {
  const { data, isLoading, error } = useSWR<ExternalGroupMembersResponse>(
    SWR_KEYS.externalUserGroupMembers(ccPairId, groupId),
    errorHandlingFetcher
  );

  return (
    <Section
      gap={0.5}
      alignItems="stretch"
      height="auto"
      className="rounded-lg border border-border p-3"
    >
      <Text as="h3" font="heading-h3" color="text-01">
        {`组成员：${groupId}`}
      </Text>
      {isLoading && (
        <Text as="p" font="secondary-body" color="text-03">
          加载成员中…
        </Text>
      )}
      {error && (
        <MessageCard
          variant="error"
          title="成员加载失败"
          description={error.message}
        />
      )}
      {data && data.emails.length === 0 && (
        <Text as="p" font="secondary-body" color="text-03">
          该组没有非过期成员记录。
        </Text>
      )}
      {data && data.emails.length > 0 && (
        <ul className="list-disc pl-5">
          {data.emails.map((email) => (
            <li key={email}>
              <Text as="span" font="secondary-body" color="text-04">
                {email}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── Tab2：公开外部组 ─────────────────────────────────────────────────── */

function PublicGroupsTabBody({ ccPairId }: { ccPairId: number }) {
  const { data, isLoading, error } = useSWR<PublicExternalGroupResponse>(
    SWR_KEYS.externalUserGroupsPublic(ccPairId),
    errorHandlingFetcher
  );

  if (error) {
    return (
      <MessageCard
        variant="error"
        title="加载失败"
        description={error.message}
      />
    );
  }
  if (isLoading || !data) {
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
  if (!data.applicable) {
    return (
      <MessageCard
        variant="info"
        title="不适用"
        description={
          data.reason
            ? NOT_APPLICABLE_REASON_MESSAGES[data.reason]
            : NOT_APPLICABLE_REASON_MESSAGES.not_synced
        }
      />
    );
  }
  if (data.items.length === 0) {
    return (
      <EmptyMessageCard
        sizePreset="main-ui"
        title="暂无公开外部组"
        description={PUBLIC_EMPTY_DESCRIPTION}
      />
    );
  }

  return <PublicGroupsTable items={data.items} />;
}

const publicColumns = createTableColumns<PublicExternalGroupItem>();

function PublicGroupsTable({ items }: { items: PublicExternalGroupItem[] }) {
  const columns = useMemo(
    () => [
      publicColumns.column("external_user_group_id", {
        header: "公开外部组",
        weight: 80,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-01">
            {String(value)}
          </Text>
        ),
      }),
      publicColumns.column("stale", {
        header: "Stale",
        weight: 20,
        enableSorting: false,
        cell: (value) => (
          <Text as="span" font="main-ui-body" color="text-04">
            {value ? "是" : "否"}
          </Text>
        ),
      }),
    ],
    []
  );

  return (
    <Table
      data={items}
      columns={columns}
      getRowId={(row) => row.external_user_group_id}
    />
  );
}

export default ExternalUserGroupsView;
