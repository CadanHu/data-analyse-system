# 智能数据分析助理 (DataPulse)

基于 AI 的智能数据分析系统，通过自然语言对话实现数据查询、分析和可视化。

## 🎯 功能特性

### 核心功能
- ✅ **iOS 移动端原生支持**：基于 Capacitor 6 实现，完美适配 iPhone 刘海屏及横屏分析模式。
- ✅ **自然语言查询**：用中文提问，自动生成 SQL 查询。
- ✅ **实时流式输出**：通过 Streamable HTTP 实时显示 AI 思考过程。
- ✅ **智能 SQL 修正**：SQL 执行失败时自动重试修正。
- ✅ **数据可视化**：自动生成柱状图、折线图、饼图和表格，支持全屏深度分析。
- ✅ **会话管理**：支持多会话，历史记录自动同步至 MySQL。
- ✅ **响应式设计**：完美适配移动端、桌面端及横屏手动拖拽布局。

### AI 能力
- 🤖 **DeepSeek R1 推理模型**：集成最新 DeepSeek AI，支持深度思考链（CoT）展示。
- 💡 **思考模式**：展示 AI 的分析思路，帮助用户理解复杂数据查询逻辑。
- 🧠 **智能总结**：自动生成有意义的会话标题。

### 数据管理
- 🗄️ **多数据源支持**：支持 MySQL、PostgreSQL、SQLite 等多种数据库
- 📊 **预置数据集**：集成 Chinook、Northwind 以及**经典商业分析库**和**全场景商业分析库 (MySQL)**
- 🔄 **灵活切换**：每个会话独立选择数据库，自动记住设置
- 💾 **持久化升级**：支持将聊天会话和历史消息存储在 MySQL 数据库中，提升系统稳定性

### 增强功能
- 📁 **文件上传**：支持上传图片和文档，AI 自动分析内容
- 📝 **SQL 代码管理**：查看、复制、折叠 SQL 查询语句
- 🎨 **图表类型切换**：支持多种图表类型，可手动切换
- ⏰ **时区优化**：统一使用本地时区（CST）记录时间，解决 8 小时显示偏差问题

### 用户体验
- 📖 **教程页面**：详细的 6 步教程，帮助快速上手
- 📋 **功能特性页面**：展示 12 个核心功能的详细介绍
- 📅 **更新日志页面**：追踪系统更新和改进历史
- 🔒 **数据安全**：多层安全机制，保护数据隐私

## 🚀 技术栈

### 后端
- **框架**: FastAPI
- **AI**: LangChain + DeepSeek AI
- **数据库**: SQLite3 (aiosqlite) & MySQL (aiomysql)
- **API 文档**: Swagger UI
- **流式传输**: Streamable HTTP

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **状态管理**: Zustand
- **样式**: Tailwind CSS
- **图表**: ECharts 5
- **路由**: React Router 6

## 📦 项目结构

```
data-analyse-system/
├── backend/                    # 后端项目
│   ├── main.py                # FastAPI 入口
│   ├── config.py              # 全局配置
│   ├── database/              # 数据库模块
│   │   ├── session_db.py      # 会话数据库 (支持 MySQL/SQLite)
│   │   └── business_db.py     # 业务数据库
│   ├── routers/               # API 路由
│   ├── agents/                # AI Agent
│   ├── services/              # 服务层
│   ├── models/                # Pydantic 模型
│   ├── utils/                 # 工具函数
│   │   └── json_utils.py      # 自定义 JSON 序列化 (支持日期类型)
│   └── .env                   # 环境变量
```

## 🎮 快速开始

1. **后端配置**:
   - 在 `backend/.env` 中填入 `DEEPSEEK_API_KEY`。
   - 配置 MySQL 信息并设置 `USE_MYSQL_FOR_SESSIONS=true`。
2. **启动服务**:
   - 后端: `cd backend && source venv312/bin/activate && python3 -m uvicorn main:app --host 0.0.0.0 --port 8003 --reload`
   - 前端: `cd frontend && npm run dev`
3. **访问**: `http://localhost:5173`

## 📝 版本历史

### v1.3.0 (2026-02-23)
- **持久化升级**: 支持将会话和消息持久化存储在 MySQL。
- **商业分析增强**: 预置了“经典商业分析库”和“全场景商业分析库 (MySQL)”，支持真实销售数据演示。
- **时区修复**: 解决会话列表时间显示“8 小时前”的偏差问题。
- **序列化修复**: 解决 MySQL 日期类型数据无法 JSON 序列化的问题。
- **功能精简**: 删除了“清空上下文”冗余功能，优化会话列表 UI。
- **端口优化**: 统一前端 API 路径，支持通过 Vite 代理自动适配后端端口。

### v1.2.0 (2024-02-20)
- 新增 DeepSeek 推理模型支持
- 添加思考模式切换开关
- 新增文件上传功能
- 集成 Chinook 和 Northwind 数据库

---

**最后更新**: 2026-02-23
**当前版本**: v1.3.0
