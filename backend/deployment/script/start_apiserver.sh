#!/bin/bash
# Start Onyx API Server
# Usage: ./start_apiserver.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$BACKEND_DIR"

echo "Starting API server on port 8080..."
python -m dotenv -f .env run -- uvicorn onyx.main:app \
    --host 0.0.0.0 \
    --port 8080 \
    --log-level info
