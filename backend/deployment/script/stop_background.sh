#!/bin/bash
# Stop Onyx Background Workers (Celery)
# Usage: ./stop_background.sh

echo "Stopping background workers..."

# Kill the dev_run_background_jobs.py parent process
PARENT_PID=$(pgrep -f "python.*dev_run_background_jobs" 2>/dev/null)
if [ -n "$PARENT_PID" ]; then
    kill "$PARENT_PID" 2>/dev/null
    echo "Stopped background job launcher (PID $PARENT_PID)."
fi

# Kill all Celery worker and beat processes
for NAME in primary docprocessing docfetching light heavy monitoring user_file_processing scheduled_tasks beat; do
    PIDS=$(pgrep -f "celery.*$NAME" 2>/dev/null)
    if [ -n "$PIDS" ]; then
        kill $PIDS 2>/dev/null
        echo "Stopped celery $NAME workers."
    fi
done

sleep 2

# Force kill any remaining processes
REMAINING=$(pgrep -f "celery.*(worker|beat)" 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
    kill -9 $REMAINING 2>/dev/null
    echo "Forcefully stopped remaining celery processes."
fi

echo "All background workers stopped."
