"""外部用户组管理只读 API。

端点（响应结构与 Onyx `CCPairSyncAttemptsResponse` 形状一致）：
- GET /external-user-groups?cc_pair_id=&page_num=&page_size=   组聚合（分页）
- GET /external-user-groups/members?cc_pair_id=&group_id=      组成员邮箱
- GET /external-user-groups/public?cc_pair_id=                 公开外部组

applicable 语义：
- cc_pair 不存在 → 404
- connector.source 不在 GROUP_SYNC_SOURCES → applicable=false, reason=unsupported_source
- access_type != 'SYNC' → applicable=false, reason=not_synced
"""

from contextlib import asynccontextmanager
import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text

from .db import engine, verify_tables
from .s3 import ObjectNotFoundError, get_object_bytes

# 支持外部组同步的连接器 source（与 onyx sync_params 的 group_sync 源一致；DB 存大写）
GROUP_SYNC_SOURCES = {
    "GOOGLE_DRIVE",
    "CONFLUENCE",
    "JIRA",
    "CANVAS",
    "BOX",
    "GITHUB",
    "SHAREPOINT",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    verify_tables()
    yield


app = FastAPI(title="External User Groups Admin", version="0.1.0", lifespan=lifespan)


class GroupItem(BaseModel):
    # id 与 external_user_group_id 同值，供前端分页 hook 的泛型约束使用
    id: str
    external_user_group_id: str
    member_count: int
    stale: bool


class GroupListResponse(BaseModel):
    applicable: bool
    reason: str | None = None
    total_items: int = 0
    items: list[GroupItem] = []


class PublicGroupItem(BaseModel):
    external_user_group_id: str
    stale: bool


class PublicGroupResponse(BaseModel):
    applicable: bool
    reason: str | None = None
    total_items: int = 0
    items: list[PublicGroupItem] = []


class MembersResponse(BaseModel):
    emails: list[str]


class ConnectorResponse(BaseModel):
    cc_pair_id: int
    name: str
    source: str


class ConnectorListItem(BaseModel):
    source: str
    names: list[str]


class ConnectorListResponse(BaseModel):
    connectors: list[ConnectorListItem]


def _check_applicable(cc_pair_id: int) -> tuple[bool, str | None]:
    """返回 (applicable, reason)；cc_pair 不存在时抛 404。"""
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT c.source, ccp.access_type
                FROM connector_credential_pair ccp
                JOIN connector c ON c.id = ccp.connector_id
                WHERE ccp.id = :cc_pair_id
                """
            ),
            {"cc_pair_id": cc_pair_id},
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="cc_pair not found")

    source, access_type = row
    if source not in GROUP_SYNC_SOURCES:
        return False, "unsupported_source"
    if access_type != "SYNC":
        return False, "not_synced"
    return True, None


@app.get("/external-user-groups", response_model=GroupListResponse)
def list_external_user_groups(
    cc_pair_id: int,
    page_num: int = Query(0, ge=0),
    page_size: int = Query(50, ge=1, le=1000),
) -> GroupListResponse:
    applicable, reason = _check_applicable(cc_pair_id)
    if not applicable:
        return GroupListResponse(applicable=False, reason=reason)

    with engine.connect() as conn:
        total = conn.execute(
            text(
                """
                SELECT COUNT(*) FROM (
                    SELECT 1 FROM user__external_user_group_id
                    WHERE cc_pair_id = :cc_pair_id AND stale = false
                    GROUP BY external_user_group_id, stale
                ) grouped
                """
            ),
            {"cc_pair_id": cc_pair_id},
        ).scalar_one()

        rows = conn.execute(
            text(
                """
                SELECT external_user_group_id, COUNT(*) AS member_count, stale
                FROM user__external_user_group_id
                WHERE cc_pair_id = :cc_pair_id AND stale = false
                GROUP BY external_user_group_id, stale
                ORDER BY external_user_group_id
                LIMIT :page_size OFFSET :offset
                """
            ),
            {
                "cc_pair_id": cc_pair_id,
                "page_size": page_size,
                "offset": page_num * page_size,
            },
        ).fetchall()

    return GroupListResponse(
        applicable=True,
        total_items=total,
        items=[
            GroupItem(
                id=row[0],
                external_user_group_id=row[0],
                member_count=row[1],
                stale=row[2],
            )
            for row in rows
        ],
    )


@app.get("/external-user-groups/members", response_model=MembersResponse)
def list_group_members(cc_pair_id: int, group_id: str) -> MembersResponse:
    # 仅校验 cc_pair 存在性；applicable 由前端在主列表处把关
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM connector_credential_pair WHERE id = :cc_pair_id"),
            {"cc_pair_id": cc_pair_id},
        ).first()
        if exists is None:
            raise HTTPException(status_code=404, detail="cc_pair not found")

        emails = conn.execute(
            text(
                """
                SELECT DISTINCT u.email
                FROM user__external_user_group_id m
                JOIN "user" u ON u.id = m.user_id
                WHERE m.cc_pair_id = :cc_pair_id
                  AND m.external_user_group_id = :group_id
                  AND m.stale = false
                ORDER BY u.email
                """
            ),
            {"cc_pair_id": cc_pair_id, "group_id": group_id},
        ).scalars()

    return MembersResponse(emails=list(emails))


@app.get("/external-user-groups/public", response_model=PublicGroupResponse)
def list_public_external_groups(cc_pair_id: int) -> PublicGroupResponse:
    applicable, reason = _check_applicable(cc_pair_id)
    if not applicable:
        return PublicGroupResponse(applicable=False, reason=reason)

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT external_user_group_id, stale
                FROM public_external_user_group
                WHERE cc_pair_id = :cc_pair_id AND stale = false
                ORDER BY external_user_group_id
                """
            ),
            {"cc_pair_id": cc_pair_id},
        ).fetchall()

    return PublicGroupResponse(
        applicable=True,
        total_items=len(rows),
        items=[
            PublicGroupItem(external_user_group_id=row[0], stale=row[1])
            for row in rows
        ],
    )


