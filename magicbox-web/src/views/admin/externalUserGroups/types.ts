/** 外部用户组管理页面的 API 响应类型（对应独立 FastAPI 应用的响应结构）。 */

export interface ExternalGroupItem {
  // id 与 external_user_group_id 同值（分页 hook 泛型约束需要 id 字段）
  id: string;
  external_user_group_id: string;
  member_count: number;
  stale: boolean;
}

export interface ExternalGroupListResponse {
  applicable: boolean;
  reason: "unsupported_source" | "not_synced" | null;
  total_items: number;
  items: ExternalGroupItem[];
}

export interface PublicExternalGroupItem {
  external_user_group_id: string;
  stale: boolean;
}

export interface PublicExternalGroupResponse {
  applicable: boolean;
  reason: "unsupported_source" | "not_synced" | null;
  total_items: number;
  items: PublicExternalGroupItem[];
}

export interface ExternalGroupMembersResponse {
  emails: string[];
}

export const NOT_APPLICABLE_REASON_MESSAGES: Record<
  NonNullable<ExternalGroupListResponse["reason"]>,
  string
> = {
  unsupported_source: "该连接器类型不支持外部组同步。",
  not_synced: "连接器未启用外部组同步（访问模式需为 SYNC）。",
};
