"""PostgreSQL 连接与启动校验（只读）。"""

import os

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:password@81.70.98.107:5432/postgres",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# 依赖表（均为只读查询对象）；缺表说明 Onyx schema 与预期不符，需人工确认
REQUIRED_TABLES = (
    "user__external_user_group_id",
    "public_external_user_group",
    "user",
    "connector_credential_pair",
    "connector",
    "file_record",
    "document",
)


def verify_tables() -> None:
    """启动时校验依赖表存在；缺失则抛错并带明确日志。"""
    with engine.connect() as conn:
        existing = set(
            conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables"
                    " WHERE table_schema = 'public'"
                )
            ).scalars()
        )
    missing = [t for t in REQUIRED_TABLES if t not in existing]
    if missing:
        raise RuntimeError(
            f"[external-user-groups-api] Missing required tables: {', '.join(missing)}"
        )
