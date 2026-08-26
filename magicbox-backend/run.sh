#!/usr/bin/env bash
# 外部用户组管理 API 启动脚本。
# 仅绑定回环地址（127.0.0.1:8090），由 magicbox-web 的 Next.js rewrites 服务端代理访问。
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

# 支持 .env（若存在）覆盖 DATABASE_URL
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8090
