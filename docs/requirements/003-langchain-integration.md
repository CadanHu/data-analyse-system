# LangChain 集成优化需求

## 一、需求背景

当前系统（v1.2.0）虽然已经实现了基本的 Text-to-SQL 功能，但未真正使用 LangChain 框架的强大能力。为了支持更复杂的查询、更多数据库类型、向量检索和更智能的 Agent 能力，需要全面集成 LangChain。

---

## 二、核心目标

### 2.1 短期目标（v2.0.0）
- ✅ 真正使用 LangChain 替代当前手写的 SQL Agent
- ✅ 支持多种数据库（MySQL、PostgreSQL、MongoDB）
- ✅ 实现复杂的 Agent 能力（工具调用、多步推理）
- ✅ 添加向量检索和 RAG 能力
- ✅ 集成可观测性和调试工具

### 2.2 长期目标（v2.x）
- 支持更多数据库类型（Elasticsearch、Redis、GraphDB）
- 实现多 Agent 协作
- 支持自定义工具和插件
- 企业级部署和监控

---

## 三、技术方案

### 3.1 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端 React App                                │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────┐
│                      FastAPI 后端层                                   │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐   │
│  │  API Routers │  │           LangChain Agent 层              │   │
│  └──────────────┘  │  ┌────────────────────────────────────┐  │   │
│                    │  │  Data Analysis Agent (主 Agent)      │  │   │
│                    │  │    - SQL 查询工具                     │  │   │
│                    │  │    - 向量检索工具                     │  │   │
│                    │  │    - 图表生成工具                     │  │   │
│                    │  │    - 数据可视化工具                   │  │   │
│                    │  └────────────────────────────────────┘  │   │
│                    │  ┌────────────────────────────────────┐  │   │
│                    │  │  Toolkit 层                         │  │   │
│                    │  │    - SQLDatabaseToolkit            │  │   │
│                    │  │    - VectorstoreRetrieverToolkit    │  │   │
│                    │  │    - CustomTools                    │  │   │
│                    │  └────────────────────────────────────┘  │   │
│                    └──────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         │                                               │
         ▼                                               ▼
┌──────────────────────┐                    ┌──────────────────────┐
│   数据库层           │                    │   向量数据库层        │
│  - SQLite            │                    │  - ChromaDB /        │
│  - MySQL             │                    │    Pinecone /        │
│  - PostgreSQL        │                    │    Milvus             │
│  - MongoDB           │                    └──────────────────────┘
└──────────────────────┘
```

### 3.2 核心模块设计

#### 3.2.1 LangChain Agent 模块
**文件位置**：`backend/agents/langchain_agent.py`

**职责**：
- 使用 LangChain 的 `create_sql_agent` 创建 SQL Agent
- 集成向量检索工具
- 集成图表生成工具
- 使用 LCEL (LangChain Expression Language) 构建复杂链

**技术栈**：
- `langchain.agents.create_sql_agent`
- `langchain_community.utilities.SQLDatabase`
- `langchain.tools.Tool`
- `langchain.agents.AgentExecutor`

#### 3.2.2 多数据库支持模块
**文件位置**：`backend/databases/`

**支持的数据库**：
- SQLite（现有）
- MySQL
- PostgreSQL
- MongoDB

**数据库连接池管理**：
- 使用 SQLAlchemy 统一连接管理
- 连接池配置
- 健康检查和重连机制

#### 3.2.3 向量检索和 RAG 模块
**文件位置**：`backend/services/vector_service.py`

**功能**：
- 文档向量化（使用 Sentence Transformers）
- 向量存储（ChromaDB / Pinecone）
- 语义检索
- RAG（检索增强生成）

#### 3.2.4 可观测性模块
**文件位置**：`backend/services/observability_service.py`

**功能**：
- LangChain 调用追踪（使用 LangSmith）
- Agent 执行日志
- 性能监控
- 调试面板

---

## 四、详细实施计划

### Phase 1: 基础架构搭建（1-2 天）
**目标**：集成 LangChain 基础框架，替换现有 SQL Agent

**任务清单**：
- [ ] 更新 requirements.txt，添加必要的 LangChain 依赖
- [ ] 创建 `LangChainSQLAgent` 类
- [ ] 使用 `create_sql_agent` 替代手写 SQL 生成逻辑
- [ ] 保持现有 Streamable HTTP 流式接口
- [ ] 编写单元测试

**验收标准**：
- 现有功能完全兼容
- SQL 生成准确率不低于现有水平
- 流式输出正常

---

### Phase 2: 多数据库支持（2-3 天）
**目标**：支持 MySQL、PostgreSQL、MongoDB

**任务清单**：
- [ ] 创建 `DatabaseManager` 类统一管理多数据库
- [ ] 集成 MySQL 支持（使用 pymysql / aiomysql）
- [ ] 集成 PostgreSQL 支持（使用 psycopg2 / asyncpg）
- [ ] 集成 MongoDB 支持（使用 pymongo / motor）
- [ ] 数据库连接池配置
- [ ] 前端数据库选择器更新
- [ ] 数据库配置管理

**验收标准**：
- 可以成功连接并查询 MySQL 数据库
- 可以成功连接并查询 PostgreSQL 数据库
- 可以成功连接并查询 MongoDB 数据库
- 数据库切换流畅

---

### Phase 3: 复杂 Agent 能力（2-3 天）
**目标**：实现工具调用、多步推理

**任务清单**：
- [ ] 创建自定义工具系统
- [ ] 实现 SQL 查询工具
- [ ] 实现向量检索工具
- [ ] 实现图表生成工具
- [ ] 使用 LangGraph 实现多步推理
- [ ] Agent 执行计划可视化
- [ ] 错误处理和重试机制

**验收标准**：
- Agent 可以正确选择和使用工具
- 支持复杂的多步推理任务
- 错误可以自动重试

---

### Phase 4: 向量检索和 RAG（2-3 天）
**目标**：实现向量检索和 RAG 能力

**任务清单**：
- [ ] 集成向量数据库（ChromaDB）
- [ ] 文档向量化（Sentence Transformers）
- [ ] 实现语义检索
- [ ] 实现 RAG 链
- [ ] 文档上传和处理
- [ ] 向量检索 UI

**验收标准**：
- 可以上传文档并向量化
- 可以进行语义检索
- RAG 生成结果准确

---

### Phase 5: 可观测性和调试工具（1-2 天）
**目标**：集成可观测性和调试工具

**任务清单**：
- [ ] 集成 LangSmith 追踪
- [ ] Agent 执行日志记录
- [ ] 性能监控面板
- [ ] 调试 UI（查看 Agent 执行过程）
- [ ] 错误追踪和告警

**验收标准**：
- LangSmith 可以追踪所有调用
- 可以查看 Agent 执行过程
- 性能指标正常显示

---

### Phase 6: 测试和优化（1-2 天）
**目标**：全面测试和性能优化

**任务清单**：
- [ ] 集成测试
- [ ] 性能测试
- [ ] 压力测试
- [ ] 代码优化
- [ ] 文档更新

**验收标准**：
- 所有测试通过
- 性能满足要求
- 文档完整

---

## 五、依赖更新

### 5.1 requirements.txt 更新

```txt
# FastAPI 核心
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6

