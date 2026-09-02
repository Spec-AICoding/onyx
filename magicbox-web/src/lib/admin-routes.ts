import { Permission } from "@/lib/types";
import { IconFunctionComponent } from "@opal/types";
import {
  SvgActions,
  SvgActivity,
  SvgAudio,
  SvgShareWebhook,
  SvgBarChart,
  SvgBookOpen,
  SvgBubbleText,
  SvgClipboard,
  SvgCpu,
  SvgDevKit,
  SvgDownload,
  SvgEmpty,
  SvgFileText,
  SvgFiles,
  SvgGlobe,
  SvgHistory,
  SvgImage,
  SvgMcp,
  SvgOnyxOctagon,
  SvgPaintBrush,
  SvgPlug,
  SvgProgressBars,
  SvgSearchMenu,
  SvgShield,
  SvgTerminal,
  SvgThumbsUp,
  SvgUploadCloud,
  SvgUser,
  SvgUserCheck,
  SvgUserKey,
  SvgUserSync,
  SvgUsers,
  SvgWallet,
  SvgZoomIn,
  SvgDiscord,
  SvgSlack,
  SvgFolderOpen,
} from "@opal/icons";

export interface AdminRouteEntry {
  path: string;
  icon: IconFunctionComponent;
  title: string;
  sidebarLabel: string;
  /** The single Permission token the user must hold to access this route.
   * FULL_ADMIN_PANEL_ACCESS overrides every other permission. */
  requiredPermission: Permission;
}

/**
 * Single source of truth for every admin route: path, icon, page-header
 * title, sidebar label, and the permission required to reach it.
 */
