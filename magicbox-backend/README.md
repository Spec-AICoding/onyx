# magicbox-backend（外部用户组管理 / 同步文件 API）

为 magicbox-web 的「外部用户组」管理页与「同步文件列表」管理页提供的独立 FastAPI 应用。仅连接 PostgreSQL（只读查询）与 MinIO（只读 GetObject），不依赖、不侵入 Onyx 代码，无 Redis、无认证（仅绑定回环地址）。

## 运行

```bash
cd magicbox-backend
cp .env.example .env   # 如需覆盖数据库连接串（默认 postgres:password@81.70.98.107:5432/postgres）
./run.sh               # 首次运行自动创建 .venv 并安装依赖，随后启动 uvicorn
```

服务监听 `127.0.0.1:8090`，由 magicbox-web 的 `next.config.js` rewrites 规则
（`/api/manage/admin/external-user-groups/:path*`、`/api/manage/admin/sync-attempts/:path*` 与 `/api/manage/admin/sync-files/:path*`）服务端代理访问，外部不可直达。

开发时建议加 `--reload`：

```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8090 --reload
```

## 依赖表（启动时校验）

- `user__external_user_group_id`（用户 ↔ 外部组映射）
- `public_external_user_group`（公开外部组）
- `user`（成员邮箱）
- `index_attempt`（同步任务：状态/文档数/批次进度）
- `file_record`（同步批次文件：状态 + MinIO 定位）
- `document`（文档索引状态补充：last_synced / chunk_count）
- `connector_credential_pair` / `connector`（source / access_type 判定）

## 依赖对象存储（MinIO / S3 兼容）

同步文件内容存放在 MinIO 桶 `onyx-file-store-bucket`（见 `.env` 的 `S3_*` 变量）。读取策略：

- `file_record.object_key` 与 `file_id` 不同（例如 file_id=`iab/3/229/0.json` 对应 object_key=`onyx-files/public/iab_3_226_0.json`），必须用 file_record 中存储的 object_key 取对象；
- 批次文件按软删除语义保留：Onyx 的 `delete_batch_by_name` 只标记 `processed=true`，对象不会被物理删除；
- 对象缺失时详情/下载接口返回 404（`batch file content unavailable`）。

## 端点（全部只读 GET）

| 路径 | 说明 |
| --- | --- |
| `/external-user-groups?cc_pair_id=X&page_num=N&page_size=M` | 组聚合列表（过滤 stale=false，SQL 层分页） |
| `/external-user-groups/members?cc_pair_id=X&group_id=Y` | 组内成员邮箱（非过期） |
| `/external-user-groups/public?cc_pair_id=X` | 公开外部组列表 |
| `/sync-attempts?cc_pair_id=X&page_num=N&page_size=M` | 连接器的同步任务列表（index_attempt，按 time_created 倒序，含每任务批次文件数 file_count） |
| `/sync-files?cc_pair_id=X&page_num=N&page_size=M` | 连接器的同步批次文件列表（file_id 前缀 `iab/{X}/%`，按 created_at 倒序，SQL 层分页） |
| `/sync-files?cc_pair_id=X&index_attempt_id=Y&page_num=N&page_size=M` | 指定任务的批次文件列表（file_id 前缀 `iab/{X}/{Y}/%`） |
| `/sync-files/{file_id}/documents` | 批次文件内文档摘要（读 MinIO 批次 JSON + document 表补充 last_synced/chunk_count） |
| `/sync-files/{file_id}/download` | 下载批次文件原样 JSON（attachment） |

响应统一为 `{applicable, reason, total_items, items}`（members 为 `{emails}`，documents 为 `{total_items, items}`）：
- `applicable=false, reason=unsupported_source`：`connector.source` 不在组同步白名单（GOOGLE_DRIVE/CONFLUENCE/JIRA/CANVAS/BOX/GITHUB/SHAREPOINT）
- `applicable=false, reason=not_synced`：`access_type != 'SYNC'`
- cc_pair 不存在：404

同步任务状态字段（`index_attempt`）：
- `status`：7 态——`not_started`（未开始）/ `in_progress`（进行中）/ `success`（成功）/ `canceled`（已取消）/ `interrupted`（中断）/ `failed`（失败）/ `completed_with_errors`（有错误完成）；DB 枚举存大写，端点统一转小写
- `total_docs_indexed`：已索引文档数
- `file_count`：该任务产生的批次文件数（子查询统计 file_record）
- `completed_batches` / `total_batches`：批次进度（total 未设置时前端显示 —）
- `error_msg`：失败原因（仅 status=failed）

同步文件状态字段（`file_record`）：
- `processed`：文件处理状态（docprocessing 完成标记，软删除语义）——未处理 / 处理完成
- `kg_stage`：图谱处理状态——`not_started`（待处理）/ `extracting`（提取中）/ `extracted`（已提取）/ `failed`（失败）
- `kg_processing_time`：图谱处理完成时间
- `file_metadata->>'document_count'`：批次文档数

`file_id` 含斜杠（`iab/{cc}/{attempt}/{batch}.json`），详情/下载路由使用 `{file_id:path}` 转换器，并需先于其它泛化路由声明（Starlette 按声明顺序匹配）。
