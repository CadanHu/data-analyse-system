# LangChain 集成 - 详细任务清单

**版本**: v2.0.0  
**创建日期**: 2026-02-23  
**预计完成时间**: 10-15 天

---

## Phase 1: 基础架构搭建（1-2 天）

### 目标
集成 LangChain 基础框架，替换现有手写 SQL Agent，保持功能兼容

---

#### Task 1.1: 更新依赖和配置
- [ ] 更新 `requirements.txt`，添加/更新 LangChain 相关依赖
  - langchain==0.1.10
  - langchain-community==0.0.25
  - langchain-core==0.1.28
  - langchain-openai==0.0.8
  - langsmith==0.1.5
  - openai==1.14.0
- [ ] 在 `config.py` 中添加 LangChain 配置
  - LANGCHAIN_TRACING_V2（可选，用于 LangSmith）
  - LANGCHAIN_API_KEY（可选）
  - LANGCHAIN_PROJECT（可选）
- [ ] 创建 `.env.example` 更新，添加新的环境变量示例

**验收标准**:
- 依赖安装成功
- 配置文件更新完成

---

#### Task 1.2: 创建 LangChainSQLAgent 类
- [ ] 创建新文件 `backend/agents/langchain_sql_agent.py`
- [ ] 使用 `langchain_community.utilities.SQLDatabase` 包装数据库连接
- [ ] 使用 `langchain.agents.create_sql_agent` 创建 SQL Agent
- [ ] 实现 `generate_sql()` 方法，保持与现有接口兼容
- [ ] 实现 `generate_sql_stream()` 方法，支持流式输出
- [ ] 添加错误处理和重试机制
- [ ] 编写单元测试

**技术细节**:
```python
from langchain_community.utilities import SQLDatabase
from langchain.agents import create_sql_agent
from langchain.agents.agent_types import AgentType
from langchain_openai import ChatOpenAI

class LangChainSQLAgent:
    def __init__(self, db_path: str):
        self.db = SQLDatabase.from_uri(f"sqlite:///{db_path}")
        self.llm = ChatOpenAI(
            model="deepseek-chat",
            base_url="https://api.deepseek.com/v1",
            api_key=API_KEY,
            temperature=0.1
        )
        self.agent = create_sql_agent(
            llm=self.llm,
            db=self.db,
            agent_type=AgentType.OPENAI_FUNCTIONS,
            verbose=True
        )
```

**验收标准**:
- Agent 可以成功连接数据库
- 可以生成正确的 SQL
- 接口与现有 `SQLAgent` 兼容

---

#### Task 1.3: 集成到现有系统
- [ ] 修改 `chat_router.py`，使用 `LangChainSQLAgent` 替代 `SQLAgent`
- [ ] 保持 Streamable HTTP 流式接口不变
- [ ] 更新 `sql_agent.py`（保留作为备份，或重命名为 `sql_agent_legacy.py`）
- [ ] 测试现有功能是否正常工作
- [ ] 修复发现的问题

**验收标准**:
- 所有现有功能正常
- SQL 生成准确率不低于现有水平
- 流式输出正常

---

#### Task 1.4: 文档更新
- [ ] 更新 `design.txt`，添加 LangChain 集成说明
- [ ] 更新 `README.md`，添加技术栈更新
- [ ] 编写开发文档，说明如何使用新的 Agent

---

## Phase 2: 多数据库支持（2-3 天）

### 目标
支持 MySQL、PostgreSQL、MongoDB，实现统一的数据库管理

---

#### Task 2.1: 创建 DatabaseManager 类
- [ ] 创建新文件 `backend/databases/__init__.py`
- [ ] 创建新文件 `backend/databases/database_manager.py`
- [ ] 实现数据库连接工厂
- [ ] 实现连接池管理
- [ ] 实现健康检查机制
- [ ] 实现自动重连机制

