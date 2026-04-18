# 规格：测试策略 (Test Strategy)

> 版本：v1.0
> 测试目录：`backend/tests/`
> 运行环境：`backend/venv312/bin/pytest`

---

## 1. 测试分层

```
E2E 测试（暂无，人工验收）
        ↑
集成测试（需真实 DB / API Key）
  test_mysql_connection.py
  test_postgres_storage.py
  test_deepseek.py
  test_sql_agent.py
        ↑
单元/回归测试（全 mock，随时可运行）
  test_chat_regression.py   ← 核心链路
  test_context_modules.py
  test_rag_pipeline.py
  test_graph_rag_features.py
```

**原则**：单元/回归测试不依赖真实数据库或 AI 服务，CI 中只跑这一层。集成测试在本地有数据库环境时手动运行。

---

## 2. 测试文件与 Spec 对应关系

| 测试文件 | 对应 Spec | 类型 | 需要真实环境 |
|---------|---------|------|------------|
| `test_chat_regression.py` | [chat-modes.md](./chat-modes.md) § 核心链路 | 回归 | 否 |
| `test_context_modules.py` | [sql-agent.md](./sql-agent.md) § ContextBudget/Router | 单元 | 否 |
| `test_rag_pipeline.py` | [rag.md](./rag.md) § 检索规格 | 单元 | 否（内存 ChromaDB）|
| `test_graph_rag_features.py` | [knowledge-graph.md](./knowledge-graph.md) § 社区检测 | 单元 | 否 |
| `test_part3.py` | [database-connection.md](./database-connection.md) § 模块导入 | 单元 | 否 |
| `test_mysql_connection.py` | [database-connection.md](./database-connection.md) § MySQL 连接 | 集成 | **是（MySQL）** |
| `test_postgres_storage.py` | [database-connection.md](./database-connection.md) § PG 存储 | 集成 | **是（PostgreSQL）** |
| `test_sql_agent.py` | [sql-agent.md](./sql-agent.md) § 查询生命周期 | 集成 | **是（DB + API Key）** |
| `test_deepseek.py` | [chat-modes.md](./chat-modes.md) § 标准/思考模式 | 集成 | **是（DeepSeek API）** |
| `test_deep_extraction.py` | [upload-processing.md](./upload-processing.md) § 抽取流程 | 集成 | **是（MinerU API）** |
| `test_api.py` | [session-management.md](./session-management.md) § 会话 CRUD | 集成 | **是（MySQL）** |

---

## 3. 运行方式

### 单元/回归测试（无需环境，随时运行）

```bash
cd backend
# 全跑
venv312/bin/pytest tests/test_chat_regression.py tests/test_context_modules.py tests/test_rag_pipeline.py tests/test_graph_rag_features.py tests/test_part3.py -v

# 只跑核心链路回归
venv312/bin/pytest tests/test_chat_regression.py -v
```

### 集成测试（需本地 Docker 环境启动）

```bash
docker-compose up -d   # 启动 MySQL + PostgreSQL
cd backend
venv312/bin/pytest tests/test_mysql_connection.py tests/test_postgres_storage.py -v
```

---

## 4. 测试覆盖缺口（❌ 待补）

以下验收条目在各 Spec 中标记为 `❌ 未覆盖`，按优先级排列：

| 优先级 | 场景 | 所在 Spec |
|--------|------|---------|
| 🔴 高 | 无 Token 访问受保护接口 → 返回 401 | auth.md |
| 🔴 高 | SQL Agent 拒绝 DDL 语句 | sql-agent.md |
| 🟡 中 | 思考模式科学家模式 `thinking` 字段为空 | chat-modes.md |
| 🟡 中 | RAG 文件名提升（filename boost）效果 | rag.md |
| 🟡 中 | 知识图谱实体删除级联关系 | knowledge-graph.md |
| 🟢 低 | 可视化降级方案（AI viz_config 缺失） | visualization.md |
| 🟢 低 | SSE 流 done 事件后不重复渲染 | sse-protocol.md |

---

## 5. 新增测试规范

为新功能编写测试时必须遵守：

1. **先找 Spec**：打开对应 Spec 文件的"验收标准"表格，找到 `❌ 未覆盖` 条目
2. **写测试**：测试名称直接映射验收条目描述（如 `test_ddl_rejected_by_sql_agent`）
3. **更新 Spec**：将 `❌ 未覆盖` 改为 `测试文件::测试函数名`
4. **不依赖外部服务**：单元/回归测试必须 mock 所有 DB 和 AI 调用
5. **不测实现细节**：只测 Spec 描述的行为（输入→输出），不测内部函数调用顺序

---

## 6. Mock 模板

所有回归测试共用 `test_chat_regression.py` 中的 `call_chat_stream()` 辅助函数。

新增对话流相关测试参考：

```python
async def test_xxx():
    response, saved = await call_chat_stream("你的测试问题")
    # 基于 response 和 saved 做断言
    events = parse_sse(response.content)
    ...
```
