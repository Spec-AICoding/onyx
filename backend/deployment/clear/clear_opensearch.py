#!/usr/bin/env python3
"""Clear OpenSearch indices used by Onyx.

By default deletes all Onyx document indices (indices whose name starts with
the configured DOCUMENT_INDEX_NAME, e.g. danswer_index, danswer_index_0, ...)
as well as chunk indices named danswer_chunk_* (the actual index names used
by the running deployment).

Connection settings are read from backend/.env (OPENSEARCH_HOST /
OPENSEARCH_REST_API_PORT / OPENSEARCH_ADMIN_USERNAME /
OPENSEARCH_ADMIN_PASSWORD / OPENSEARCH_USE_SSL). Requires confirmation
unless --yes is passed.

Examples:
  python clear_opensearch.py            # preview + confirm + delete all onyx indices
  python clear_opensearch.py --yes      # delete without prompting
  python clear_opensearch.py --index foo_index   # delete a specific index
  python clear_opensearch.py --all      # delete EVERY index in the cluster
  python clear_opensearch.py --dry-run  # show what would be deleted only
"""

import argparse
import sys
from pathlib import Path

# Script lives at backend/deployment/clear/, so parents[2] is the backend dir
# where backend/.env is located.
BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"


def load_env(path: Path) -> dict[str, str]:
    """Minimal .env loader (KEY=VALUE lines, # comments, no quoting tricks)."""
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
        "--index",
        type=str,
        nargs="+",
        default=None,
        help="Exact index name(s) to delete (default: all Onyx indices)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Delete EVERY index in the cluster (dangerous)",
    )
    parser.add_argument(
        "--host",
        default=None,
        help="OpenSearch host (default: from backend/.env or localhost)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="OpenSearch port (default: from backend/.env or 9200)",
    )
    parser.add_argument(
        "--username",
        default=None,
        help="OpenSearch username (default: from backend/.env or admin)",
    )
    parser.add_argument(
        "--password",
        default=None,
        help="OpenSearch password (default: from backend/.env)",
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Skip the confirmation prompt",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only list indices, do not delete anything",
    )
    args = parser.parse_args()

    try:
        from opensearchpy import OpenSearch  # noqa: PLC0415
        from opensearchpy.exceptions import (
            ConnectionError as OpenSearchConnectionError,
        )
    except ImportError:
        print("ERROR: opensearchpy is not installed. Activate the project env first.")
        return 1

    env = load_env(ENV_FILE)
    host = args.host or env.get("OPENSEARCH_HOST") or "localhost"
    port = args.port or int(env.get("OPENSEARCH_REST_API_PORT") or 9200)
    username = args.username or env.get("OPENSEARCH_ADMIN_USERNAME") or "admin"
    password = args.password or env.get("OPENSEARCH_ADMIN_PASSWORD") or ""
    use_ssl = env.get("OPENSEARCH_USE_SSL", "false").lower() == "true"
    doc_index_name = env.get("DOCUMENT_INDEX_NAME") or "danswer_index"

    client = OpenSearch(
        hosts=[{"host": host, "port": port}],
        http_auth=(username, password) if username else None,
        use_ssl=use_ssl,
        verify_certs=False,
        timeout=30,
    )

    # Pre-flight: connect and list indices before deleting anything.
    try:
        all_indices = list(client.indices.get_alias(index="*").keys())
    except OpenSearchConnectionError as e:
        print(f"ERROR: cannot connect to OpenSearch at {host}:{port}: {e}")
        return 1

    all_indices = sorted(all_indices)
    if args.all:
        to_delete = all_indices
    elif args.index:
        to_delete = sorted(set(args.index))
    else:
        to_delete = [
            name for name in all_indices
            if name == doc_index_name
            or name.startswith(f"{doc_index_name}_")
            or name.startswith("danswer_chunk_")
        ]

    print(f"Connecting to OpenSearch at {host}:{port} (user={username}, ssl={use_ssl})")
    print(f"Found {len(all_indices)} index(es) in the cluster:")
    for name in all_indices:
        marker = " <- will delete" if name in to_delete else ""
        print(f"  {name}{marker}")

    if not to_delete:
        print("Nothing to delete.")
        return 0

    print(f"Will delete {len(to_delete)} index(es).")
    if args.dry_run:
        print("Dry run: nothing was deleted.")
        return 0

    if not args.yes:
        answer = input(
            f"Really delete index(es) {to_delete}? This is IRREVERSIBLE. [y/N]: "
        )
        if answer.strip().lower() not in ("y", "yes"):
            print("Aborted.")
            return 0

    for name in to_delete:
        if not client.indices.exists(index=name):
            print(f"  index {name} does not exist, skipping")
            continue
        response = client.indices.delete(index=name)
        acknowledged = response.get("acknowledged", False)
        print(f"  deleted index {name} (acknowledged={acknowledged})")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