**技术设计**:
```python
class DatabaseManager:
    _connections: Dict[str, Any] = {}
    _pools: Dict[str, Any] = {}
    
    @classmethod
    def get_connection(cls, db_config: Dict) -> Any:
        db_type = db_config["type"]
        if db_type == "sqlite":
            return cls._get_sqlite_connection(db_config)
        elif db_type == "mysql":
            return cls._get_mysql_connection(db_config)
        elif db_type == "postgresql":
            return cls._get_postgresql_connection(db_config)
        elif db_type == "mongodb":
            return cls._get_mongodb_connection(db_config)
```

---

#### Task 2.2: 集成 MySQL 支持
- [ ] 在 `requirements.txt` 中添加 MySQL 依赖
  - pymysql==1.1.0
  - aiomysql==0.2.0
- [ ] 创建 `backend/databases/mysql_adapter.py`
- [ ] 实现 MySQL 连接管理
- [ ] 实现 SQL 执行（异步）
- [ ] 实现 Schema 提取
- [ ] 测试连接和查询
- [ ] 创建测试数据库配置

---

#### Task 2.3: 集成 PostgreSQL 支持
- [ ] 在 `requirements.txt` 中添加 PostgreSQL 依赖
  - psycopg2-binary==2.9.9
  - asyncpg==0.29.0
- [ ] 创建 `backend/databases/postgresql_adapter.py`
- [ ] 实现 PostgreSQL 连接管理
- [ ] 实现 SQL 执行（异步）
- [ ] 实现 Schema 提取
- [ ] 测试连接和查询
- [ ] 创建测试数据库配置

---

#### Task 2.4: 集成 MongoDB 支持
- [ ] 在 `requirements.txt` 中添加 MongoDB 依赖
  - pymongo==4.6.1
  - motor==3.3.2
- [ ] 创建 `backend/databases/mongodb_adapter.py`
- [ ] 实现 MongoDB 连接管理
- [ ] 实现查询执行（异步）
- [ ] 实现集合 Schema 提取
- [ ] 测试连接和查询
- [ ] 创建测试数据库配置

---

#### Task 2.5: 更新配置系统
- [ ] 更新 `config.py` 中的 `DATABASES` 配置
- [ ] 支持多种数据库类型配置
- [ ] 添加数据库连接测试接口
- [ ] 添加数据库配置管理接口

**配置示例**:
```python
DATABASES = {
    "business_sqlite": {
        "type": "sqlite",
        "path": DATABASE_DIR / "business.db",
        "name": "业务数据库 (SQLite)"
    },
    "business_mysql": {
        "type": "mysql",
        "host": "localhost",
        "port": 3306,
        "database": "business",
        "user": "root",
        "password": "",
        "name": "业务数据库 (MySQL)"
    },
    "business_postgresql": {
        "type": "postgresql",
        "host": "localhost",
        "port": 5432,
        "database": "business",
        "user": "postgres",
        "password": "",
        "name": "业务数据库 (PostgreSQL)"
    },
    "business_mongodb": {
        "type": "mongodb",
        "uri": "mongodb://localhost:27017",
        "database": "business",
        "name": "业务数据库 (MongoDB)"
    }
}
```

---

#### Task 2.6: 前端更新
- [ ] 更新 `SessionList.tsx` 中的数据库选择器
- [ ] 支持显示数据库类型
- [ ] 添加数据库连接状态显示
- [ ] 添加数据库测试连接按钮
- [ ] 更新类型定义

---

#### Task 2.7: API 接口更新
- [ ] 添加 `GET /api/databases` - 获取所有可用数据库
- [ ] 添加 `POST /api/databases/test` - 测试数据库连接
- [ ] 添加 `POST /api/databases/add` - 添加新数据库配置
- [ ] 添加 `DELETE /api/databases/{id}` - 删除数据库配置
- [ ] 更新 `POST /api/database/switch` - 支持多种数据库类型

---

