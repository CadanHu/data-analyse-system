# 智能数据分析助理 (DataPulse)

基于 AI 的智能数据分析系统，通过自然语言对话实现结构化数据查询（SQL）与非结构化文档分析（RAG）的双引擎商业平台。

## 🎯 核心能力

### 双引擎分析逻辑
- ✅ **智能 SQL 引擎**：基于 SQLAlchemy 驱动，支持 MySQL、PostgreSQL。自动识别 Schema，将自然语言转换为高精度 SQL 语句。
- ✅ **RAG 知识库增强**：支持上传 PDF/Markdown/TXT，集成 **PyMuPDF** 高效解析与 **ChromaDB** 向量存储，辅助 AI 进行口径对齐与业务指标解读。

### 移动端原生体验
- 📱 **全平台适配**：基于 Capacitor 6 构建，原生支持 **iOS (iPhone)** 与 **Android (Pixel/Samsung)**。
- 👁️ **Mieru (见得) 视觉方案**：标准 SSE 流式传输，实时展示 DeepSeek R1 推理思维链，让 AI 推理过程透明可见。

### 企业级后端架构
- 🏗️ **统一适配层**：基于 SQLAlchemy 实现跨库通用 Schema 提取与异步查询执行。
- 🔒 **用户认证系统**：完整的 JWT 注册、登录、Token 验证流程，支持多用户数据隔离。
- ⚡ **性能优化**：异步 FastAPI 架构，结合标准 Event-Stream 协议，确保秒级响应。

---

## 📦 项目结构 (整理后)

```
data-analyse-system/
├── backend/            # 后端项目 (FastAPI, SQLAlchemy, Agents)
│   ├── agents/        # AI Agent 核心逻辑
│   ├── database/      # SQLAlchemy 模型与存储逻辑
│   ├── databases/     # 数据库适配器 (MySQL/PostgreSQL)
│   ├── services/      # 文档处理、向量存储、流服务
│   ├── routers/       # API 路由
│   └── tests/         # 单元测试与测试文档 (整理至此)
│       └── knowledge_base/ # 商业指标测试集
├── frontend/           # 前端项目 (React, Vite, Tailwind)
│   ├── ios/           # iOS 原生工程
│   └── android/       # Android 原生工程
├── scripts/            # 环境验证与初始化脚本
├── docs/               # 部署与安装指南
└── docker-compose.yml  # 容器化部署配置
```

---

## 🚀 快速开始

### 1. 环境准备
- **后端**: Python 3.12+, MySQL 8.0+
- **前端**: Node.js 18+

### 2. 本地安装
详细步骤请参阅：[本地安装与测试运行方案](./docs/LOCAL_INSTALLATION.md)

### 3. 环境验证
运行以下脚本检查您的 MySQL 与 API 配置：
```bash
python3 scripts/check_db_env.py
```

---

## 📝 架构演进
- **v1.6.0 (2026-02-27)**: 彻底废除 SQLite，全面转向 SQLAlchemy (MySQL/PG)；标准化 SSE 流式协议；目录结构规范化整理。
- **v1.5.0**: 实现 Android/iOS 移动端适配，引入 Mieru 思考可视化方案。
- **v1.4.0**: 集成 RAG 知识库功能，支持复杂 PDF 解析。
