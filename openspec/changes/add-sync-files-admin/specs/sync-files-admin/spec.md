# Sync Files Admin Specification

## ADDED Requirements

### Requirement: 同步文件列表页

magicbox 管理后台 SHALL 提供「数据」一级菜单，包含「同步文件列表」子项（路由 `/admin/data/sync-files`）。页面 SHALL 允许管理员选择一个连接器（cc_pair），并以文件维度分页展示该连接器的同步批次文件（`file_record` 中 `file_id LIKE 'iab/{cc_pair_id}/%'` 的行）。列表每一行 MUST 展示：file_id、文档数（`file_metadata.document_count`）、创建时间、文件处理状态（`processed=false` 显示「未处理」，`processed=true` 显示「处理完成」）、图谱处理状态（`kg_stage` 映射：not_started→待处理、extracting→提取中、extracted→已提取、failed→失败）、图谱处理时间（`kg_processing_time`）。

#### Scenario: 查看某连接器的同步文件列表

- **WHEN** 管理员在「数据」菜单下打开同步文件列表页并选择一个连接器
- **THEN** 页面展示该连接器的批次文件列表，每行含 file_id、文档数、创建时间、文件处理状态、图谱处理状态、图谱处理时间，并支持分页

#### Scenario: 连接器无同步文件

- **WHEN** 所选连接器没有任何 `iab/{cc_pair_id}/%` 前缀的 file_record
- **THEN** 页面展示空态提示「暂无同步文件」，不报错

#### Scenario: 文件处理状态两态展示

- **WHEN** 某行的 `processed` 为 false
- **THEN** 该行文件处理状态显示「未处理」；当 `processed` 为 true 时显示「处理完成」

#### Scenario: 图谱处理状态四态展示

- **WHEN** 某行的 `kg_stage` 分别为 not_started / extracting / extracted / failed
- **THEN** 图谱处理状态分别显示「待处理」「提取中」「已提取」「失败」，图谱处理时间为空时显示占位符

### Requirement: 批次文件文档详情

列表每一行 SHALL 提供「详情」操作，展开后展示该批次文件内的文档明细。文档明细 MUST 包含来自 batch JSON（MinIO）的：标题（semantic_identifier）、文档 ID、link（可点击）、源更新时间（doc_updated_at）、正文预览（首个文本 section 截取约 200 字）、元数据（metadata）。文档明细 MUST 以文档 id 反查 `document` 表补充索引状态：`last_synced`（非空表示已索引）、`chunk_count`（非 0 表示已写入索引）。文档明细 MUST NOT 展示 `document.kg_stage`。

#### Scenario: 查看批次内文档明细

- **WHEN** 管理员点击某行的「详情」
- **THEN** 展开区域展示该批次内每个文档的标题、ID、link、更新时间、正文预览与元数据

#### Scenario: 文档索引状态补充

- **WHEN** 批次内某文档 id 存在于 document 表且 `last_synced` 非空、`chunk_count` 非 0
- **THEN** 该文档展示「已索引」状态与 chunk 数；不存在于 document 表时展示「未索引」

#### Scenario: batch JSON 内容不可用

- **WHEN** MinIO 中找不到该批次文件对象
- **THEN** 详情区域展示「内容不可用」提示，不影响列表页其它行

#### Scenario: 详情不展示 document 表图谱状态

- **WHEN** 文档明细加载完成
- **THEN** 任何文档行均不出现图谱状态字段

### Requirement: 下载同步批次文件

列表每一行 SHALL 提供「下载」操作，将 MinIO 中的批次文件（JSON）以附件形式下载到本地。下载文件名 SHALL 使用对象 key 的末段（如 `0.json`）。

#### Scenario: 下载批次文件

- **WHEN** 管理员点击某行的「下载」
- **THEN** 浏览器下载该批次 JSON 文件，响应头含 `Content-Disposition: attachment`

#### Scenario: 下载对象缺失

- **WHEN** MinIO 中找不到该批次文件对象
- **THEN** 下载返回 404，前端提示「文件不可用」

### Requirement: 同步文件 API 只读访问

magicbox-backend SHALL 提供以下只读端点，全部仅绑定回环地址、无认证：`GET /sync-files?cc_pair_id=&page_num=&page_size=`（列表，SQL 层分页）、`GET /sync-files/{file_id}/documents`（文档明细）、`GET /sync-files/{file_id}/download`（流式下载）。列表端点 SHALL 返回 `{applicable, reason, total_items, items}` 结构；cc_pair 不存在时返回 404。API 不得修改任何数据。

#### Scenario: cc_pair 不存在

- **WHEN** 请求列表端点且 cc_pair_id 在 connector_credential_pair 中不存在
- **THEN** 返回 404，detail 为 "cc_pair not found"

#### Scenario: 列表分页

- **WHEN** 请求 `page_num=N&page_size=M`
- **THEN** 返回第 N 页的 M 条记录及 total_items 总数

#### Scenario: 详情返回摘要而非全文

- **WHEN** 请求某文件的 documents 端点
- **THEN** 每个文档仅返回摘要字段与截断预览，不返回完整正文
