#!/usr/bin/env python3
"""Delete Redis keys matching a prefix (or list of prefixes) in a specific db.

Unlike clear_redis.py (which flushes whole databases), this script only
targets keys matching the given prefix(es) in the given db(s), so unrelated
keys are never touched.

Connection settings are read from backend/.env (REDIS_HOST / REDIS_PORT /
REDIS_PASSWORD), with optional --host/--port/--password overrides.

Examples:
  # Preview matching keys in db 15 (no deletion)
  python clear_redis_keys.py --db 15 --prefix monitoring --dry-run

  # Delete all keys under the prefix (after confirmation)
  python clear_redis_keys.py --db 15 --prefix monitoring

  # Delete multiple prefixes in one run
  python clear_redis_keys.py --db 15 --prefix monitoring sandbox --yes

  # Clean the Celery broker queue for one prefix
  python clear_redis_keys.py --db 15 --prefix connector_external_group_sync -y
"""

import argparse
import sys
from pathlib import Path

# Script lives at backend/deployment/script/, so parents[2] is the backend dir
# where backend/.env is located.
BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"

PREVIEW_MAX_KEYS = 20
DELETE_BATCH_SIZE = 1000


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


def collect_matching(
    client: "redis.Redis", prefixes: list[str]
) -> dict[str, list[str]]:
    """Scan for keys matching each prefix. Returns {prefix: [key, ...]}."""
    matched: dict[str, list[str]] = {}
    for prefix in prefixes:
        keys: list[str] = []
        for key in client.scan_iter(match=f"{prefix}*", count=1000):
            keys.append(str(key))
        matched[prefix] = sorted(keys)
    return matched


def key_type(client: "redis.Redis", key: str) -> str:
    ktype = client.type(key)
    return ktype.decode() if isinstance(ktype, bytes) else str(ktype)


def preview(client: "redis.Redis", keys: list[str]) -> None:
    """Print type breakdown and a sample of keys."""
    type_counts: dict[str, int] = {}
    for key in keys:
        ktype = key_type(client, key)
        type_counts[ktype] = type_counts.get(ktype, 0) + 1
    print(f"    by type: {type_counts}")
    for key in keys[:PREVIEW_MAX_KEYS]:
        extra = ""
        ktype = key_type(client, key)
        if ktype == "list":
            extra = f" (len={client.llen(key)})"
        print(f"      {key!r}{extra}")
    remaining = len(keys) - PREVIEW_MAX_KEYS
    if remaining > 0:
        print(f"      ... and {remaining} more")


def delete_keys(client: "redis.Redis", keys: list[str]) -> int:
    """Delete keys in batches using UNLINK (non-blocking, async delete)."""
    deleted = 0
    for i in range(0, len(keys), DELETE_BATCH_SIZE):
        batch = keys[i : i + DELETE_BATCH_SIZE]
        deleted += client.unlink(*batch)
    return deleted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        type=int,
        required=True,
        help="Redis db number to target, e.g. 0 (business), 14 (celery "
        "result backend), 15 (celery broker)",
    )
    parser.add_argument(
        "--prefix",
        nargs="+",
        required=True,
        help="Key prefix(es) to match, e.g. monitoring, public:license",
    )
    parser.add_argument(
        "--host",
        default=None,
        help="Redis host (default: from backend/.env or localhost)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Redis port (default: from backend/.env or 6379)",
    )
    parser.add_argument(
        "--password",
        default=None,
        help="Redis password (default: from backend/.env or empty)",
    )
    parser.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="Skip the confirmation prompt",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only list matching keys, do not delete anything",
    )
    args = parser.parse_args()

    try:
        import redis  # noqa: PLC0415
    except ImportError:
        print("ERROR: redis-py is not installed. Activate the project env first.")
        return 1

    env = load_env(ENV_FILE)
    host = args.host or env.get("REDIS_HOST") or "localhost"
    port = args.port or int(env.get("REDIS_PORT") or 6379)
    password = args.password if args.password is not None else env.get(
        "REDIS_PASSWORD"
    )

    print(f"Connecting to Redis at {host}:{port} db={args.db}")
    try:
        client = redis.Redis(
            host=host,
            port=port,
            db=args.db,
            password=password,
            decode_responses=True,
            socket_timeout=10,
        )
        client.ping()
    except redis.exceptions.RedisError as e:
        print(f"ERROR: cannot connect: {e}")
        return 1

    matched = collect_matching(client, args.prefix)

    total_keys = sum(len(keys) for keys in matched.values())
    print(f"Scan complete: {total_keys} key(s) matched across "
          f"{len(args.prefix)} prefix(es)")
    for prefix, keys in matched.items():
        if not keys:
            print(f"  prefix {prefix!r}: no keys found")
        else:
            print(f"  prefix {prefix!r}: {len(keys)} key(s)")
            preview(client, keys)

    if total_keys == 0:
        print("Nothing to do.")
        return 0

    if args.dry_run:
        print("Dry run: nothing was deleted.")
        return 0

    if not args.yes:
        answer = input(
            f"Really delete {total_keys} key(s) in db {args.db} "
            f"matching {args.prefix!r}? This is IRREVERSIBLE. [y/N]: "
        )
        if answer.strip().lower() not in ("y", "yes"):
            print("Aborted.")
            return 0

    all_keys = [key for keys in matched.values() for key in keys]
    deleted = delete_keys(client, all_keys)
    print(f"Done. Deleted {deleted} key(s) from db {args.db}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
