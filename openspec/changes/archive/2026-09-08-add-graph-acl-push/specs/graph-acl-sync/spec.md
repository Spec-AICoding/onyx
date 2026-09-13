# graph-acl-sync Specification

## Purpose

定义 onyx → magicbox-backend 的 ACL 增量推送链路：推送端（onyx Celery task）的增量查询与水位推进规则，接收端（magicbox-backend `POST /acl/sync`）的快照节点维护与实体 ACL 覆盖写重算语义。

## ADDED Requirements

### Requirement: ACL 批量同步接口

magicbox-backend SHALL 提供 `POST /acl/sync` 接口（无认证），接收 `{"docs": [{doc_id, external_user_emails, external_user_group_ids, is_public}]}` 载荷。接口 SHALL 是幂等的：对每个 doc 先 upsert 对应的 `:AclDocument` 快照节点，随后重算所有受影响实体的 ACL 属性。空 docs 数组 SHALL 返回 HTTP 200。响应 SHALL 包含 `{"docs_updated": n, "entities_updated": m}` 计数。

#### Scenario: 正常批量推送
- **WHEN** 推送端 POST 一批含多个 doc_id 的 ACL 载荷
- **THEN** 每个 doc_id 对应一个 `:AclDocument` 快照节点（属性 emails/groups/is_public/updated_at），所有 biz_id 引用这些 doc_id 的实体 ACL 被重算，返回 200 与计数

#### Scenario: 空批次
- **WHEN** 载荷 docs 为空数组
- **THEN** 返回 200 且计数均为 0，不执行任何写操作

#### Scenario: 重复推送同一 doc
- **WHEN** 同一 doc_id 的 ACL 被再次推送（值相同或不同）
- **THEN** 快照节点被覆盖更新，实体重算结果一致，幂等无副作用

### Requirement: ACL 快照节点

每个已推送文档 SHALL 在 Neo4j 中对应一个 `:AclDocument` 节点，属性为 `doc_id`（onyx document.id 原值）、`external_user_emails`（字符串数组）、`external_user_group_ids`（字符串数组，存储带源前缀的组名）、`is_public`（布尔）、`updated_at`（推送时间）。快照节点 SHALL 使用固定 label `AclDocument`，不属于任何 workspace label。

#### Scenario: 快照节点生命周期
- **WHEN** 文档 ACL 被推送后，`:AclDocument {doc_id}` 节点持续存在并被后续推送更新
- **THEN** 实体聚合始终以最新快照值为准；未被任何实体 biz_id 引用的快照节点不产生任何影响

### Requirement: 实体 ACL 覆盖写重算

实体的 `is_public` / `external_user_emails` / `external_user_group_ids` 属性 SHALL 由其 biz_id 引用的全部 `:AclDocument` 快照聚合得出：emails 取去重并集、groups 取去重并集、`is_public` 取逻辑或。重算 SHALL 采用覆盖写（SET），而非 union 累积，使权限收窄生效。实体 biz_id 引用的文档若无对应快照节点，该文档 SHALL 不贡献任何 ACL 值。时序约束：同一批内 SHALL 先完成全部快照 upsert，再执行实体重算。

#### Scenario: 权限收窄生效
- **WHEN** 某文档 ACL 由包含用户 X 变为不包含 X 并被推送
- **THEN** 引用该文档的实体重算后 `external_user_emails` 不再包含 X

#### Scenario: 多文档并集
- **WHEN** 实体 biz_id 引用文档 A、B，各自 ACL 不同
- **THEN** 实体属性为 A、B 快照的并集；任一文档 `is_public=true` 时实体 `is_public=true`

#### Scenario: 引用无快照的文档
- **WHEN** 实体 biz_id 引用的某 doc_id 从未被推送过
- **THEN** 该 doc_id 不贡献 ACL，重算不会清除其它文档贡献的值

### Requirement: 推送端增量查询与水位

onyx 侧 `push_graph_acl` 任务 SHALL 对 `GRAPH_ACL_PUSH_SOURCES` 白名单中的每个 source，查询 `document` 表中 `last_modified > watermark` 且属于该 source 的文档（经 document_by_connector_credential_pair → connector_credential_pair → connector 关联过滤），合并为一个批次 POST。水位 SHALL 按 source 粒度存储在 `graph_acl_push_state` 表（source 唯一一行，watermark 初始为 epoch）。任务 SHALL 仅在 HTTP 2xx 后推进该 source 的水位（取本轮快照时间减 60 秒重叠窗口），失败 SHALL 不推进水位并记录 last_error。`GRAPH_ACL_PUSH_ENABLED=false` 时任务 SHALL 不执行任何操作。

#### Scenario: 首轮全量
- **WHEN** watermark 为初始值（epoch）时任务执行
- **THEN** 白名单 source 的全部文档被推送，随后水位推进

#### Scenario: 失败重推
- **WHEN** POST 返回非 2xx 或网络失败
- **THEN** 水位不推进，下一轮重查重推同一批增量，last_error 记录错误

#### Scenario: 未开启
- **WHEN** `GRAPH_ACL_PUSH_ENABLED` 为 false
- **THEN** 任务为 no-op，不查询不推送

### Requirement: 水位表

`graph_acl_push_state` 表 SHALL 存在，DDL 由 `backend/deployment/db/add_graph_acl_push_state.sql` 提供（幂等，IF NOT EXISTS），字段为 `id`、`source`（唯一）、`watermark`、`last_pushed_at`、`last_error`。对应 SQLAlchemy ORM model SHALL 注册到 onyx 模型层供任务读写。

#### Scenario: 建表幂等
- **WHEN** DDL 文件被重复执行
- **THEN** 表已存在时不报错，结构不变
