# Design: Sync Files Admin — 同步文件列表与详情管理

## Context

连接器同步产生的批次文件（`file_record`，`iab/{cc_pair_id}/{index_attempt_id}/{batch_num}.json`）是整个文档处理链路（docfetch → docprocessing → 图谱处理）的中间载体：

- `file_record.processed`：docprocessing 完成标记（软删除语义，批处理完成后仅置 true，对象与行都保留）
- `file_record.kg_stage` / `kg_processing_time`：图谱处理状态（自定义管线写入：not_started → extracting → extracted/failed）
- batch JSON 内容：同步时序列化的完整 `Document` 列表（id、semantic_identifier、link、doc_updated_at、sections 全文、metadata 等），存于 MinIO（S3）

约束：
- magicbox-backend 为独立 FastAPI 应用，仅绑定回环地址、无认证、目前仅只读 PG
- 不修改 Onyx 后端任何代码（零侵入）
- `document` 表与 `file_record` 无外键、无批次关联（`document.file_id` 仅少数连接器用于附件引用）；图谱状态以 `file_record.kg_stage` 为准

## Goals / Non-Goals

**Goals:**
- magicbox 后台新增「数据」一级菜单 → 同步文件列表页
- 列表展示 file_record 批次文件（文件维度）：文档数、创建时间、文件处理状态（未处理/处理完成）、图谱处理状态、图谱处理时间
- 行内详情：读 MinIO batch JSON 展示文档明细（A 层）+ 以 id 反查 document 表补充索引状态（B 层：`last_synced`、`chunk_count`）
- 每行支持下载同步批次文件
- 全部只读，零侵入 Onyx

**Non-Goals:**
- 不展示 document 表的 kg_stage（避免与 file_record 的图谱状态冲突/重复）
- 不做"处理中"实时推断（不依赖 Redis；`processed=false` 一律显示「未处理」）
- 不展示文档级全文（详情只给 ~200 字预览）
- 不修改 Onyx 后端、不加写操作、不加认证（维持回环 + 内网信任边界）
- 不实现文档级分页（单批次文档数 ~几十，一次返回）

## Decisions

### D1: 列表数据源 = 纯 PG，过滤用 `file_id LIKE 'iab/{cc_pair_id}/%'`

- 实测 `file_metadata->>'cc_pair_id'` 在现存数据中为 NULL，不可作为关联键；`file_id` 前缀稳定可靠（`document_batch_storage.py` 的 base path 即 `iab/{cc_pair_id}`）
- 该前缀天然排除 `INDEXING_CHECKPOINT` 等噪声行
- 排序：`created_at DESC`

### D2: 详情 A 层 = 读 MinIO batch JSON

- 依据 `file_record.bucket_name` + `object_key` 定位对象（S3 GetObject）
- 服务端解析 JSON，仅返回摘要字段：`id`、`semantic_identifier`、`link`、`doc_updated_at`、`text_preview`（首个文本 section 截 ~200 字）、`metadata`、`section_count`
- 理由：`document` 表无批次关联，JSON 是唯一按批次取文档的途径；批次文件按软删除语义保留，内容可靠

### D3: 详情 B 层 = 以文档 id 反查 document 表（`WHERE id IN (...)`）

- 补充字段仅 `last_synced`（非 NULL = 已索引）、`chunk_count`（非 0 = 已写入）
- 明确**不**返回 `document.kg_stage`：自定义图谱管线写的是 file_record，两表字段可能不一致，文档级不重复展示图谱状态
- 批次文档 id 数量有限，单条 IN 查询很轻

### D4: magicbox-backend 新增 MinIO 只读客户端（boto3）

- 仅实现 GetObject 路径，凭证（endpoint/bucket/access key/secret）进 `.env`（从 `backend/.env` 复制同款 S3 变量）
- 选 boto3 而非 minio SDK：S3 兼容、与 Onyx 后端一致、环境已有凭证
- 无 Redis、无认证、仅回环——保持现有信任边界

### D5: 端点与响应形状

沿用外部用户组模式：`{applicable, reason, total_items, items}`；`applicable=false` 仅当 cc_pair 不存在（404）——同步文件对全部连接器适用，无 source/access_type 白名单限制。

| 端点 | 说明 |
|---|---|
| `GET /sync-files?cc_pair_id=&page_num=&page_size=` | 列表，SQL 层分页，`file_id LIKE 'iab/{cc}/%'` |
| `GET /sync-files/{file_id}/documents` | 详情：MinIO 解析 + document 表补充 |
| `GET /sync-files/{file_id}/download` | 流式下载（`Content-Disposition: attachment`，文件名取 object_key 末段） |

### D6: 前端结构与交互

- `AdminSidebar.tsx`：`SECTIONS` 新增 `DATA: "数据"` 一级分组，子项「同步文件列表」→ `/admin/data/sync-files`
- 复用外部用户组 view 的模式：连接器下拉（`useConnectorStatus`）+ `useSyncAttemptsPaginatedFetch` 分页 + 行内展开详情（仿 `GroupMembersPanel`）
- 详情文档表列：标题、文档 ID、更新时间、内容预览、索引状态（last_synced/chunk_count）、操作（链接可点）
- 下载：行内按钮，`window.location`/`<a download>` 指向代理后的下载 URL

### D7: 代理与密钥

- `next.config.js` rewrites 新增 `/api/manage/admin/sync-files/:path*` → `http://127.0.0.1:8090/sync-files/:path*`（置于其它规则之前，与外部用户组一致）
- `swr-keys.ts` 新增基础 key + probe key（复用分页 hook 约定）

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| MinIO 对象偶发缺失（从未写入/被清理） | 详情/下载端点返回 404 + 明确错误信息，前端展示"内容不可用"空态，不报错 |
| batch JSON 可能较大（含全文） | 服务端解析后只返回摘要字段 + 截断预览；下载走流式 |
| 列表 `LIKE 'iab/{cc}/%'` 在 file_id（PK）上无专用索引 | 当前数据量（~百行）无压力；若批次积累到百万级，需对 file_id 建 `text_pattern_ops` 前缀索引（后置优化项） |
| file_record 与 document 表图谱状态不一致 | B 层不展示 kg_stage，图谱状态只以列表页 file_record 为准 |
| 新增 S3 凭证泄露面 | 仅回环绑定 + 只读 GetObject；凭证存 `.env`（gitignore） |

## Migration Plan

1. 部署顺序：magicbox-backend 先（新增 boto3 依赖、`.env` 补 S3 变量、启动校验 MinIO 连通性），再 magicbox-web
2. 无数据库变更、无 Onyx 变更
3. 回滚：移除侧边栏菜单项与 rewrites 规则即可；后端端点无副作用（纯只读）

## Open Questions

- 无阻塞项。小决策（实施时可定）：列表默认排序用 `created_at DESC`；详情文档表不分页（单批次文档数有限）
