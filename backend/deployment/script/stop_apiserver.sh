#!/bin/bash
# Stop Onyx API Server
# Usage: ./stop_apiserver.sh

echo "Stopping API server..."

# Kill uvicorn process serving onyx app
PID=$(lsof -ti :8080 -s TCP:LISTEN 2>/dev/null)

if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null
    sleep 1
    # Force kill if still running
    if kill -0 "$PID" 2>/dev/null; then
        kill -9 "$PID" 2>/dev/null
        echo "API server (PID $PID) forcefully stopped."
    else
        echo "API server (PID $PID) stopped."
    fi
else
    echo "No API server process found on port 8080."
fi
