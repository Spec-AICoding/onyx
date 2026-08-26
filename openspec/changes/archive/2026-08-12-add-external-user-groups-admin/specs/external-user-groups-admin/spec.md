## ADDED Requirements

### Requirement: 外部用户组聚合查询

系统 SHALL 提供只读接口，按 connector_credential_pair（cc_pair）检索 `user__external_user_group_id` 表中的外部用户组聚合信息，每行包含组名（带源前缀的存储原值）、成员数、stale 标记。接口 SHALL 支持分页（page_num/page_size）并在 SQL 层完成分组与分页。默认 SHALL 过滤 stale=true 的行。接口 SHALL 返回 `{applicable, total_items, items}` 结构，其中 `applicable=false` 时 items 为空。

#### Scenario: 查询有效 cc_pair 的组聚合
- **WHEN** 调用 `/external-user-groups?cc_pair_id=4&page_num=0&page_size=50` 且 cc_pair 4 存在、其连接器支持外部组同步且 access_type 为 SYNC
- **THEN** 返回 `applicable=true`，items 为按组名排序的聚合行（组名、member_count、stale=false），total_items 为组总数

#### Scenario: 连接器类型不支持外部组同步
- **WHEN** 调用该接口且 cc_pair 对应的 connector.source 不在外部组同步源白名单（GOOGLE_DRIVE/CONFLUENCE/JIRA/CANVAS/BOX/GITHUB/SHAREPOINT）
- **THEN** 返回 `applicable=false` 且 items 为空

#### Scenario: 连接器未启用外部组同步
- **WHEN** 调用该接口且 connector.source 支持外部组同步但 connector_credential_pair.access_type 不是 SYNC
- **THEN** 返回 `applicable=false` 且 items 为空

#### Scenario: cc_pair 不存在
- **WHEN** 调用该接口且 cc_pair_id 不存在
- **THEN** 返回 404

### Requirement: 组成员邮箱查询

系统 SHALL 提供只读接口，按 cc_pair 和组名（external_user_group_id）查询该组的全部成员邮箱，结果按邮箱排序，默认过滤 stale=true 的行。成员邮箱 SHALL 通过 `user__external_user_group_id` 关联 `user` 表获取（不存在独立的 external_user_group 表）。

#### Scenario: 展开组查看成员
- **WHEN** 调用 `/external-user-groups/members?cc_pair_id=4&group_id=jira_org-admins`
- **THEN** 返回该组所有非 stale 成员的去重邮箱列表，按邮箱排序

#### Scenario: 组不存在或无成员
- **WHEN** 调用该接口且该组在该 cc_pair 下无非 stale 记录
- **THEN** 返回空列表（HTTP 200）

### Requirement: 公开外部组查询

系统 SHALL 提供只读接口，按 cc_pair 查询 `public_external_user_group` 表中的公开外部组列表，仅返回组名与 stale 标记（不返回成员），按组名排序，默认过滤 stale=true 的行。接口 SHALL 复用 `{applicable, total_items, items}` 响应结构。

#### Scenario: 查询公开外部组
- **WHEN** 调用 `/external-user-groups/public?cc_pair_id=X`
- **THEN** 返回 `applicable=true` 及非 stale 公开组列表，total_items 为组数

#### Scenario: 无公开外部组
- **WHEN** 调用该接口且该 cc_pair 下 `public_external_user_group` 无非 stale 记录
- **THEN** 返回 `applicable=true`、`total_items=0`、空 items

### Requirement: 管理后台页面与菜单

magicbox-web SHALL 在管理后台 Craft 分组下新增"外部用户组"菜单项，路由为 `/admin/craft/external-groups`，跟随现有 Craft 分组显示条件（`onyx_craft_available`）。页面 SHALL 提供两个 Tab：Tab1"用户-组映射"（连接器下拉 + 组聚合表格 + 行展开查看成员邮箱），Tab2"公开外部组"（连接器下拉 + 公开组列表）。页面 SHALL NOT 修改现有"权限/应用/指令"菜单及其页面。Tab2 无数据时 SHALL 展示引导文案说明仅 Google Drive 会写入公开外部组。

#### Scenario: 菜单可见性
- **WHEN** 管理员登录且 Craft 可用
- **THEN** 侧边栏 Craft 分组下可见"外部用户组"菜单项，点击进入 `/admin/craft/external-groups` 页面

#### Scenario: Tab1 默认不加载
- **WHEN** 进入页面且未选择连接器
- **THEN** Tab1 表格不发起任何数据请求，仅显示空态提示选择连接器

#### Scenario: 选择连接器后检索
- **WHEN** 在 Tab1 下拉框选择连接器（如 jira-connector2）
- **THEN** 表格按所选 cc_pair 加载组聚合数据，支持分页，展开行时按组加载成员邮箱

#### Scenario: 公开组空态引导
- **WHEN** Tab2 所选连接器无公开外部组数据
- **THEN** 显示"仅 Google Drive 会写入"的引导文案

### Requirement: 请求代理与运行约束

magicbox-web SHALL 通过 Next.js rewrites 将 `/api/manage/admin/external-user-groups/:path*` 代理到 `http://127.0.0.1:8090/:path*`，且该规则 SHALL 置于现有 `/api` 代理规则之前。独立 FastAPI 应用 SHALL 仅连接 PostgreSQL（只读，不写入任何数据）、不依赖 Redis、仅绑定 127.0.0.1:8090、本阶段不做用户认证。应用 SHALL NOT 修改 onyx 仓库任何代码。

#### Scenario: 代理规则优先级
- **WHEN** 前端请求 `/api/manage/admin/external-user-groups/external-user-groups?cc_pair_id=4`
- **THEN** 请求被转发至 127.0.0.1:8090 的对应端点，而非 Onyx 后端（8080）

#### Scenario: 服务隔离与回滚
- **WHEN** 停止新应用进程并移除 rewrite 规则
- **THEN** onyx 系统功能不受任何影响，可完全回退
