#!/bin/bash

set -e  # 遇到错误立即退出

echo "🚀 智能数据分析助理 - 一键启动脚本"
echo "======================================"
echo ""

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查 Python
echo -e "${BLUE}📦 检查 Python 环境...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ 错误：未找到 Python3，请先安装 Python 3.8-3.11${NC}"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo -e "${GREEN}✅ Python 版本: $PYTHON_VERSION${NC}"

# 检查 Python 版本是否在 3.8-3.11 之间
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
if [ "$PYTHON_MAJOR" -ne 3 ] || [ "$PYTHON_MINOR" -lt 8 ] || [ "$PYTHON_MINOR" -gt 11 ]; then
    echo -e "${YELLOW}⚠️  警告：推荐使用 Python 3.8-3.11，当前版本可能不兼容${NC}"
fi

# 进入后端目录
cd backend

# 创建虚拟环境（如果不存在）
if [ ! -d "venv" ]; then
    echo ""
    echo -e "${BLUE}🔧 创建 Python 虚拟环境...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✅ 虚拟环境创建成功${NC}"
fi

# 激活虚拟环境
echo ""
echo -e "${BLUE}🔧 激活虚拟环境...${NC}"
source venv/bin/activate

# 安装后端依赖
echo ""
echo -e "${BLUE}📦 安装后端依赖...${NC}"
pip install -r requirements.txt
echo -e "${GREEN}✅ 后端依赖安装完成${NC}"

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  未找到 .env 文件，正在从 .env.example 创建...${NC}"
    cp .env.example .env
    echo ""
    echo -e "${RED}❗ 重要：请编辑 backend/.env 文件，填入你的 DeepSeek API Key${NC}"
    echo -e "${BLUE}   获取地址：https://platform.deepseek.com/${NC}"
    echo ""
    read -p "按回车键继续（稍后可手动编辑 .env 文件）..."
fi

# 初始化数据库
echo ""
echo -e "${BLUE}📊 初始化数据库...${NC}"
python init_db.py
echo -e "${GREEN}✅ 数据库初始化完成${NC}"

cd ..

# 检查 Node.js
echo ""
echo -e "${BLUE}📦 检查 Node.js 环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 错误：未找到 Node.js，请先安装 Node.js 18+${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ Node.js 版本: $NODE_VERSION${NC}"
echo -e "${GREEN}✅ npm 版本: $NPM_VERSION${NC}"

# 安装前端依赖
echo ""
echo -e "${BLUE}📦 安装前端依赖...${NC}"
cd frontend
npm install
echo -e "${GREEN}✅ 前端依赖安装完成${NC}"

cd ..

echo ""
echo ""
echo -e "${GREEN}✨✨✨ 项目初始化完成！✨✨✨${NC}"
echo ""
echo -e "${BLUE}📝 下一步操作：${NC}"
echo ""
echo -e "${YELLOW}1. 配置 API Key（如果还没配置）：${NC}"
echo -e "   编辑 ${BLUE}backend/.env${NC} 文件"
echo -e "   将 ${YELLOW}DEEPSEEK_API_KEY${NC} 设置为你的实际 API Key"
echo ""
echo -e "${YELLOW}2. 启动后端服务（新终端窗口）：${NC}"
echo -e "   ${BLUE}cd backend${NC}"
echo -e "   ${BLUE}source venv/bin/activate${NC}"
echo -e "   ${BLUE}python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload${NC}"
echo ""
echo -e "${YELLOW}3. 启动前端服务（新终端窗口）：${NC}"
echo -e "   ${BLUE}cd frontend${NC}"
echo -e "   ${BLUE}npm run dev${NC}"
echo ""
echo -e "${YELLOW}4. 打开浏览器访问：${NC}"
echo -e "   ${GREEN}http://localhost:5173${NC}"
echo ""
echo -e "${BLUE}📚 更多帮助请查看 README.md${NC}"
echo ""
