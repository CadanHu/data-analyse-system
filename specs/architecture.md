# 规格：系统架构 (Architecture)

> 来源：`data-sys-docs/ARCHITECTURE_EN.md` + 代码逆向
> 版本：v4.0（物理隔离架构）

---

## 1. 系统定位

DataPulse 是一个 AI 驱动的智能数据分析平台，核心是**双引擎架构**：

- **结构化数据引擎**：Text-to-SQL，对接 MySQL / PostgreSQL
- **非结构化文档引擎**：RAG（向量检索 + 知识图谱），对接 PDF / 文档

---

## 2. 技术栈

### 后端
| 组件 | 技术选型 |
|------|--------|
| Web 框架 | FastAPI（异步） |
| AI 编排 | LangChain 0.3 |
| 数据库驱动 | SQLAlchemy asyncio |
| 数据库支持 | MySQL 8.0+，PostgreSQL 14+ |
| 文档解析 | MinerU，PyMuPDF (fitz) |
| 向量存储 | ChromaDB |
| 流式协议 | Server-Sent Events (SSE) |
| Python | 3.10+ |

### 前端
| 组件 | 技术选型 |
|------|--------|
| 框架 | React 18 + Vite + TypeScript |
| 样式 | Tailwind CSS |
| 可视化 | Apache ECharts 5 |
| 移动端 | Capacitor 6（iOS & Android） |
| 状态管理 | Zustand |

---

## 3. 核心设计模式

### 3.1 物理隔离（Physical Isolation）

5 种处理模式拥有**完全独立**的后端处理函数，禁止跨模式复用流解析逻辑：

| 模式 | 处理函数 | 核心能力 |
|------|---------|--------|
| 标准模式 | `run_standard_mode` | 通用 SQL 查询 + 对话 |
| 思考模式 | `run_thinking_mode` | 深度推理 + Text-to-SQL + 思维链展示 |
| 科学家模式 | `run_scientist_mode` | Python 数据分析 + 可视化 |
| RAG 模式 | `run_rag_mode` | 向量检索 + 文档 QA |
| 深度模式 | `run_depth_mode` | 多步骤高维数据建模 |

### 3.2 Agent 工作流（Agentic Workflow）

每次查询经历三个阶段：
```
分类（Classification）→ 规划（Planning）→ 执行（Execution）
```
- **分类**：识别意图（查询 / 对话 / 确认）
- **规划**：生成分析方案，必要时请用户确认
- **执行**：生成 SQL → 执行 → 自然语言总结

### 3.3 共享辅助函数（Shared Helpers）

非核心跨模式逻辑必须提取为独立辅助函数，禁止嵌入到模式处理器内：

| 辅助函数 | 位置 | 职责 |
|---------|------|------|
| `_handle_session_auto_title` | `chat_router.py` | 会话首条消息后异步生成标题 |
| `_fetch_rag_context` | `chat_router.py` | 向量检索并格式化上下文 |

---

## 4. 安全约束

- **认证**：JWT 无状态认证，所有接口强制校验 `current_user`
- **多租户隔离**：所有数据库查询必须带 `user_id` 过滤，禁止跨用户访问
- **数据库防护**：AI 生成的 SQL 只能走只读数据库用户权限
- **代码沙盒**：Python 执行前必须通过 AST 审计，禁止 `os`/`sys`/`shutil`

---

## 5. 项目目录结构

```
backend/
  agents/          # AI Agent（sql_agent, advanced_data_agent）
  routers/         # FastAPI 路由（每个业务域一个文件）
  services/        # 业务服务（知识提取、RAG、流媒体等）
  database/        # ORM 模型 + 数据库操作
  models/          # Pydantic 请求/响应模型
  utils/           # 工具函数（JSON 序列化、Prompt 模板等）
frontend/
  src/
    components/    # UI 组件
    hooks/         # React Hooks（useSSE 等）
    stores/        # Zustand 状态
    pages/         # 页面
specs/             # 规格文档（本目录）
data-sys-docs/     # 历史需求文档存档
```
