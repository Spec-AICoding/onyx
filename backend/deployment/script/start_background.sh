#!/bin/bash
# Start Onyx Background Workers (Celery)
# Usage: ./start_background.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$BACKEND_DIR"

echo "Starting background workers..."
python scripts/dev_run_background_jobs.py
