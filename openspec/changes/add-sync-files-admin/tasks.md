# Tasks: Sync Files Admin

## 1. magicbox-backend：MinIO 只读访问

- [x] 1.1 在 `magicbox-backend` 安装 `boto3` 依赖并加入 requirements.txt
- [x] 1.2 `.env.example` 增加 `S3_ENDPOINT_URL` / `S3_FILE_STORE_BUCKET_NAME` / `S3_AWS_ACCESS_KEY_ID` / `S3_AWS_SECRET_ACCESS_KEY`（本地 `.env` 从 backend/.env 复制）
- [x] 1.3 新增 `app/s3.py`：boto3 只读客户端（endpoint/bucket/凭证从环境读取），提供 `get_object(bucket, key)` 返回字节流，对象缺失时抛 `ObjectNotFoundError`

## 2. magicbox-backend：列表端点

- [x] 2.1 `GET /sync-files`：校验 cc_pair 存在（404）；`file_id LIKE 'iab/{cc_pair_id}/%'` 过滤 + `created_at DESC` 排序 + SQL 层分页；返回 `{applicable, reason, total_items, items}`，items 含 file_id、display_name、document_count（file_metadata）、created_at、processed、kg_stage、kg_processing_time

## 3. magicbox-backend：详情与下载端点

- [x] 3.1 `GET /sync-files/{file_id}/documents`：查 file_record（404 if 无）→ MinIO 读对象 → 解析 JSON → 每文档摘要（id、semantic_identifier、link、doc_updated_at、text_preview ~200 字、metadata、section_count）→ 以 id 反查 document 表补 last_synced/chunk_count（不含 kg_stage）；对象缺失返回 404 + 明确 detail
- [x] 3.2 `GET /sync-files/{file_id}/download`：流式返回对象内容，`Content-Disposition: attachment`，文件名取 object_key 末段；对象缺失返回 404
- [x] 3.3 用真实数据自测三个端点（curl 列表/详情/下载）

## 3b. magicbox-backend：任务列表层（连接器 → 任务 → 文件）

- [x] 3b.1 `GET /sync-attempts?cc_pair_id=&page_num=&page_size=`：查 index_attempt（cc_pair 不存在 404），返回 id/status（7 态，DB 枚举大写已统一转小写）/total_docs_indexed/file_count（子查询 COUNT file_record LIKE 'iab/{cc}/{attempt}/%'）/completed_batches/total_batches/error_msg/time_started/time_updated，SQL 分页 + time_created 倒序
- [x] 3b.2 `/sync-files` 增加可选 `index_attempt_id` 参数：存在时过滤 `file_id LIKE 'iab/{cc}/{attempt}/%'`
- [x] 3b.3 curl 自测：任务列表（含 file_count）、按任务过滤的文件列表、无批次文件的任务（file_count=0）

## 4. magicbox-web：路由、代理与密钥

- [x] 4.1 `next.config.js` rewrites 新增 `/api/manage/admin/sync-files/:path*` → `http://127.0.0.1:8090/sync-files/:path*`（置于其它规则之前）
- [x] 4.2 `src/lib/admin-routes.ts` 新增 `SYNC_FILES` 路由（path `/admin/data/sync-files`，图标与标题「同步文件列表」）
- [x] 4.3 `src/lib/swr-keys.ts` 新增 `syncFiles` 基础 key 与 `syncFilesProbe`、`syncFileDocuments` key

## 5. magicbox-web：一级菜单与页面

- [x] 5.1 `AdminSidebar.tsx`：SECTIONS 新增 `DATA: "数据"`，在合适位置 add SYNC_FILES 子项
- [x] 5.2 新建 `src/app/admin/data/sync-files/page.tsx` + `src/views/admin/syncFiles/SyncFilesView.tsx`：连接器下拉（useConnectorStatus）+ useSyncAttemptsPaginatedFetch 分页列表 + 状态列（文件处理两态、图谱处理四态）+ 空态/加载/错误态
- [x] 5.3 列表行内展开详情面板（仿 GroupMembersPanel）：文档表（标题、ID、link、更新时间、预览、索引状态）+ 「内容不可用」空态
- [x] 5.4 每行「下载」按钮（<a> 指向代理下载 URL）
- [x] 5.5 运行 `bun run types:check` 通过

## 5b. magicbox-web：任务列表层与下钻

- [x] 5b.1 `swr-keys.ts` 新增 `syncAttempts` / `syncAttemptsProbe` key
- [x] 5b.2 `types.ts` 新增 `SyncAttemptItem`（status 7 态标签）与 `SyncAttemptListResponse`
- [x] 5b.3 `SyncFilesView.tsx` 改造为两级视图：连接器下拉 → 任务列表（状态/文档数/文件数/批次进度/时间）→ 点击任务切换文件列表视图（返回按钮，文件行展开文档面板不变）
- [x] 5b.4 运行 `bun run types:check` 通过（改动文件 0 错误）

## 6. 验证

- [x] 6.1 启动 magicbox-backend，curl 自测三端点（列表分页、详情字段、下载响应头、404 场景）
- [x] 6.2 浏览器验证：菜单出现、列表加载、详情展开、下载可用（登录 admin 用户）
- [x] 6.3 更新 magicbox-backend/README.md（端点表 + MinIO 依赖表）
- [x] 6.4 浏览器验证任务下钻：任务列表 → 点击任务 → 文件列表（仅该任务）→ 返回
- [x] 6.5 更新 magicbox-backend/README.md（sync-attempts 端点）
