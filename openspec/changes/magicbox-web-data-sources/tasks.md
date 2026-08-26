# Tasks: MagicBox Web — 数据源管理后台

## 1. 项目脚手架

- [ ] 创建 `magicbox-web/` 目录结构
- [ ] 编写 `package.json`（Next.js 16 + React 19 + `"@onyx-ai/opal": "file:../web/lib/opal"` + `"@onyx-ai/shared": "file:../web/lib/shared"`，其余 deps 对齐 web/package.json）
- [ ] 编写 `next.config.js`（API 反代 `/api/:path*` → `INTERNAL_URL`，typedRoutes，turbopack root，端口 3001）
- [ ] 编写 `tailwind.config.js`（复用 opal preset + content paths）
- [ ] 编写 `postcss.config.js`
- [ ] 编写 `tsconfig.json`（`"@opal/*"`, `"@/*"` path aliases）
- [ ] 编写 `tsconfig.types.json`
- [ ] 编写 `.env`（`INTERNAL_URL=http://localhost:8080`，`NEXT_PUBLIC_*` 对齐 web）
- [ ] 编写 `.gitignore`
- **验证**: `bun install` 成功，`bun run dev` 在 3001 端口跑起空白 Next.js 页面

## 2. 主题与品牌系统

- [ ] 编写 `src/app/globals.css`：import opal root.css + 覆盖 `--theme-primary-*` 为科技蓝、`--background-tint-*` 为冷灰、中文字体栈
- [ ] 在 `src/components/MagicBoxLogo.tsx` 创建本地 logo 组件（SVG 图标 + 字标），替代 `SvgOnyxLogo` / `SvgOnyxLogoTyped`
- [ ] 编写根布局 `src/app/layout.tsx`（复制 web/src/app/layout.tsx 的 Provider 栈，中文化 metadata title 为「MagicBox」）
- **验证**: 访问 localhost:3001 清空页可见，devtools 确认 CSS 变量已覆盖（`--theme-primary-05: #1e40af`）

## 3. 认证流程（中文化）

- [ ] 复制并中文化 `src/app/auth/login/`（登录页：「邮箱」「密码」「登录」「忘记密码？」）
- [ ] 复制并中文化 `src/app/auth/signup/`（注册页）
- [ ] 复制并中文化 `src/app/auth/logout/`, `create-account/`, `forgot-password/`, `reset-password/`, `verify-email/`, `waiting-on-verification/`
- [ ] 复制并中文化 AuthFlowContainer 等认证组件
- [ ] 复制 `src/lib/auth/**`（requireAdminAuth, requireAuth, components, svcSS）
- **验证**: 可正常登录到 localhost:3001，cookie 正确设置

## 4. Admin 外壳

- [ ] 编写 `src/lib/admin-routes.ts`：定义数据源路由（path, icon, 中文 title, 中文 sidebarLabel）
- [ ] 编写 `src/sections/sidebar/AdminSidebar.tsx`：单分组「数据源」+ 子菜单「已有连接器」「添加连接器」+ 页脚「退出管理」+ 搜索
- [ ] 复制 `src/layouts/chromes/AdminChrome.tsx, AdminSSChrome.tsx`（保留 Lite 模式检测，中文化警告）
- [ ] 复制并中文化 `src/sections/admin/LiteModeIndexingNotice.tsx`
- [ ] 编写 `src/app/admin/layout.tsx`（SS 鉴权 → AdminChrome）
- [ ] 编写 `src/app/admin/page.tsx`（重定向到 `/admin/connectors`）
- [ ] 复制并中文化 `src/components/admin/Title.tsx`, `CardSection.tsx`
- [ ] 复制 `src/components/errorPages/`（中文化）
- [ ] 复制 `src/components/OnyxInitializingLoader.tsx` → 重命名为 MagicBoxInitializingLoader
- **验证**: 登录后访问 /admin，侧边栏显示带「数据源」分组 + 两个子菜单，点击可导航

## 5. 已有连接器页面

- [ ] 参照 `web/src/app/admin/indexing/status/page.tsx` → `magicbox-web/src/app/admin/connectors/page.tsx`
- [ ] 复制并中文化 `CCPairIndexingStatusTable`, `SearchAndFilterControls`, `FilterComponent`, `ConnectorRowSkeleton`
- [ ] 中文化所有文案：「搜索连接器…」「状态」「文档数」「操作」「重新索引」「详情」「暂无连接器」
- [ ] 复制依赖 lib: `useConnectorIndexingStatusWithPagination`, `indexAttempt`, `ccPair`, `connector`, `types`
- [ ] 复制 `src/sections/admin/indexing/status/` 目录
- **验证**: 页面显示连接器列表（从后端拉取），全部中文标签，筛选/搜索正常

## 6. 添加连接器页面

