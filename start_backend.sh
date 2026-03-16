#!/bin/bash
export PYTHONPATH=$(pwd)/backend:$(pwd)
source backend/venv312/bin/activate
cd backend
# 暴力杀掉所有占据 8000 的进程
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 1
# 启动
python3 main.py 2>&1 | tee -a logs/app.log
