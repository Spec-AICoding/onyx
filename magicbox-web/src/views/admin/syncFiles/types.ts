export interface SyncFileItem {
  // id 与 file_id 同值（分页 hook 泛型约束需要 id 字段）
  id: string;
  file_id: string;
  display_name: string | null;
  document_count: number | null;
  created_at: string | null;
  processed: boolean;
  kg_stage: "not_started" | "extracting" | "extracted" | "failed" | null;
  kg_processing_time: string | null;
}

export interface SyncFileListResponse {
  applicable: boolean;
  reason: string | null;
  total_items: number;
  items: SyncFileItem[];
}

export interface DocumentSummaryItem {
  id: string;
  semantic_identifier: string | null;
  link: string | null;
  doc_updated_at: string | null;
  text_preview: string | null;
  metadata: Record<string, unknown> | null;
  section_count: number;
  // document 表补充状态（仅索引状态，不含图谱状态）
  last_synced: string | null;
  chunk_count: number | null;
  // 外部访问控制（document 表 ACL 三字段）
  external_user_emails: string[] | null;
  external_user_group_ids: string[] | null;
  is_public: boolean | null;
}

export interface DocumentsResponse {
  total_items: number;
  items: DocumentSummaryItem[];
}

export const KG_STAGE_LABELS: Record<
  NonNullable<SyncFileItem["kg_stage"]>,
  string
> = {
  not_started: "待处理",
  extracting: "提取中",
  extracted: "已提取",
  failed: "失败",
};

/* ── 同步任务（index_attempt，连接器 → 任务 → 文件） ───────────────────── */

export interface SyncAttemptItem {
  id: number; // index_attempt.id（分页 hook 泛型约束需要 id 字段）
  status:
    | "not_started"
    | "in_progress"
    | "success"
    | "canceled"
    | "interrupted"
    | "failed"
    | "completed_with_errors";
  total_docs_indexed: number | null;
  file_count: number; // 该任务产生的批次文件数
  completed_batches: number | null;
  total_batches: number | null;
  error_msg: string | null;
  time_started: string | null;
  time_updated: string | null;
}

export interface SyncAttemptListResponse {
  applicable: boolean;
  reason: string | null;
  total_items: number;
  items: SyncAttemptItem[];
}

export const ATTEMPT_STATUS_LABELS: Record<
  SyncAttemptItem["status"],
  string
> = {
  not_started: "未开始",
  in_progress: "进行中",
  success: "成功",
  canceled: "已取消",
  interrupted: "中断",
  failed: "失败",
  completed_with_errors: "有错误完成",
};

/* ── 连接器类型（source）显示名 ───────────────────────────────────────── */

export const SOURCE_LABELS: Record<string, string> = {
  web: "网页",
  github: "GitHub",
  gitlab: "GitLab",
  slack: "Slack",
  google_drive: "Google Drive",
  gmail: "Gmail",
  bookstack: "Bookstack",
  outline: "Outline",
  confluence: "Confluence",
  jira: "Jira",
  slab: "Slab",
  coda: "Coda",
  notion: "Notion",
  guru: "Guru",
  request_tracker: "Request Tracker",
  salesforce: "Salesforce",
  sharepoint: "SharePoint",
  teams: "Teams",
  box: "Box",
  hubspot: "HubSpot",
  document360: "Document360",
  google_sites: "Google Sites",
  zendesk: "Zendesk",
  linear: "Linear",
  asana: "Asana",
  jira_align: "Jira Align",
  productboard: "Productboard",
  gong: "Gong",
  loopio: "Loopio",
  vault: "Vault",
  craft: "Craft",
};

/** 未知类型回退为原始 source 值。 */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
