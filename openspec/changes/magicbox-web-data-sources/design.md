# Design: MagicBox Web — 数据源管理后台

## Architecture

```
magicbox-web/                          web/ (unchanged)
┌──────────────────────────────┐      ┌──────────────────────┐
│ package.json                 │      │ lib/opal/            │
│  "@onyx-ai/opal":            │◀─────│  (components, icons, │
│    "file:../web/lib/opal"    │ ref  │   logos, layouts)    │
│  "@onyx-ai/shared":          │◀─────│ lib/shared/          │
│    "file:../web/lib/shared"  │ ref  │  (tokens.css, types) │
│                              │      └──────────────────────┘
│ src/                         │
│  globals.css  ← theme overrides (科技蓝、中文 fallback)
│  app/
│   layout.tsx                 │  RootLayout + Providers
│   auth/...                   │  登录/注册/SSO
│   admin/                     │  后台
│    layout.tsx                │    SS鉴权 + AdminChrome
│    connectors/page.tsx       │    已有连接器 (indexing/status)
│    add-connector/page.tsx    │    添加连接器 (source tiles)
│    connector/[ccPairId]/     │    连接器详情
│    connectors/[connector]/   │    动态配置表单 + OAuth
│   app/                       │  前台骨架
│    layout.tsx                │    requireAuth + AppChrome
│    page.tsx                  │    聊天占位
│    agents/...                │    占位
│    settings/...              │    占位
│  sections/sidebar/
│   AdminSidebar.tsx           │   数据源 → 已有连接器/添加连接器
│   AppSidebar.tsx             │   前台导航(占位版)
│  components/
│   MagicBoxLogo.tsx           │  新 logo 组件
│  lib/
│   admin-routes.ts            │   中文路由定义
│   ...                        │   复制自 web/src/lib 必要模块
└──────────────────────────────┘
```

## Data Flow

```
浏览器 (localhost:3001)
  │
  ├── /admin/* ──▶ AdminSSChrome (requireAdminAuth) ──▶ AdminChrome ──▶ AdminSidebar + Content
  │                                    │
  │                         cookie: fastapiusersauth
  │
  ├── /app/*   ──▶ layout (requireAuth) ──▶ AppChrome ──▶ AppSidebar + Content
  │
  └── /api/*   ──▶ next.config.js rewrite ──▶ http://localhost:8080 (backend)
                     /api/persona, /api/connector, ...
```

### API Proxy (next.config.js)

```js
async rewrites() {
    return [{
        source: "/api/:path*",
        destination: `${process.env.INTERNAL_URL || "http://localhost:8080"}/api/:path*`,
    }];
}
```

### Auth Cookie

FastAPI Users cookie (`fastapiusersauth`) 不设 Domain，按请求 host 存储。从 localhost:3001 登录后 cookie 写入该 host，后续请求自动携带。无需跨域配置。

## Theme Override Strategy

在 `src/app/globals.css` 中，先 import `@onyx-ai/opal/root.css`，再覆盖目标 CSS 变量：

```css
@import "@onyx-ai/opal/root.css";
@import "@onyx-ai/shared/tokens.css";

/* === MagicBox 品牌色（科技蓝，在 Opal 之后覆盖） === */
:root {
  /* 主色覆盖：indigo/blue 系 */
  --onyx-ink-100: #1e3a5f;
  --onyx-ink-95:  #1e40af;
  --onyx-ink-90:  #2563eb;
  --onyx-ink-80:  #3b82f6;
  --onyx-ink-70:  #60a5fa;
  /* 冷灰背景替代暖灰 */
  --grey-100: #0f172a;
  --grey-00:  #f8fafc;
  --tint-02:  #f1f5f9;
  --tint-05:  #e2e8f0;
  /* 字体栈：中文优先 */
  --font-hanken-grotesk: "PingFang SC", "Noto Sans SC", "Hanken Grotesk", system-ui, sans-serif;
  --font-dm-mono: "SF Mono", "Menlo", monospace;
}

/* 对应深色模式也做覆盖 */
.dark {
  ...
}
```

## File Changes

### New Files