export const ADMIN_ROUTES = {
  INDEXING_STATUS: {
    path: "/admin/indexing/status",
    icon: SvgBookOpen,
    title: "已有连接器",
    sidebarLabel: "已有连接器",
    requiredPermission: Permission.MANAGE_CONNECTORS,
  },
  ADD_CONNECTOR: {
    path: "/admin/add-connector",
    icon: SvgUploadCloud,
    title: "添加连接器",
    sidebarLabel: "添加连接器",
    requiredPermission: Permission.MANAGE_CONNECTORS,
  },
  DOCUMENT_SETS: {
    path: "/admin/documents/sets",
    icon: SvgFiles,
    title: "文档集",
    sidebarLabel: "文档集",
    requiredPermission: Permission.MANAGE_DOCUMENT_SETS,
  },
  DOCUMENT_EXPLORER: {
    path: "/admin/documents/explorer",
    icon: SvgZoomIn,
    title: "文档浏览器",
    sidebarLabel: "浏览器",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  DOCUMENT_FEEDBACK: {
    path: "/admin/documents/feedback",
    icon: SvgThumbsUp,
    title: "文档反馈",
    sidebarLabel: "反馈",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  AGENTS: {
    path: "/admin/agents",
    icon: SvgOnyxOctagon,
    title: "智能体",
    sidebarLabel: "智能体",
    requiredPermission: Permission.MANAGE_AGENTS,
  },
  SLACK_BOTS: {
    path: "/admin/bots",
    icon: SvgSlack,
    title: "Slack 集成",
    sidebarLabel: "Slack 集成",
    requiredPermission: Permission.MANAGE_BOTS,
  },
  DISCORD_BOTS: {
    path: "/admin/discord-bot",
    icon: SvgDiscord,
    title: "Discord 集成",
    sidebarLabel: "Discord 集成",
    requiredPermission: Permission.MANAGE_BOTS,
  },
  MCP_ACTIONS: {
    path: "/admin/actions/mcp",
    icon: SvgMcp,
    title: "MCP 操作",
    sidebarLabel: "MCP 操作",
    requiredPermission: Permission.MANAGE_ACTIONS,
  },
  OPENAPI_ACTIONS: {
    path: "/admin/actions/open-api",
    icon: SvgActions,
    title: "OpenAPI 操作",
    sidebarLabel: "OpenAPI 操作",
    requiredPermission: Permission.MANAGE_ACTIONS,
  },
  STANDARD_ANSWERS: {
    path: "/admin/standard-answer",
    icon: SvgClipboard,
    title: "标准回复",
    sidebarLabel: "标准回复",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  GROUPS: {
    path: "/admin/groups",
    icon: SvgUsers,
    title: "管理用户组",
    sidebarLabel: "用户组",
    requiredPermission: Permission.MANAGE_USER_GROUPS,
  },
  CHAT_PREFERENCES: {
    path: "/admin/configuration/chat-preferences",
    icon: SvgBubbleText,
    title: "聊天偏好",
    sidebarLabel: "聊天偏好",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  LLM_MODELS: {
    path: "/admin/configuration/language-models",
    icon: SvgCpu,
    title: "语言模型",
    sidebarLabel: "语言模型",
    requiredPermission: Permission.MANAGE_LLMS,
  },
  WEB_SEARCH: {
    path: "/admin/configuration/web-search",
    icon: SvgGlobe,
    title: "网页搜索",
    sidebarLabel: "网页搜索",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  IMAGE_GENERATION: {
    path: "/admin/configuration/image-generation",
    icon: SvgImage,
    title: "图片生成",
    sidebarLabel: "图片生成",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  VOICE: {
    path: "/admin/configuration/voice",
    icon: SvgAudio,
    title: "语音",
    sidebarLabel: "语音",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  CODE_INTERPRETER: {
    path: "/admin/configuration/code-interpreter",
    icon: SvgTerminal,
    title: "代码解释器",
    sidebarLabel: "代码解释器",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  CRAFT_ACCESS: {
    path: "/admin/craft/access",
    icon: SvgUserCheck,
    title: "权限",
    sidebarLabel: "权限",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
    EXTERNAL_USER_GROUPS: {
    path: "/admin/craft/external-groups",
    icon: SvgUserSync,
    title: "外部用户组",
    sidebarLabel: "外部用户组",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  SYNC_FILES: {
    path: "/admin/data/sync-files",
    icon: SvgFolderOpen,
    title: "同步文件列表",
    sidebarLabel: "同步文件列表",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  CRAFT_APPS: {
    path: "/admin/craft/apps",
    icon: SvgPlug,
    title: "应用",
    sidebarLabel: "应用",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  CRAFT_INSTRUCTIONS: {
    path: "/admin/craft/instructions",
    icon: SvgDevKit,
    title: "指令",
    sidebarLabel: "指令",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  INDEX_SETTINGS: {
    path: "/admin/configuration/index-settings",
    icon: SvgSearchMenu,
    title: "索引设置",
    sidebarLabel: "索引设置",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  DOCUMENT_PROCESSING: {
    path: "/admin/configuration/document-processing",
    icon: SvgFileText,
    title: "文档处理",
    sidebarLabel: "文档处理",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  USERS: {
    path: "/admin/users",
    icon: SvgUser,
    title: "用户与请求",
    sidebarLabel: "用户",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  API_KEYS: {
    path: "/admin/service-accounts",
    icon: SvgUserKey,
    title: "服务账号",
    sidebarLabel: "服务账号",
    requiredPermission: Permission.MANAGE_SERVICE_ACCOUNT_API_KEYS,
  },
  TOKEN_RATE_LIMITS: {
    path: "/admin/token-rate-limits",
    icon: SvgProgressBars,
    title: "消费限额",
    sidebarLabel: "消费限额",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  TRACING: {
    path: "/admin/tracing",
    icon: SvgBarChart,
    title: "链路追踪",
    sidebarLabel: "链路追踪",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  USAGE: {
    path: "/admin/performance/usage",
    icon: SvgActivity,
    title: "使用统计",
    sidebarLabel: "使用统计",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  QUERY_HISTORY: {
    path: "/admin/performance/query-history",
    icon: SvgHistory,
    title: "查询历史",
    sidebarLabel: "查询历史",
    requiredPermission: Permission.READ_QUERY_HISTORY,
  },
  CUSTOM_ANALYTICS: {
    path: "/admin/performance/custom-analytics",
    icon: SvgBarChart,
    title: "自定义分析",
    sidebarLabel: "自定义分析",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  EXPORT_LOGS: {
    path: "/admin/export-logs",
    icon: SvgDownload,
    title: "导出日志",
    sidebarLabel: "导出日志",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  THEME: {
    path: "/admin/theme",
    icon: SvgPaintBrush,
    title: "外观与主题",
    sidebarLabel: "外观与主题",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  BILLING: {
    path: "/admin/billing",
    icon: SvgWallet,
    title: "套餐与计费",
    sidebarLabel: "套餐与计费",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  HOOKS: {
    path: "/admin/hooks",
    icon: SvgShareWebhook,
    title: "钩子扩展",
    sidebarLabel: "钩子扩展",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  SCIM: {
    path: "/admin/scim",
    icon: SvgUserSync,
    title: "SCIM",
    sidebarLabel: "SCIM",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  OAUTH_TEST: {
    path: "/admin/oauth-test",
    icon: SvgUserKey,
    title: "OAuth 测试",
    sidebarLabel: "OAuth 测试",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  SECURITY_HARDENING: {
    path: "/admin/security",
    icon: SvgShield,
    title: "安全与加固",
    sidebarLabel: "安全与加固",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  SSO_PROVIDERS: {
    path: "/admin/sso-providers",
    icon: SvgUserKey,
    title: "SSO 提供商",
    sidebarLabel: "SSO 提供商",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  // Prefix-only entries used for layout matching — not rendered as sidebar
  // items or page headers.
  DOCUMENTS: {
    path: "/admin/documents",
    icon: SvgEmpty,
    title: "",
    sidebarLabel: "",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
  PERFORMANCE: {
    path: "/admin/performance",
    icon: SvgEmpty,
    title: "",
    sidebarLabel: "",
    requiredPermission: Permission.FULL_ADMIN_PANEL_ACCESS,
  },
} as const satisfies Record<string, AdminRouteEntry>;

/**
 * Helper that converts a route entry into the `{ name, icon, link }`
 * shape expected by the sidebar.
 */
export function sidebarItem(route: AdminRouteEntry) {
  return { name: route.sidebarLabel, icon: route.icon, link: route.path };
}

/**
 * Connector/indexing admin route prefixes that need a vector DB. In Lite mode
 * these render an informational notice instead of their normal content.
 */
export const VECTOR_DB_REQUIRED_ROUTE_PREFIXES: readonly string[] = [
  ADMIN_ROUTES.INDEXING_STATUS.path,
  ADMIN_ROUTES.ADD_CONNECTOR.path,
  // Covers /sets, /explorer, and /feedback — all require a vector DB.
  ADMIN_ROUTES.DOCUMENTS.path,
  ADMIN_ROUTES.INDEX_SETTINGS.path,
  "/admin/connector",
  "/admin/federated",
];

export function isVectorDbRequiredRoute(pathname: string): boolean {
  return VECTOR_DB_REQUIRED_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
}
