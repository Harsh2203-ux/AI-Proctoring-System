#!/bin/bash
# restart-backend.sh
# Restarts the FastAPI backend to pick up code changes.
# Run from the project root: bash scripts/restart-backend.sh

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)/backend"

echo "=== Restarting FastAPI Backend ==="
echo "Backend dir: $BACKEND_DIR"

# Find and kill the existing uvicorn process
UVICORN_PID=$(lsof -ti :8000 2>/dev/null | head -1)
if [ -n "$UVICORN_PID" ]; then
  echo "Killing existing uvicorn process PID=$UVICORN_PID"
  kill "$UVICORN_PID" 2>/dev/null
  sleep 2
fi

# Start a new uvicorn process with --reload
echo "Starting new uvicorn with --reload on port 8000..."
cd "$BACKEND_DIR"
# Use the venv's own python executable (supports both python and python3 naming)
PYTHON_BIN="$BACKEND_DIR/venv/bin/python3"
[ -x "$PYTHON_BIN" ] || PYTHON_BIN="$BACKEND_DIR/venv/bin/python"
nohup "$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/backend.log 2>&1 &
NEW_PID=$!
echo "Started PID=$NEW_PID"

# Wait for it to be ready
for i in $(seq 1 15); do
  sleep 1
  if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "Backend ready after ${i}s"
    break
  fi
  echo "  Waiting... (${i}s)"
done

echo "Backend log:"
tail -10 /tmp/backend.log