| File | Purpose |
|---|---|
| `magicbox-web/package.json` | 应用定义 + opal/shared 依赖 |
| `magicbox-web/next.config.js` | Next.js 配置 + API 反代 |
| `magicbox-web/tailwind.config.js` | Tailwind 配置（复用 opal preset） |
| `magicbox-web/postcss.config.js` | PostCSS 配置 |
| `magicbox-web/tsconfig.json` | TypeScript 配置 |
| `magicbox-web/.env` | 环境变量（INTERNAL_URL, NEXT_PUBLIC_*） |
| `magicbox-web/src/app/globals.css` | 全局样式 + 品牌色覆盖 |
| `magicbox-web/src/app/layout.tsx` | 根布局（Provider 栈） |
| `magicbox-web/src/app/auth/**` | 登录/注册/SSO/忘记密码 |
| `magicbox-web/src/app/admin/layout.tsx` | 后台 SS 鉴权布局 |
| `magicbox-web/src/app/admin/connectors/page.tsx` | 已有连接器列表 |
| `magicbox-web/src/app/admin/add-connector/page.tsx` | 添加连接器 |
| `magicbox-web/src/app/admin/connector/[ccPairId]/page.tsx` | 连接器详情 |
| `magicbox-web/src/app/admin/connectors/[connector]/page.tsx` | 动态配置表单 |
| `magicbox-web/src/app/admin/connectors/[connector]/oauth/callback/page.tsx` | OAuth 回调 |
| `magicbox-web/src/app/admin/connectors/[connector]/oauth/finalize/page.tsx` | OAuth 完成 |
| `magicbox-web/src/app/app/**` | 前台骨架（布局 + 占位页） |
| `magicbox-web/src/sections/sidebar/AdminSidebar.tsx` | 数据源侧边栏 |
| `magicbox-web/src/sections/sidebar/AppSidebar.tsx` | 前台侧边栏(占位) |
| `magicbox-web/src/layouts/chromes/` | AdminChrome, AdminSSChrome, AppChrome |
| `magicbox-web/src/components/MagicBoxLogo.tsx` | 新品牌 logo |
| `magicbox-web/src/lib/admin-routes.ts` | 中文路由定义 |
| `magicbox-web/src/lib/*` | fetcher, settings, sources, hooks, types, connectors, etc. |
| `magicbox-web/src/components/admin/Title.tsx` | 中文标题组件 |
| `magicbox-web/src/components/errorPages/` | 中文错误页 |

### Copied Modules from web/src

| Source | Notes |
|---|---|
| `lib/fetcher.ts, fetchUtils.ts, fetcher.skipRetry.test.tsx` | API 调用 |
| `lib/settings/**` | useSettings, types |
| `lib/sources.ts` | SourceMetadata, SourceCategory |
| `lib/hooks.ts, lib/hooks/**` | 数据 hooks（useConnectorIndexingStatus, useFederatedConnectors） |
| `lib/types.ts` | ValidSources, FederatedConnectorDetail 等 |
| `lib/connectors/credentials/**` | Credential |
| `lib/ccPair.ts` | ConnectorCredentialPair |
| `lib/indexAttempt.ts` | Index attempt |
| `lib/auth/**` | requireAdminAuth, requireAuth, OAuth helpers |
| `lib/oauth/**` | OAuth 工具 |
| `lib/connector.ts, lib/connectors.ts` | 连接器工具 |
| `lib/constants.ts, lib/constants/**` | 常量 |
| `lib/search/interfaces.ts` | SourceCategory |
| `lib/generated/**` | OpenAPI 生成客户端 |
| `providers/**` | AppProvider, SWRConfigProvider, UserProvider |
| `components/SourceTile.tsx` | Add Connector SourceTile |
| `components/errorPages/` | 错误页组件 |
| `refresh-components/**` | Text, Truncated 组件 |

## Theme Tokens Mapping

```
Onyx 墨色                 MagicBox 科技蓝
══════════════════════    ══════════════════════
--onyx-ink-100: #0a0a0b   →  #1e3a5f (深海军蓝)
--onyx-ink-95:  #111113   →  #1e40af (蓝-800)
--onyx-ink-90:  #1c1c1e   →  #2563eb (蓝-600)
--onyx-ink-80:  #2c2c2e   →  #3b82f6 (蓝-500)
--onyx-ink-70:  #3c3c3e   →  #60a5fa (蓝-400)
--tint-02: warm-grey      →  冷灰 (slate-100)
```

## Edge Cases

- **无连接器数据**: 已有连接器页显示空状态中文提示「暂无连接器，去添加一个」
- **OAuth 回调失败**: 显示中文错误页面，提供重试链接
- **未登录**: 重定向到 `/auth/login`
- **非管理员**: requireAdminAuth 返回 403，显示中文权限不足页
- **Lite 模式**: 向量库未启用时显示中文提示（复用 LiteModeIndexingNotice 中文化）
