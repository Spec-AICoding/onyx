## 1. 独立 FastAPI 应用（后端）

- [x] 1.1 在 onyx 仓库内创建独立目录 `magicbox-backend/`（含 `app/main.py`、`app/db.py`、`requirements.txt`、`.env.example`、`run.sh`），初始化独立 venv 并安装 fastapi/uvicorn/sqlalchemy/psycopg2-binary
- [x] 1.2 实现 PG 连接与启动校验：SQLAlchemy engine（连接串来自环境变量，默认 `postgresql+psycopg2://postgres:password@81.70.98.107:5432/postgres`）；启动时校验 5 张依赖表存在（`user__external_user_group_id`、`public_external_user_group`、`user`、`connector_credential_pair`、`connector`），缺失则记录明确日志
- [x] 1.3 实现 cc_pair 校验与 applicable 判定辅助函数：cc_pair 不存在 → 404；`connector.source` 不在白名单（GOOGLE_DRIVE/CONFLUENCE/JIRA/CANVAS/BOX/GITHUB/SHAREPOINT，DB 存大写）→ applicable=false（原因=unsupported_source）；`access_type != 'SYNC'` → applicable=false（原因=not_synced）
- [x] 1.4 实现 `GET /external-user-groups`：组聚合（`GROUP BY external_user_group_id, stale`，过滤 stale=false，SQL 层 LIMIT/OFFSET 分页 + COUNT 总数），响应 `{applicable, total_items, items: [{external_user_group_id, member_count, stale}]}`
- [x] 1.5 实现 `GET /external-user-groups/members`：`user__external_user_group_id` JOIN `user` 查邮箱（过滤 stale=false，DISTINCT + 排序），响应 `{emails: [...]}`
- [x] 1.6 实现 `GET /external-user-groups/public`：查询 `public_external_user_group`（过滤 stale=false，排序），响应 `{applicable, total_items, items: [{external_user_group_id, stale}]}`
- [x] 1.7 curl 冒烟验证三端点（真实数据 cc_pair=4：聚合 4 组、members 返回邮箱、public 返回空）；验证 cc_pair 不存在 → 404、非 SYNC cc_pair → applicable=false

## 2. magicbox-web 代理与菜单

- [x] 2.1 `next.config.js` rewrites 数组**首位**插入 `/api/manage/admin/external-user-groups/:path*` → `http://127.0.0.1:8090/:path*`，重启 next dev 后验证代理生效（浏览器请求经 3001 转发到 8090，而非 8080）
- [x] 2.2 `admin-routes.ts` 新增 `CRAFT_EXTERNAL_GROUPS` 常量（path `/admin/craft/external-groups`，icon 复用现有图标，title/sidebarLabel"外部用户组"）
- [x] 2.3 `AdminSidebar.tsx` CRAFT 分支新增 `add(SECTIONS.CRAFT, ADMIN_ROUTES.CRAFT_EXTERNAL_GROUPS)`（跟随 `onyx_craft_available`，不动现有 3 项）
- [x] 2.4 新建页面 `src/app/admin/craft/external-groups/page.tsx`（双 Tab 容器，路由标题与菜单一致）

## 3. 前端页面组件

- [x] 3.1 Tab1"用户-组映射"：连接器下拉（复用 `/api/manage/admin/connector/status` 数据源，展示名称+id），**默认不加载表格**（未选择时显示空态提示）
- [x] 3.2 Tab1 组聚合表格：选择连接器后调用 `/api/manage/admin/external-user-groups?cc_pair_id=X`，分页复用现有 usePaginatedFetch 模式；`applicable=false` 时按原因展示提示文案（"该连接器类型不支持外部组同步"/"连接器未启用外部组同步"）；组名带前缀原样展示，显示 member_count 与 stale 标记
- [x] 3.3 Tab1 行展开：展开时调用 `/external-user-groups/members?cc_pair_id=X&group_id=Y` 展示成员邮箱列表（不内联预加载）
- [x] 3.4 Tab2"公开外部组"：同连接器下拉联动，调用 `/external-user-groups/public?cc_pair_id=X` 展示组列表（仅组名+stale），0 行时显示"仅 Google Drive 会写入"引导文案
- [x] 3.5 页面人工验证：菜单可见性、Tab 切换、连接器选择、聚合表格分页、行展开成员、空态与 applicable 提示

## 4. 收尾与文档

- [x] 4.1 确认 onyx 仓库零改动（git status 仅 openspec/ 目录有变更）；确认新应用无写入 PG 路径
- [x] 4.2 启动脚本与依赖清单落地（新应用随 magicbox-web 一起启动），在变更目录记录运行方式说明
