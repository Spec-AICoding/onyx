#!/usr/bin/env python3
"""Delete connector-synced documents, manually uploaded files, and file records
from Postgres.

Deletes ONLY:
  - connector-synced documents (document rows referenced by
    document_by_connector_credential_pair, plus all their FK children:
    kg tables, chunk_stats, document_retrieval_feedback, document__tag)
  - manually uploaded user files (user_file rows + persona__user_file /
    project__user_file links + their document rows)
  - file records (file_record rows + file_content via FK cascade, and
    usage_reports rows which FK-reference file_record without CASCADE)
  - index attempts (index_attempt rows + index_attempt_errors which
    FK-reference index_attempt without CASCADE; index_attempt_stage_metrics
    rows cascade via FK)

All other tables (user, persona, chat_session, chat_message, connector,
credential, connector_credential_pair, document_set, ...) are left untouched.

This only touches Postgres. OpenSearch chunks are NOT removed here — run
clear_opensearch.py separately to wipe the document index.

Run from anywhere; connection settings are read from backend/.env.
Requires confirmation unless --yes is passed.

Examples:
  python clear_pg_documents.py            # preview + confirm + delete
  python clear_pg_documents.py --yes      # delete without prompting
  python clear_pg_documents.py --dry-run  # show what would be deleted only
"""

import argparse
import sys
from pathlib import Path

# Script lives at backend/deployment/clear/, so parents[2] is the backend dir.
BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ENV_FILE)

from sqlalchemy import delete, func, select  # noqa: E402

from onyx.db.document import delete_documents_complete__no_commit  # noqa: E402
from onyx.db.engine.sql_engine import SqlEngine  # noqa: E402
from onyx.db.models import (  # noqa: E402
    DocumentByConnectorCredentialPair,
    FileRecord,
    IndexAttempt,
    IndexAttemptError,
    Persona__UserFile,
    Project__UserFile,
    UsageReport,
    UserFile,
)
from onyx.db.tag import delete_orphan_tags_batched  # noqa: E402

_BATCH_SIZE = 1000


