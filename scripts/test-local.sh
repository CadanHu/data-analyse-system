#!/bin/bash

# DataPulse 本地测试环境启动脚本
# 用法：./test-local.sh

set -e

echo "🚀 启动 DataPulse 本地测试环境..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查环境
echo "📦 检查环境..."

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✅${NC} Python: $(python3 --version)"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✅${NC} Node.js: $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✅${NC} npm: $(npm --version)"

# 检查 MySQL
if command -v mysql &> /dev/null; then
    echo -e "${GREEN}✅${NC} MySQL: 已安装"
else
    echo -e "${RED}❌${NC}  MySQL: 未安装 (DataPulse 已废弃 SQLite 支持，必须使用 MySQL/PostgreSQL)"
    exit 1
fi

echo ""

# 启动后端
echo "🔧 启动后端服务..."
cd backend

if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
elif [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️${NC}  未找到 .env 文件"
    if [ -f ".env.example" ]; then
        echo "正在从 .env.example 复制..."
        cp .env.example .env
        echo -e "${RED}请编辑 .env 文件并配置 DEEPSEEK_API_KEY${NC}"
        exit 1
    else
        echo -e "${RED}请创建 .env 文件并配置必要的环境变量${NC}"
        exit 1
    fi
fi

# 安装依赖
echo "安装后端依赖..."
pip install -r requirements.txt -q

# 初始化数据库与环境验证
echo "初始化数据库与环境验证..."
python3 ../scripts/check_db_env.py

# 启动后端（后台运行）
echo "启动后端服务（端口 8000）..."
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload > ../backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../.backend.pid
echo -e "${GREEN}✅${NC} 后端服务已启动 (PID: $BACKEND_PID)"
echo -e "📄 API 文档：http://localhost:8000/docs"

cd ..

# 启动前端
echo ""
echo "🎨 启动前端服务..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "安装前端依赖（这可能需要几分钟）..."
    npm install
fi

# 启动前端（后台运行）
echo "启动前端服务（端口 5173）..."
npm run dev -- --port 5173 > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../.frontend.pid
echo -e "${GREEN}✅${NC} 前端服务已启动 (PID: $FRONTEND_PID)"
echo -e "🌐 访问地址：http://localhost:5173"

cd ..

# 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 8

# 检查服务状态
echo ""
echo "📊 服务状态检查..."

BACKEND_OK=false
FRONTEND_OK=false

if curl -s http://localhost:8000/docs > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} 后端服务：运行中"
    BACKEND_OK=true
else
    echo -e "${RED}❌${NC} 后端服务：启动失败（查看 backend.log）"
fi

if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} 前端服务：运行中"
    FRONTEND_OK=true
else
    echo -e "${RED}❌${NC} 前端服务：启动失败（查看 frontend.log）"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 测试环境启动完成！${NC}"
echo "=========================================="
echo ""
echo "📌 访问地址:"
echo "   前端：http://localhost:5173"
echo "   后端 API: http://localhost:8000"
echo "   API 文档：http://localhost:8000/docs"
echo ""
echo "📝 日志文件:"
echo "   后端：backend.log"
echo "   前端：frontend.log"
echo ""
echo "🛑 停止服务：./stop-test.sh 或按 Ctrl+C"
echo ""

if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
    echo -e "${GREEN}✨ 所有服务正常运行，可以开始测试！${NC}"
else
    echo -e "${RED}⚠️  部分服务启动失败，请检查日志${NC}"
fi

echo ""

# 保存进程 ID
echo "$BACKEND_PID" > .backend.pid
echo "$FRONTEND_PID" > .frontend.pid

# 等待用户中断
cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    if [ -f .backend.pid ]; then
        kill $(cat .backend.pid) 2>/dev/null || true
        rm -f .backend.pid
    fi
    if [ -f .frontend.pid ]; then
        kill $(cat .frontend.pid) 2>/dev/null || true
        rm -f .frontend.pid
    fi
    echo -e "${GREEN}✅ 服务已停止${NC}"
    exit 0
}

trap cleanup INT

# 保持脚本运行
wait