## Phase 3: 复杂 Agent 能力（2-3 天）

### 目标
实现工具调用、多步推理，使用 LangGraph

---

#### Task 3.1: 创建自定义工具系统
- [ ] 创建 `backend/tools/__init__.py`
- [ ] 创建 `backend/tools/base_tool.py` - 基础工具类
- [ ] 创建工具注册机制
- [ ] 实现工具描述和参数定义

---

#### Task 3.2: 实现 SQL 查询工具
- [ ] 创建 `backend/tools/sql_query_tool.py`
- [ ] 继承 `BaseTool`
- [ ] 实现 SQL 查询功能
- [ ] 添加安全校验（只允许 SELECT）
- [ ] 集成到 Agent

---

#### Task 3.3: 实现向量检索工具
- [ ] 创建 `backend/tools/vector_search_tool.py`
- [ ] 继承 `BaseTool`
- [ ] 实现向量检索功能
- [ ] 集成到 Agent

---

#### Task 3.4: 实现图表生成工具
- [ ] 创建 `backend/tools/chart_generation_tool.py`
- [ ] 继承 `BaseTool`
- [ ] 实现图表配置生成
- [ ] 集成到 Agent

---

#### Task 3.5: 使用 LangGraph 实现多步推理
- [ ] 在 `requirements.txt` 中添加 `langgraph==0.0.26`
- [ ] 创建 `backend/agents/data_analysis_agent.py`
- [ ] 设计 Agent 状态图
- [ ] 实现节点（Node）
- [ ] 实现边（Edge）
- [ ] 实现条件边（Conditional Edge）
- [ ] 编译并测试 Graph

**LangGraph 设计**:
```
┌─────────────┐
│   Start     │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Analyze Question │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐     Yes    ┌─────────────────┐
│  Need SQL?       │ ─────────→ │  Execute SQL    │
└──────┬───────────┘            └────────┬────────┘
       │ No                              │
       ▼                                 │
┌──────────────────┐                    │
│ Need Vector?     │     Yes            │
└──────┬───────────┘ ──────────────────┤
       │ No                              │
       ▼                                 │
┌──────────────────┐                    │
│ Generate Summary │ ◄──────────────────┘
└──────┬───────────┘
       │
       ▼
┌─────────────┐
│    End      │
└─────────────┘
```

---

#### Task 3.6: Agent 执行计划可视化
- [ ] 创建 Agent 执行追踪系统
- [ ] 记录每个步骤的输入输出
- [ ] 记录工具调用
- [ ] 前端展示执行过程
- [ ] 添加调试面板

---

#### Task 3.7: 错误处理和重试
- [ ] 实现智能错误处理
- [ ] 实现自动重试机制
- [ ] 实现回退策略
- [ ] 添加用户友好的错误提示

---

## Phase 4: 向量检索和 RAG（2-3 天）

### 目标
实现向量检索和 RAG 能力

---

#### Task 4.1: 集成向量数据库
- [ ] 在 `requirements.txt` 中添加向量数据库依赖
  - chromadb==0.4.24
  - sentence-transformers==2.5.1
- [ ] 创建 `backend/services/vector_store.py`
- [ ] 初始化 ChromaDB
- [ ] 实现集合管理
- [ ] 实现文档添加
- [ ] 实现向量检索

---

#### Task 4.2: 文档向量化
- [ ] 创建 `backend/services/embedding_service.py`
- [ ] 集成 Sentence Transformers
- [ ] 实现文本向量化
- [ ] 实现文档分块
- [ ] 实现批量向量化

---

#### Task 4.3: 实现语义检索
- [ ] 实现相似度搜索
- [ ] 实现混合搜索（关键词 + 语义）
- [ ] 实现结果重排序
- [ ] 实现检索结果过滤

---