- [ ] 参照 `web/src/app/admin/add-connector/page.tsx` → `magicbox-web/src/app/admin/add-connector/page.tsx`
- [ ] 复制并中文化 `SourceTile`, 搜索框
- [ ] 中文化所有文案：「添加连接器」「搜索数据源…」「暂无匹配的数据源」
- [ ] 中文化 SourceMetadata 的 `displayName`（可在 sources.ts 中覆写）
- [ ] 复制 `src/sections/admin/connectors/` 目录
- [ ] 复制 `src/components/admin/connectors/`（AccessTypeForm, CredentialForm 等，中文化）
- **验证**: SourceTile 网格正常显示各数据源，点击可跳转到配置表单

## 7. 连接器配置表单 + OAuth

- [ ] 复制 `magicbox-web/src/app/admin/connectors/[connector]/page.tsx` → 动态配置表单
- [ ] 复制 `ConnectorWrapper.tsx`, `NavigationRow.tsx`
- [ ] 复制 `pages/` 子目录（DynamicConnectorCreationForm, FieldRendering, ConnectorInput 系列）
- [ ] 复制各连接器页面（gdrive/GoogleDrivePage, gmail/GmailPage 等）
- [ ] 复制 OAuth 回调页：`oauth/callback/page.tsx`, `oauth/finalize/page.tsx`
- [ ] 复制 `src/components/admin/connectors/`（FileUpload, AutoSyncOptions, AccessTypeForm 等）
- [ ] 复制 `src/lib/connectors/`（credentials）
- [ ] 复制 `src/lib/oauth/`, `src/lib/googleConnector.ts`, `src/lib/gmail.ts`, `src/lib/googleDrive.ts`
- [ ] 中文化所有表单文案、错误提示、成功提示
- **验证**: 选择 Google Drive → 填写配置 → 保存成功；Slack → OAuth 回调成功

## 8. 连接器详情页

- [ ] 参照 `web/src/app/admin/connector/[ccPairId]/page.tsx` → `magicbox-web`
- [ ] 复制并中文化 `ConfigDisplay`, `IndexAttemptsTable`, `ReIndexModal`, `PermissionSyncStatusBadge`, `SyncAttemptsTabs`
- [ ] 复制 `InlineFileManagement` 等子组件并中文化
- [ ] 复制 `useStatusChange.tsx`
- **验证**: 从已有连接器列表点击详情 → 显示配置信息 + 索引进度表 + 删除/重新索引按钮

## 9. 前台骨架

- [ ] 编写 `src/app/app/layout.tsx`（requireAuth + AppChrome + AppSidebar，参考 web）
- [ ] 编写 `src/app/app/page.tsx`（中文占位页：「欢迎使用 MagicBox，聊天功能即将上线」+ MagicBox logo）
- [ ] 编写 `src/app/app/agents/page.tsx`（占位：「智能体管理」）
- [ ] 编写 `src/app/app/settings/` 占位路由结构
- [ ] 复制 `src/sections/sidebar/AppSidebar.tsx`（保留基本导航结构，中文化）
- [ ] 复制 `src/layouts/chromes/AppChrome.tsx`（中文化标题/提示）
- [ ] 复制 `src/layouts/general-layouts.tsx`
- **验证**: 登录后 /app 显示占位页，AppSidebar 导航正常

## 10. 依赖 lib 模块（随任务 3-9 逐步复制）

- [ ] `src/lib/fetcher.ts` + `fetchUtils.ts`（保持原样，相对 URL 不变）
- [ ] `src/lib/settings/**`（hooks.ts, types.ts）
- [ ] `src/lib/sources.ts`（中文化 displayName）
- [ ] `src/lib/hooks.ts`, `src/lib/hooks/**`
- [ ] `src/lib/types.ts`
- [ ] `src/lib/connectors/`, `src/lib/ccPair.ts`, `src/lib/indexAttempt.ts`
- [ ] `src/lib/auth/**`, `src/lib/oauth/**`
- [ ] `src/lib/connector.ts`, `src/lib/connectors.ts`, `src/lib/credentials/**`
- [ ] `src/lib/constants.ts`, `src/lib/constants/`, `src/lib/search/interfaces.ts`
- [ ] `src/lib/generated/**`（OpenAPI 客户端）
- [ ] `src/lib/app/**`（components.tsx → 中文化，去掉 Powered by Onyx，svcSS.ts）
- [ ] `src/providers/**`（AppProvider, SWRConfigProvider, UserProvider, ProductGatingWrapper）
- [ ] `src/refresh-components/**`（Text, Truncated）
- [ ] `src/components/`（SourceTile, WebResultIcon, errorPages）
- [ ] `src/sections/`（banners, admin/LiteModeIndexingNotice）
- [ ] `src/hooks/**`
- [ ] `src/lib/analytics/`（可保留或精简）
- [ ] `src/lib/banner/`

## 11. 验证与收尾

- [ ] `bun run types:check` 无错误
- [ ] `bun run lint` 无错误
- [ ] `bun run build` 成功
- [ ] `bun run dev` 启动，访问 http://localhost:3001/admin/connectors 完整功能可用
- [ ] 验证 OAuth 流程（Google Drive / Slack 任意一个）
- [ ] 验证 前台骨架占位页 可访问
- [ ] 验证 主题色差异（科技蓝 vs 墨色）在各组件上正确渲染
- [ ] 验证 中文字体正常显示
