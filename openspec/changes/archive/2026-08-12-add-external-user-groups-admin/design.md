## Context

Onyx 的外部用户组数据（`user__external_user_group_id`、`public_external_user_group`）由 EE 连接器同步任务写入（如 Jira/Confluence 的 `upsert_external_groups`），是文档 ACL 匹配的依据。但管理后台没有任何查看入口：原版前端无页面、后端无管理 API。当前环境实测：`user__external_user_group_id` 4 行（cc_pair=4，组名带 `jira_` 前缀）、`public_external_user_group` 0 行、`external_user_group` 表不存在（成员邮箱仅能通过映射表 join `user` 表获得）。

开发约束：不修改 onyx 开源仓库任何代码（最小侵入/上游韧性）；新增应用仅连接 PostgreSQL（只读）；本阶段不做用户认证（仅绑定 127.0.0.1）。

## Goals / Non-Goals

**Goals:**
- 管理后台新增"外部用户组"页面（magicbox-web），按连接器（cc_pair）检索展示外部用户组
- 组聚合展示（组名带前缀、成员数、stale 标记），展开行查看成员邮箱
- 独立 FastAPI 应用提供只读 API，仅依赖 PG，绑定 127.0.0.1:8090
- onyx 仓库零改动，PG 零写入

**Non-Goals:**
- 不做用户认证/权限控制（本阶段；仅回环绑定兜底）
- 不管理外部组（增删改、触发同步）——纯只读展示
- 不修改现有"权限/应用/指令"菜单内容
- 不还原组名前缀（展示存储原值，与 ACL 匹配名一致）
- 不展示 stale 行（默认过滤，同步周期内即被清理的瞬时状态）

## Decisions

**1. 独立 FastAPI 应用（不侵入 onyx）**
- MagicBox 工程下独立目录，独立 venv：fastapi + uvicorn + sqlalchemy + psycopg2
- 备选（否决）：在 onyx/backend 加端点（认证/权限零成本，但侵入开源代码，违背上游韧性偏好）
- 备选（否决）：共享 onyx auth 库做认证（需要 Redis 会话校验，本阶段不需要）

**2. 无认证 + 绑定 127.0.0.1:8090**
- 本阶段不做认证（用户决策）；rewrites 由 magicbox-web 服务端代理（node 进程本机发起），8090 仅需回环可达
- 风险（公网不可达）→ 若未来需要公网访问，再引入认证（复刻 Onyx session 校验：Redis GET `fastapi_users_token:<token>` + PG `user` 表角色判断）

**3. rewrites 代理（方案 a）**
- magicbox-web `next.config.js`：`/api/manage/admin/external-user-groups/:path*` → `http://127.0.0.1:8090/:path*`，置于现有 `/api` 规则之前
- 前端与调用原版 API 同路径无感知，cookie/同源零问题
- 备选（否决）：前端直连 8090（跨端口 CORS + credentials，且暴露端口）

**4. 三个只读端点（响应复用 CCPairSyncAttemptsResponse 形状）**
- `GET /external-user-groups?cc_pair_id&page_num&page_size`：Tab1 组聚合。SQL：`SELECT external_user_group_id, count(*) AS member_count, stale FROM user__external_user_group_id WHERE cc_pair_id=:id AND stale=false GROUP BY external_user_group_id, stale ORDER BY external_user_group_id LIMIT/OFFSET`；另查总数
- `GET /external-user-groups/members?cc_pair_id&group_id`：展开成员。SQL：`SELECT u.email FROM user__external_user_group_id m JOIN "user" u ON u.id=m.user_id WHERE m.cc_pair_id=:id AND m.external_user_group_id=:gid AND m.stale=false ORDER BY u.email`
- `GET /external-user-groups/public?cc_pair_id`：Tab2 公开组。SQL：`SELECT external_user_group_id, stale FROM public_external_user_group WHERE cc_pair_id=:id AND stale=false ORDER BY external_user_group_id`（表极小不分页，返回 `{applicable, total_items, items}` 同构）
- 统一响应：`{applicable: bool, total_items: int, items: [...]}`；applicable=false 时 items 为空

**5. applicable 语义（两级）**
- `connector.source` 不在外部组同步源白名单（静态常量：GOOGLE_DRIVE/CONFLUENCE/JIRA/CANVAS/BOX/GITHUB/SHAREPOINT）→ `applicable=false`，前端提示"该连接器类型不支持外部组同步"
- 或 `connector_credential_pair.access_type != 'SYNC'` → `applicable=false`，前端提示"连接器未启用外部组同步"
- cc_pair 不存在 → 404；连接器被禁用/删除 → 404 同义处理

**6. 前端页面结构**
- 路由：`/admin/craft/external-groups`（新页面，不动 `/admin/craft/access`）；admin-routes.ts 新增常量（icon 复用 SvgUsers 或同类）；AdminSidebar CRAFT 分支 `add(SECTIONS.CRAFT, ADMIN_ROUTES.CRAFT_EXTERNAL_GROUPS)`（跟随 `onyx_craft_available`）
- 页面：两个 Tab；Tab1 连接器下拉（数据源 `/api/manage/admin/connector/status`，默认不加载表格）→ 组聚合表（分页，复用 usePaginatedFetch 模式）→ 行展开调用 members 端点；Tab2 公开组表（同下拉联动）
- 空态：Tab2 0 行时显示"仅 Google Drive 会写入"引导文案

## Risks / Trade-offs

- [schema 漂移] onyx 升级改表名/列名 → 新应用查询静默失败 → 缓解：查询列名最小化（仅用稳定列），应用启动时校验关键表存在并记录日志
- [无认证] 数据裸奔风险（本机回环内） → 缓解：仅绑定 127.0.0.1；后续需公网时补认证（决策 2 已预留路径）
- [数据规模] 企业级下组数×成员大 → 缓解：Tab1 SQL 层分页；成员不内联、展开时按组查
- [代理顺序] rewrites 规则顺序错误导致被 `/api` 规则吞掉 → 缓解：新规则置于数组首位，并加 e2e 冒烟验证

## Migration Plan

1. 新应用：`MagicBox/backend/`（或约定目录）建 venv、装依赖、写代码；启动脚本
2. 代理：magicbox-web `next.config.js` 加 rewrite（需重启 next dev 生效）
3. 前端：菜单 + 页面组件
4. 验证：curl 8090 三端点（真实数据 cc_pair=4 → 4 组聚合、成员邮箱）；页面人工验证 Tab1/Tab2
5. 回滚：停掉 8090 进程 + 删除 rewrite 规则即完全回退（onyx 无任何改动）

## Open Questions

（无——设计决策已全部确认）