#### Task 4.4: 实现 RAG 链
- [ ] 创建 `backend/chains/rag_chain.py`
- [ ] 使用 LangChain LCEL 构建 RAG 链
- [ ] 实现检索增强生成
- [ ] 实现上下文注入
- [ ] 测试 RAG 效果

---

#### Task 4.5: 文档上传和处理
- [ ] 更新 `upload_router.py`
- [ ] 支持文档上传（PDF、TXT、Markdown）
- [ ] 实现文档解析
- [ ] 实现自动向量化
- [ ] 添加文档处理进度

---

#### Task 4.6: 向量检索 UI
- [ ] 创建文档管理页面
- [ ] 创建向量检索界面
- [ ] 展示检索结果
- [ ] 展示相似度分数
- [ ] 添加文档预览

---

## Phase 5: 可观测性和调试工具（1-2 天）

### 目标
集成可观测性和调试工具

---

#### Task 5.1: 集成 LangSmith
- [ ] 在 `config.py` 中添加 LangSmith 配置
- [ ] 设置环境变量
- [ ] 启用 LangChain 追踪
- [ ] 测试追踪功能
- [ ] 配置追踪项目

---

#### Task 5.2: Agent 执行日志记录
- [ ] 创建 `backend/services/observability_service.py`
- [ ] 实现 Agent 执行日志
- [ ] 实现工具调用日志
- [ ] 实现性能指标记录
- [ ] 实现错误日志

---

#### Task 5.3: 性能监控面板
- [ ] 创建性能监控接口
- [ ] 收集性能指标
- [ ] 实现指标可视化
- [ ] 添加告警机制

---

#### Task 5.4: 调试 UI
- [ ] 创建调试面板
- [ ] 展示 Agent 执行过程
- [ ] 展示 LangSmith 链接
- [ ] 展示日志
- [ ] 添加手动重试

---

#### Task 5.5: 错误追踪和告警
- [ ] 实现错误追踪
- [ ] 实现错误分类
- [ ] 实现告警通知
- [ ] 添加错误统计

---

## Phase 6: 测试和优化（1-2 天）

### 目标
全面测试和性能优化

---

#### Task 6.1: 集成测试
- [ ] 编写端到端测试
- [ ] 测试所有数据库类型
- [ ] 测试 Agent 工具调用
- [ ] 测试 RAG 功能
- [ ] 测试错误处理

---

#### Task 6.2: 性能测试
- [ ] 性能基准测试
- [ ] 并发测试
- [ ] 压力测试
- [ ] 内存使用分析
- [ ] 响应时间分析

---

#### Task 6.3: 代码优化
- [ ] 性能优化
- [ ] 内存优化
- [ ] 代码重构
- [ ] 添加类型提示
- [ ] 代码审查

---

#### Task 6.4: 文档更新
- [ ] 更新 `README.md`
- [ ] 更新 `design.txt`
- [ ] 编写 API 文档
- [ ] 编写部署文档
- [ ] 编写用户指南

---

## 总体里程碑

| Milestone | 时间 | 交付物 |
|-----------|------|--------|
| M1: Phase 1 完成 | Day 2 | LangChain 集成完成，现有功能兼容 |
| M2: Phase 2 完成 | Day 5 | 支持 4 种数据库 |
| M3: Phase 3 完成 | Day 8 | 复杂 Agent 能力完成 |
| M4: Phase 4 完成 | Day 11 | 向量检索和 RAG 完成 |
| M5: Phase 5 完成 | Day 13 | 可观测性完成 |
| M6: Phase 6 完成 | Day 15 | v2.0.0 发布 |

---

## 风险和缓解措施

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| LangChain 版本兼容性 | 中 | 锁定版本，充分测试 |
| 多数据库连接稳定性 | 中 | 连接池管理，健康检查 |
| 向量数据库性能 | 低 | 优化索引，分批处理 |
| 现有功能兼容 | 高 | 充分回归测试 |

---

**创建者**: AI Assistant  
**最后更新**: 2026-02-23
