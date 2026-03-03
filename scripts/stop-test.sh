#!/bin/bash

# DataPulse 测试环境停止脚本
# 用法：./stop-test.sh

echo "🛑 停止 DataPulse 测试服务..."

# 颜色定义
GREEN='\033[0;32m'
NC='\033[0m'

# 停止后端
if [ -f .backend.pid ]; then
    BACKEND_PID=$(cat .backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID
        echo -e "${GREEN}✅${NC} 后端服务已停止 (PID: $BACKEND_PID)"
    else
        echo "后端服务未运行"
    fi
    rm -f .backend.pid
else
    # 尝试通过进程名停止
    pkill -f "uvicorn main:app" && echo -e "${GREEN}✅${NC} 后端服务已停止" || echo "后端服务未运行"
fi

# 停止前端
if [ -f .frontend.pid ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID
        echo -e "${GREEN}✅${NC} 前端服务已停止 (PID: $FRONTEND_PID)"
    else
        echo "前端服务未运行"
    fi
    rm -f .frontend.pid
else
    # 尝试通过进程名停止
    pkill -f "vite" && echo -e "${GREEN}✅${NC} 前端服务已停止" || echo "前端服务未运行"
fi

# 清理日志文件（可选）
if [ "$1" = "--clean" ]; then
    rm -f backend.log frontend.log
    echo -e "${GREEN}✅${NC} 日志文件已清理"
fi

echo ""
echo -e "${GREEN}✅ 所有服务已停止${NC}"