# LangChain（新增/更新）
langchain==0.1.10
langchain-community==0.0.25
langchain-core==0.1.28
langchain-openai==0.0.8
langgraph==0.0.26
langsmith==0.1.5
openai==1.14.0

# 数据库（新增/更新）
aiosqlite==0.19.0
SQLAlchemy==2.0.28
pymysql==1.1.0
aiomysql==0.2.0
psycopg2-binary==2.9.9
asyncpg==0.29.0
pymongo==4.6.1
motor==3.3.2

# 向量数据库（新增）
chromadb==0.4.24
sentence-transformers==2.5.1

# HTTP 客户端
httpx==0.27.0

# 工具库
python-dotenv==1.0.0
pydantic==2.6.3
pydantic-settings==2.2.1

# 开发工具
pytest==7.4.4
pytest-asyncio==0.23.5
```

---

## 六、API 设计变更

### 6.1 新增接口

```python
# 数据库管理
GET    /api/databases              # 获取所有可用数据库（含类型）
POST   /api/databases/test         # 测试数据库连接
POST   /api/databases/add          # 添加新数据库配置
DELETE /api/databases/{id}         # 删除数据库配置

# 向量检索
POST   /api/vector/upload          # 上传文档并向量化
POST   /api/vector/search          # 语义检索
GET    /api/vector/documents       # 获取已向量化的文档列表

# 可观测性
GET    /api/observability/traces   # 获取 Agent 执行追踪
GET    /api/observability/metrics  # 获取性能指标
```

### 6.2 现有接口保持不变

- `/api/chat/stream` - 保持现有流式接口
- 会话管理接口 - 保持不变

---

## 七、风险评估

| 风险项 | 风险等级 | 应对措施 |
|--------|----------|----------|
| LangChain 版本兼容性 | 中 | 锁定版本，充分测试 |
| 多数据库连接稳定性 | 中 | 连接池管理，健康检查 |
| 向量数据库性能 | 低 | 优化索引，分批处理 |
| 现有功能兼容 | 高 | 充分回归测试 |

---

## 八、成功标准

### 8.1 功能标准
- ✅ 支持至少 4 种数据库（SQLite、MySQL、PostgreSQL、MongoDB）
- ✅ Agent 可以正确使用工具完成复杂任务
- ✅ 向量检索准确率 > 90%
- ✅ 可观测性面板可以正常工作

### 8.2 性能标准
- ✅ SQL 查询响应时间 < 2s（P95）
- ✅ 向量检索响应时间 < 500ms
- ✅ 系统可以支持 100 并发用户

### 8.3 质量标准
- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试通过
- ✅ 代码审查通过

---

## 九、后续规划

### v2.1.0
- 支持 Elasticsearch
- 支持 Redis
- 多 Agent 协作

### v2.2.0
- 自定义工具插件系统
- 企业级权限管理
- 高级分析功能

---

**创建日期**：2026-02-23
**需求提出人**：系统用户
**优先级**：高
**预计完成时间**：10-15 天
