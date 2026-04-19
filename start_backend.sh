#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$SCRIPT_DIR/backend/venv312/bin/python3"
cd "$SCRIPT_DIR/backend"
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 1
PYTHONPATH="$SCRIPT_DIR/backend:$SCRIPT_DIR" "$PYTHON" main.py 2>&1 | tee -a logs/app.log