@app.get("/connectors/{cc_pair_id}", response_model=ConnectorResponse)
def get_connector(cc_pair_id: int) -> ConnectorResponse:
    """连接器元数据（名称与来源），供 LightRAG 图谱标签注入使用。

    由文件名 iab_{cc_pair_id}_{attempt}_{batch}.json 解析出 cc_pair_id 后调用；
    查不到返回 404。
    """
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT ccp.id, c.name, c.source
                FROM connector_credential_pair ccp
                JOIN connector c ON c.id = ccp.connector_id
                WHERE ccp.id = :cc_pair_id
                """
            ),
            {"cc_pair_id": cc_pair_id},
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="cc_pair not found")

    return ConnectorResponse(cc_pair_id=row[0], name=row[1], source=row[2])


@app.get("/connectors", response_model=ConnectorListResponse)
def list_connectors() -> ConnectorListResponse:
    """连接器配置列表（按 source 分组），供图谱过滤下拉框使用。

    数据来自 onyx 配置库（connector ⋈ connector_credential_pair），与
    LightRAG 摄取时注入图谱的 connector_source / connector_name 同源。
    DELETING / INVALID 状态的配对不可用，予以排除。
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT c.source,
                       array_agg(DISTINCT c.name ORDER BY c.name) AS names
                FROM connector_credential_pair ccp
                JOIN connector c ON c.id = ccp.connector_id
                WHERE ccp.status NOT IN ('DELETING', 'INVALID')
                GROUP BY c.source
                ORDER BY c.source
                """
            )
        ).fetchall()

    return ConnectorListResponse(
        connectors=[
            ConnectorListItem(source=row[0], names=list(row[1] or []))
            for row in rows
        ]
    )


# ── 同步文件列表 / 详情 / 下载 ────────────────────────────────────────────
# 批次文件：file_id 形如 iab/{cc_pair_id}/{index_attempt_id}/{batch_num}.json
# 文件处理状态 = file_record.processed（docprocessing 完成标记，软删除语义）
# 图谱处理状态 = file_record.kg_stage（not_started/extracting/extracted/failed）


class SyncFileItem(BaseModel):
    id: str  # 与 file_id 同值，供前端分页 hook 的泛型约束使用
    file_id: str
    cc_pair_id: int  # 所属连接器实例（按类型聚合检索时区分行归属）
    display_name: str | None = None
    document_count: int | None = None
    created_at: str | None = None
    processed: bool
    kg_stage: str | None = None
    kg_processing_time: str | None = None


class SyncFileListResponse(BaseModel):
    applicable: bool
    reason: str | None = None
    total_items: int = 0
    items: list[SyncFileItem] = []


class DocumentSummaryItem(BaseModel):
    id: str
    semantic_identifier: str | None = None
    link: str | None = None
    doc_updated_at: str | None = None
    text_preview: str | None = None
    metadata: dict | None = None
    section_count: int = 0
    # document 表补充（只读状态，不含图谱状态）
    last_synced: str | None = None
    chunk_count: int | None = None
    # 外部访问控制（document 表 ACL 三字段）
    external_user_emails: list[str] | None = None
    external_user_group_ids: list[str] | None = None
    is_public: bool | None = None


class DocumentsResponse(BaseModel):
    total_items: int = 0
    items: list[DocumentSummaryItem] = []


# ── 同步任务列表（连接器 → 任务 → 文件） ─────────────────────────────────
# 任务 = index_attempt 行；批次文件 file_id 前缀 iab/{cc}/{attempt}/ 与任务关联


class SyncAttemptItem(BaseModel):
    id: int  # index_attempt.id（分页 hook 泛型约束需要 id 字段）
    cc_pair_id: int  # 所属连接器实例（按类型聚合检索时下钻文件用）
    status: str  # IndexingStatus 7 态
    total_docs_indexed: int | None = None
    file_count: int = 0  # 该任务产生的批次文件数
    completed_batches: int | None = None
    total_batches: int | None = None
    error_msg: str | None = None
    time_started: str | None = None
    time_updated: str | None = None


class SyncAttemptListResponse(BaseModel):
    applicable: bool
    reason: str | None = None
    total_items: int = 0
    items: list[SyncAttemptItem] = []


@app.get("/sync-attempts", response_model=SyncAttemptListResponse)
def list_sync_attempts(
    cc_pair_id: int | None = None,
    source: str | None = None,
    page_num: int = Query(0, ge=0),
    page_size: int = Query(50, ge=1, le=1000),
) -> SyncAttemptListResponse:
    """List index attempts for one connector instance or all instances of a
    connector source. Exactly one of ``cc_pair_id`` / ``source`` is required;
    ``source`` matches the connector table case-insensitively (DB stores
    UPPERCASE, the WebUI sends lowercase)."""
    if cc_pair_id is None and source is None:
        raise HTTPException(
            status_code=422, detail="cc_pair_id or source is required"
        )

    with engine.connect() as conn:
        if cc_pair_id is not None:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM connector_credential_pair WHERE id = :cc_pair_id"
                ),
                {"cc_pair_id": cc_pair_id},
            ).first()
            if exists is None:
                raise HTTPException(status_code=404, detail="cc_pair not found")
            where_clause = "ia.connector_credential_pair_id = :cc_pair_id"
            where_params = {"cc_pair_id": cc_pair_id}
        else:
            where_clause = (
                "EXISTS (SELECT 1 FROM connector_credential_pair ccp"
                "        JOIN connector c ON c.id = ccp.connector_id"
                "        WHERE ccp.id = ia.connector_credential_pair_id"
                "          AND LOWER(c.source) = LOWER(:source))"
            )
            where_params = {"source": source}

        total = conn.execute(
            text(f"SELECT COUNT(*) FROM index_attempt ia WHERE {where_clause}"),
            where_params,
        ).scalar_one()

        rows = conn.execute(
            text(
                f"""
                SELECT ia.id, ia.status, ia.total_docs_indexed,
                       ia.completed_batches, ia.total_batches,
                       ia.error_msg, ia.time_started, ia.time_updated,
                       (SELECT COUNT(*) FROM file_record fr
                        WHERE fr.file_id LIKE 'iab/' || ia.connector_credential_pair_id
                                       || '/' || ia.id || '/%')
                       AS file_count,
                       ia.connector_credential_pair_id AS cc_pair_id
                FROM index_attempt ia
                WHERE {where_clause}
                ORDER BY ia.time_created DESC
                LIMIT :page_size OFFSET :offset
                """
            ),
            {
                **where_params,
                "page_size": page_size,
                "offset": page_num * page_size,
            },
        ).fetchall()

    def _to_item(row) -> SyncAttemptItem:
        return SyncAttemptItem(
            id=row[0],
            cc_pair_id=row[9],
            # DB 枚举存大写（FAILED/SUCCESS），前端 7 态标签为小写
            status=row[1].lower(),
            total_docs_indexed=row[2],
            completed_batches=row[3],
            total_batches=row[4],
            error_msg=row[5],
            time_started=str(row[6]) if row[6] is not None else None,
            time_updated=str(row[7]) if row[7] is not None else None,
            file_count=row[8],
        )

    return SyncAttemptListResponse(
        applicable=True,
        total_items=total,
        items=[_to_item(row) for row in rows],
    )


@app.get("/sync-files", response_model=SyncFileListResponse)
def list_sync_files(
    cc_pair_id: int | None = None,
    source: str | None = None,
    index_attempt_id: int | None = None,
    page_num: int = Query(0, ge=0),
    page_size: int = Query(50, ge=1, le=1000),
) -> SyncFileListResponse:
    """List batch files for one connector instance or all instances of a
    connector source. Exactly one of ``cc_pair_id`` / ``source`` is required;
    ``source`` matches the connector table case-insensitively."""
    if cc_pair_id is None and source is None:
        raise HTTPException(
            status_code=422, detail="cc_pair_id or source is required"
        )

    with engine.connect() as conn:
        if cc_pair_id is not None:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM connector_credential_pair WHERE id = :cc_pair_id"
                ),
                {"cc_pair_id": cc_pair_id},
            ).first()
            if exists is None:
                raise HTTPException(status_code=404, detail="cc_pair not found")
            cc_pair_ids = [cc_pair_id]
        else:
            cc_pair_ids = [
                row[0]
                for row in conn.execute(
                    text(
                        "SELECT ccp.id FROM connector_credential_pair ccp"
                        " JOIN connector c ON c.id = ccp.connector_id"
                        " WHERE LOWER(c.source) = LOWER(:source)"
                    ),
                    {"source": source},
                ).fetchall()
            ]

        if not cc_pair_ids:
            return SyncFileListResponse(applicable=True, total_items=0, items=[])

        prefixes = [
            f"iab/{cc}/{index_attempt_id}/%"
            if index_attempt_id is not None
            else f"iab/{cc}/%"
            for cc in cc_pair_ids
        ]
        params = {"prefixes": prefixes}

        total = conn.execute(
            text(
                "SELECT COUNT(*) FROM file_record"
                " WHERE file_id LIKE ANY(:prefixes)"
            ),
            params,
        ).scalar_one()

        rows = conn.execute(
            text(
                """
                SELECT file_id, display_name,
                       file_metadata->>'document_count' AS document_count,
                       created_at, processed, kg_stage, kg_processing_time,
                       split_part(file_id, '/', 2)::int AS cc_pair_id
                FROM file_record
                WHERE file_id LIKE ANY(:prefixes)
                ORDER BY created_at DESC
                LIMIT :page_size OFFSET :offset
                """
            ),
            {
                **params,
                "page_size": page_size,
                "offset": page_num * page_size,
            },
        ).fetchall()

    def _to_item(row) -> SyncFileItem:
        doc_count = row[2]
        return SyncFileItem(
            id=row[0],
            file_id=row[0],
            cc_pair_id=row[7],
            display_name=row[1],
            document_count=int(doc_count) if doc_count is not None else None,
            created_at=str(row[3]) if row[3] is not None else None,
            processed=row[4],
            kg_stage=row[5],
            kg_processing_time=str(row[6]) if row[6] is not None else None,
        )

    return SyncFileListResponse(
        applicable=True,
        total_items=total,
        items=[_to_item(row) for row in rows],
    )


def _get_file_record(file_id: str) -> tuple[str, str]:
    """返回 (bucket_name, object_key)；file_record 不存在时抛 404。"""
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT bucket_name, object_key FROM file_record WHERE file_id = :file_id"
            ),
            {"file_id": file_id},
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="file_record not found")
    return row[0], row[1]


def _text_preview(doc: dict, max_chars: int = 200) -> str | None:
    """取首个含文本的 section 并截断；无文本返回 None。"""
    sections = doc.get("sections") or []
    for section in sections:
        if isinstance(section, dict) and section.get("text"):
            text_content = str(section["text"]).strip()
            if text_content:
                return text_content[:max_chars]
    return None


# 注意：file_id 含斜杠（iab/{cc}/{attempt}/{batch}.json），必须用 :path 转换器；
# documents/download 路由需先于其它泛化路由定义（Starlette 按声明顺序匹配）
@app.get("/sync-files/{file_id:path}/documents", response_model=DocumentsResponse)
def list_file_documents(file_id: str) -> DocumentsResponse:
    bucket_name, object_key = _get_file_record(file_id)
    try:
        raw = get_object_bytes(bucket_name, object_key)
    except ObjectNotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail=f"batch file content unavailable: {e}",
        ) from e

    try:
        documents = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as e:
        raise HTTPException(
            status_code=500, detail=f"batch JSON parse failed: {e}"
        ) from e
    if not isinstance(documents, list):
        raise HTTPException(status_code=500, detail="batch JSON is not a list")

    items = [
        DocumentSummaryItem(
            id=str(doc.get("id", "")),
            semantic_identifier=doc.get("semantic_identifier"),
            link=doc.get("link"),
            doc_updated_at=(
                str(doc["doc_updated_at"])
                if doc.get("doc_updated_at") is not None
                else None
            ),
            text_preview=_text_preview(doc),
            metadata=doc.get("metadata"),
            section_count=len(doc.get("sections") or []),
        )
        for doc in documents
    ]

    # document 表状态补充（含 ACL 三字段：external_user_emails / external_user_group_ids / is_public）
    doc_ids = [item.id for item in items if item.id]
    if doc_ids:
        with engine.connect() as conn:
            state_rows = conn.execute(
                text(
                    "SELECT id, last_synced, chunk_count, external_user_emails,"
                    " external_user_group_ids, is_public FROM document"
                    " WHERE id = ANY(:ids)"
                ),
                {"ids": doc_ids},
            ).fetchall()
        state_by_id = {
            row[0]: row for row in state_rows
        }
        for item in items:
            state = state_by_id.get(item.id)
            if state is not None:
                item.last_synced = str(state[1]) if state[1] is not None else None
                item.chunk_count = state[2]
                item.external_user_emails = list(state[3]) if state[3] else None
                item.external_user_group_ids = list(state[4]) if state[4] else None
                item.is_public = state[5]

    return DocumentsResponse(total_items=len(items), items=items)


@app.get("/sync-files/{file_id:path}/download")
def download_sync_file(file_id: str) -> StreamingResponse:
    bucket_name, object_key = _get_file_record(file_id)
    try:
        content = get_object_bytes(bucket_name, object_key)
    except ObjectNotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail=f"batch file content unavailable: {e}",
        ) from e

    filename = object_key.split("/")[-1] or f"{file_id}.json"
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
