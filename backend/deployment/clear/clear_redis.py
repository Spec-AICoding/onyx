#!/usr/bin/env python3
"""Clear Redis databases used by Onyx.

By default clears the three databases Onyx relies on:
  - DB 0  : general cache + graph service entity/relation chunks
  - DB 14 : Celery result backend
  - DB 15 : Celery broker

Connection settings are read from backend/.env (REDIS_HOST / REDIS_PORT /
REDIS_PASSWORD). Requires confirmation unless --yes is passed.

Examples:
  python clear_redis.py                 # preview + confirm + clear db 0/14/15
  python clear_redis.py --yes           # clear without prompting
  python clear_redis.py --db 0 15       # clear only db 0 and 15
  python clear_redis.py --dry-run       # show what would be cleared only
"""

import argparse
import sys
from pathlib import Path

# Script lives at backend/deployment/clear/, so parents[2] is the backend dir
# where backend/.env is located.
BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_DBS = [0, 14, 15]


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
        "--db",
        type=int,
        nargs="+",
        default=DEFAULT_DBS,
        help=f"Redis db numbers to clear (default: {DEFAULT_DBS})",
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
        "--yes", "-y",
        action="store_true",
        help="Skip the confirmation prompt",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only report key counts, do not delete anything",
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

    dbs = sorted(set(args.db))
    if not dbs:
        print("ERROR: no db specified")
        return 1

    # Pre-flight: connect and report key counts before deleting anything.
    clients: dict[int, redis.Redis] = {}
    total_keys = 0
    print(f"Connecting to Redis at {host}:{port}")
    for db in dbs:
        try:
            client = redis.Redis(
                host=host, port=port, db=db, password=password, socket_timeout=10
            )
            client.ping()
            clients[db] = client
            count = client.dbsize()
            total_keys += count
            print(f"  db {db:<3} -> {count} keys")
        except redis.exceptions.RedisError as e:
            print(f"  db {db:<3} -> ERROR: {e}")
            return 1

    print(f"Total: {total_keys} keys across {len(dbs)} db(s)")
    if args.dry_run:
        print("Dry run: nothing was deleted.")
        return 0

    if not args.yes:
        answer = input(f"Really flush db(s) {dbs}? This is IRREVERSIBLE. [y/N]: ")
        if answer.strip().lower() not in ("y", "yes"):
            print("Aborted.")
            return 0

    for db in dbs:
        clients[db].flushdb()
        print(f"  flushed db {db}")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
