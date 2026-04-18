# DataPulse 规格索引 (Spec Index)

> **规格驱动开发规则**：所有新功能和改动必须先在此目录添加或更新对应的 Spec，再修改代码。PR 中必须同时包含 Spec 变更和代码变更。

## 架构与基础

| 文件 | 内容 | 状态 |
|------|------|------|
| [architecture.md](./architecture.md) | 系统整体架构、技术栈、设计模式 | ✅ 已定稿 |
| [data-models.md](./data-models.md) | 核心数据模型（Session、Message、User 等）+ ERD | ✅ 已定稿 |
| [auth.md](./auth.md) | 用户认证、JWT、API Key 管理 | ✅ 已定稿 |
| [api-spec.md](./api-spec.md) | 全量 API 接口规范：请求/响应 Schema、错误码 | ✅ 已定稿 |

## 核心功能

| 文件 | 内容 | 状态 |
|------|------|------|
| [chat-modes.md](./chat-modes.md) | 5 种对话处理模式（标准/思考/科学家/RAG/深度） | ✅ 已定稿 |
| [sse-protocol.md](./sse-protocol.md) | SSE 流式传输协议、事件类型规范 | ✅ 已定稿 |
| [sql-agent.md](./sql-agent.md) | SQL Agent 行为规格、查询生命周期 | ✅ 已定稿 |
| [visualization.md](./visualization.md) | 可视化决策规格、图表类型、指标卡片 | ✅ 已定稿 |

## 知识处理

| 文件 | 内容 | 状态 |
|------|------|------|
| [rag.md](./rag.md) | RAG 知识库、向量检索、文档管理 | ✅ 已定稿 |
| [knowledge-graph.md](./knowledge-graph.md) | 知识图谱构建、实体关系、社区检测 | ✅ 已定稿 |
| [upload-processing.md](./upload-processing.md) | 文件上传、PDF 解析、知识抽取流程 | ✅ 已定稿 |

## 会话与数据源

| 文件 | 内容 | 状态 |
|------|------|------|
| [session-management.md](./session-management.md) | 会话生命周期、分支、导出 | ✅ 已定稿 |
| [database-connection.md](./database-connection.md) | 数据库连接配置、多库切换、Schema 加载 | ✅ 已定稿 |

## 客户端

| 文件 | 内容 | 状态 |
|------|------|------|
| [mobile.md](./mobile.md) | 移动端适配规范（iOS/Android/Capacitor） | ✅ 已定稿 |

## 测试

| 文件 | 内容 | 状态 |
|------|------|------|
| [test-strategy.md](./test-strategy.md) | 测试分层策略、测试与 Spec 对应关系、覆盖缺口优先级、Mock 模板 | ✅ 已定稿 |

## UX 与开发规范

| 文件 | 内容 | 状态 |
|------|------|------|
| [ux-flows.md](./ux-flows.md) | 核心交互流程：登录、数据库连接、发消息、文件上传、会话管理、错误状态总览 | ✅ 已定稿 |
| [coding-style.md](./coding-style.md) | Python/TypeScript 命名约定、代码结构、注释规范、PR Checklist | ✅ 已定稿 |

## 安全与部署

| 文件 | 内容 | 状态 |
|------|------|------|
| [security.md](./security.md) | 安全规范：JWT、API Key 存储、Python 沙盒、SQL 注入防护、威胁模型 | ✅ 已定稿 |
| [deployment.md](./deployment.md) | 部署规范：Docker、环境变量、数据持久化、回滚策略 | ✅ 已定稿 |

## 架构决策记录（ADR）

| 文件 | 决策 | 状态 |
|------|------|------|
| [adr/001-sqlite-to-sqlalchemy.md](./adr/001-sqlite-to-sqlalchemy.md) | 从 SQLite 迁移至 SQLAlchemy + MySQL/PostgreSQL | ✅ 已决定 |
| [adr/002-physical-mode-isolation.md](./adr/002-physical-mode-isolation.md) | 5 种处理模式物理隔离架构 | ✅ 已决定 |
| [adr/003-graphrag-community-detection.md](./adr/003-graphrag-community-detection.md) | 引入 GraphRAG 层级社区检测（Map-Reduce 全局搜索） | ✅ 已决定 |

---

## 历史需求文档（存档）

原始需求文档保留在 `data-sys-docs/requirements/` 作为变更历史参考，不再更新。

| 编号 | 主题 |
|------|------|
| 007 | SQLite → SQLAlchemy 迁移 |
| 008 | SSE 协议标准化与安卓连通性 |
| 009 | 智慧可视化与指标卡片 |
| 010 | 进阶可视化与系统自动适配 |
| 010 | AI 思考过程捕获标准 |
| 011 | 数据科学家模式 |
| 011 | 移动端稳定化与可视化报告精修 |
