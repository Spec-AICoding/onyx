## Why

外部用户组（`user__external_user_group_id`、`public_external_user_group`）是连接器同步 ACL 的核心数据，但目前任何界面都看不到：前端无入口，后端也无管理 API，只能通过 SQL 查库排查。需要在管理后台新增"外部用户组"页面，让管理员可按连接器查看组聚合信息和组内成员，且不侵入开源 Onyx 代码。

## What Changes

- 新增独立 FastAPI 应用（MagicBox 工程下独立目录）：仅连接 PostgreSQL（只读），不修改 onyx 仓库任何代码
- 新增 3 个只读接口：
  - 按 cc_pair 聚合展示外部用户组（组名、成员数、stale 标记），支持分页
  - 按组查询成员邮箱列表（展开行时调用）
  - 查询公开外部组（`public_external_user_group`，只展示组）
- magicbox-web 管理后台新增菜单"外部用户组"（挂在 Craft 分组下，跟随 `onyx_craft_available` 开关），页面分两个 Tab：
  - Tab1"用户-组映射"：连接器下拉（默认不加载）→ 组聚合表格 → 展开行查看成员邮箱
  - Tab2"公开外部组"：按连接器展示公开组列表
- magicbox-web `next.config.js` 新增 rewrites 代理：`/api/manage/admin/external-user-groups/*` → `http://127.0.0.1:8090/*`（置于现有 `/api` 规则之前）
- 新应用不做认证（本阶段），仅绑定 `127.0.0.1:8090`，公网不可达

## Capabilities

### New Capabilities

- `external-user-groups-admin`: 外部用户组管理能力——按连接器检索组聚合信息、展开查看组内成员邮箱、查看公开外部组列表；由独立 FastAPI 应用提供只读 API，magicbox-web 提供管理界面

### Modified Capabilities

（无——不修改任何现有 spec 的既有需求）

## Impact

- **新代码**：MagicBox 工程下新增独立 FastAPI 应用（fastapi + uvicorn + sqlalchemy + psycopg2，独立 venv），仅读 PG
- **前端**：magicbox-web 新增菜单路由、页面组件、rewrites 代理配置
- **不改动**：onyx 仓库（backend/web）零改动；PG 纯只读；不依赖 Redis
- **数据依赖**：`user__external_user_group_id`、`public_external_user_group`、`user`、`connector_credential_pair`（access_type）、`connector`（source）五张表
- **运行依赖**：新应用需常驻进程（uvicorn，端口 8090），随 magicbox-web 一起启动