def _load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--yes", "-y", action="store_true", help="Skip the confirmation prompt"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only count what would be deleted, delete nothing",
    )
    args = parser.parse_args()

    env = _load_env(ENV_FILE)
    pg_host = env.get("POSTGRES_HOST") or "localhost"
    pg_port = env.get("POSTGRES_PORT") or "5432"

    # Same engine init pattern used by the celery workers.
    SqlEngine.set_app_name("clear_pg_documents")
    SqlEngine.init_engine(pool_size=2, max_overflow=4)

    from onyx.db.engine.sql_engine import get_session_with_current_tenant  # noqa: PLC0415

    with get_session_with_current_tenant() as db_session:
        # 1. Connector-synced document ids (any doc indexed by a connector/credential pair)
        connector_doc_ids = db_session.scalars(
            select(DocumentByConnectorCredentialPair.id).distinct()
        ).all()

        # 2. Manually uploaded files
        user_file_ids = db_session.scalars(select(UserFile.id)).all()
        # user files are indexed under document.id == str(user_file.id)
        user_file_doc_ids = [str(uf_id) for uf_id in user_file_ids]

        all_doc_ids = sorted(set(connector_doc_ids) | set(user_file_doc_ids))

        # Count FK children for the report
        n_cc_links = db_session.scalar(
            select(func.count())
            .select_from(DocumentByConnectorCredentialPair)
            .where(DocumentByConnectorCredentialPair.id.in_(all_doc_ids))
        )
        n_puf = db_session.scalar(
            select(func.count())
            .select_from(Persona__UserFile)
            .where(Persona__UserFile.user_file_id.in_(user_file_ids))
        )
        n_proj_uf = db_session.scalar(
            select(func.count())
            .select_from(Project__UserFile)
            .where(Project__UserFile.user_file_id.in_(user_file_ids))
        )
        n_file_records = db_session.scalar(
            select(func.count()).select_from(FileRecord)
        )
        n_usage_reports = db_session.scalar(
            select(func.count()).select_from(UsageReport)
        )
        n_index_attempt_errors = db_session.scalar(
            select(func.count()).select_from(IndexAttemptError)
        )
        n_index_attempts = db_session.scalar(
            select(func.count()).select_from(IndexAttempt)
        )

        print(f"Connecting to Postgres at {pg_host}:{pg_port}")
        print(f"  connector-synced documents : {len(connector_doc_ids)}")
        print(f"  manually uploaded files     : {len(user_file_ids)}")
        print(f"  total document rows to delete: {len(all_doc_ids)}")
        print(f"  document_by_cc_pair links   : {n_cc_links}")
        print(f"  persona__user_file links    : {n_puf}")
        print(f"  project__user_file links    : {n_proj_uf}")
        print(f"  file records to delete      : {n_file_records}")
        print(f"  usage reports to delete     : {n_usage_reports}")
        print(f"  index attempt errors        : {n_index_attempt_errors}")
        print(f"  index attempts to delete    : {n_index_attempts}")

        if (
            not all_doc_ids
            and not user_file_ids
            and not n_file_records
            and not n_index_attempts
        ):
            print("Nothing to delete.")
            return 0

        if args.dry_run:
            print("Dry run: nothing was deleted.")
            return 0

        if not args.yes:
            answer = input(
                "Really delete all documents + user files + file records + index "
                "attempts? This is IRREVERSIBLE. [y/N]: "
            )
            if answer.strip().lower() not in ("y", "yes"):
                print("Aborted.")
                return 0

        # 3. Delete user file links first (project__user_file has no ON DELETE
        #    CASCADE; persona__user_file does, but delete explicitly anyway).
        if user_file_ids:
            db_session.execute(
                delete(Project__UserFile).where(
                    Project__UserFile.user_file_id.in_(user_file_ids)
                )
            )
            db_session.execute(
                delete(Persona__UserFile).where(
                    Persona__UserFile.user_file_id.in_(user_file_ids)
                )
            )
            db_session.execute(
                delete(UserFile).where(UserFile.id.in_(user_file_ids))
            )

        # 4. Delete documents in batches (handles kg / chunk_stats / feedback /
        #    tags / document_by_connector_credential_pair / document rows).
        for i in range(0, len(all_doc_ids), _BATCH_SIZE):
            batch = all_doc_ids[i : i + _BATCH_SIZE]
            delete_documents_complete__no_commit(db_session, batch)
            db_session.flush()

        # 5. Delete usage reports first — they FK-reference file_record
        #    without ON DELETE CASCADE.
        if n_usage_reports:
            db_session.execute(delete(UsageReport))

        # 6. Delete file records (file_content rows cascade via FK).
        if n_file_records:
            db_session.execute(delete(FileRecord))

        # 7. Delete index attempt errors first — they FK-reference
        #    index_attempt without ON DELETE CASCADE.
        if n_index_attempt_errors:
            db_session.execute(delete(IndexAttemptError))

        # 8. Delete index attempts (index_attempt_stage_metrics rows cascade
        #    via FK). Deleting them resets each connector's sync checkpoint:
        #    the next sync re-traverses from connector.indexing_start.
        if n_index_attempts:
            db_session.execute(delete(IndexAttempt))

        db_session.commit()

        # 7. Drain orphaned tags
        deleted_tags = delete_orphan_tags_batched(db_session)
        print(
            f"Deleted {len(all_doc_ids)} documents, {len(user_file_ids)} user files, "
            f"{n_file_records} file records, {n_usage_reports} usage reports, "
            f"{n_index_attempt_errors} index attempt errors, "
            f"{n_index_attempts} index attempts."
        )
        print(f"Deleted {deleted_tags} orphan tags.")
        print("Done. Run clear_opensearch.py separately to wipe the chunk index.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
