# Proposal: Sync Files Admin — 同步文件列表与详情管理

## Why

连接器同步产生的批次文件（`file_record` 表，`iab/{cc_pair_id}/{index_attempt_id}/{batch_num}.json`）是文档处理和知识图谱处理的中间载体，但目前没有任何可视化入口：管理员无法直观查看"某个连接器同步了哪些批次文件、docprocessing 是否完成、图谱处理走到哪一步、失败的批次是哪些"。图谱管线（`kg_stage`）自迁移到 `file_record` 表后，这一缺口更加明显。magicbox 管理后台需要一个只读的同步数据监控入口。

## What Changes

- **magicbox-web 新增「数据」一级菜单**，子项「同步文件列表」（路由 `/admin/data/sync-files`）
- **列表页**（只读，文件维度，展示 `file_record` 行）：
  - 列：file_id、文档数（`file_metadata.document_count`）、创建时间、文件处理状态（未处理/处理完成）、图谱处理状态（待处理/提取中/已提取/失败）、图谱处理时间
  - 按连接器（cc_pair）下拉筛选，SQL 层分页
  - 过滤条件：`file_id LIKE 'iab/{cc_pair_id}/%'`（天然排除 checkpoint 等噪声）
- **行内详情**（点「详情」展开）：
  - A 层：从 MinIO 读取 batch JSON，展示其中每个文档的标题、ID、link、更新时间、正文预览（~200 字）、元数据
  - B 层：以文档 id 反查 `document` 表，补充 `last_synced`（是否已索引）与 `chunk_count`——**不展示图谱状态**（以列表页 file_record 的 `kg_stage` 为准，文档级不重复展示）
- **下载操作**：每行提供「下载」按钮，从 MinIO 流式下载该同步批次文件（JSON）
- **magicbox-backend 新增 MinIO 只读访问**（S3 GetObject）与 3 个端点：
  - `GET /sync-files` — 批次文件列表（分页）
  - `GET /sync-files/{file_id}/documents` — 批次内文档明细（JSON + document 表补充）
  - `GET /sync-files/{file_id}/download` — 下载批次文件
- **零侵入**：不修改 Onyx 后端任何代码，全部为 magicbox 独立应用（只读 PG + 只读 MinIO，仅绑定回环地址）

## Capabilities

### New Capabilities
- `sync-files-admin`: magicbox 后台同步文件列表/详情/下载能力，覆盖 file_record 批次文件的文件处理状态与图谱处理状态展示、批次内文档明细读取（MinIO batch JSON + document 表状态补充）、批次文件下载

### Modified Capabilities
<!-- 无既有 spec 需求变更 -->

## Impact

- **magicbox-backend**：`app/main.py` 新增端点；新增 MinIO/S3 只读客户端依赖（`boto3`）；`.env`/`.env.example` 增加 `S3_ENDPOINT_URL`、`S3_FILE_STORE_BUCKET_NAME`、`S3_AWS_ACCESS_KEY_ID`、`S3_AWS_SECRET_ACCESS_KEY`；README 依赖表更新
- **magicbox-web**：`AdminSidebar.tsx` 新增一级菜单分组；新增 `src/views/admin/syncFiles/` 视图（列表 + 详情 + 下载）；`src/lib/admin-routes.ts`、`src/lib/swr-keys.ts` 新增路由与 key；`next.config.js` rewrites 新增 `/api/manage/admin/sync-files/:path*` → `127.0.0.1:8090`
- **Onyx backend**：无改动
