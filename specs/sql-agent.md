# 规格：SQL Agent

> 来源：`backend/agents/sql_agent.py`（856行）+ `backend/agents/advanced_data_agent.py` 逆向
> 版本：v2.0

---

## 1. 职责边界

SQL Agent 负责将自然语言转换为 SQL 并执行。它不负责：
- 代码执行（由 `PythonExecutor` 负责）
- 向量检索（由 `VectorStore` 负责）
- 流式传输（由 `stream_service` 负责）

---

## 2. 工作流程

```
用户问题
    ↓
[1] 获取 Schema（SchemaService）
    ↓
[2] 意图分类
    ├── query     → [3] 生成 SQL
    ├── chat      → 直接生成回答
    └── confirm   → 等待用户确认后继续
    ↓
[3] 生成 SQL（Text-to-SQL）
    ↓
[4] 安全校验（只允许 SELECT）
    ↓
[5] 执行 SQL（SQLExecutor）
    ↓
[6] 结果总结（自然语言）
    ↓
[7] 可视化决策（chart_cfg）
```

---

## 3. 安全约束

| 约束 | 规格 |
|------|------|
| 允许的语句类型 | 仅 `SELECT` |
| 禁止的语句类型 | `INSERT`/`UPDATE`/`DELETE`/`DROP`/`CREATE`/`ALTER`/`TRUNCATE` 等所有 DDL/DML |
| 执行超时 | 30 秒 |
| 结果集上限 | 1000 行 |
| 权限 | 运行时使用只读数据库用户 |

---

## 4. Schema 加载规范

- Agent 处理每次请求**必须**先调用 `SchemaService` 获取最新 Schema
- 禁止缓存过期 Schema（每次请求重新加载）
- Schema 包含：表名、列名、数据类型、注释、外键关系

---

## 5. 上下文预算（Context Budget）

由 `ContextBudget`（`backend/agents/context_budget.py`）管理：
- 根据 `provider` 和 `model_name` 自动调整上下文窗口大小
- 超出预算时触发 `HistorySummarizer` 压缩历史
- 压缩后的消息标记 `is_compressed = true`

---

## 6. 多模型支持

通过 `model_provider` 和 `model_name` 动态切换：

| Provider | 代码标识 |
|----------|--------|
| DeepSeek | `deepseek` |
| OpenAI | `openai` |
| Google Gemini | `gemini` |
| Anthropic Claude | `claude` |

- 模型切换不影响 Agent 行为逻辑
- 会话标题生成始终使用 Provider 的默认标准模型（`model_name=None`），不受会话模型设置影响

---

## 7. 错误处理

| 错误场景 | 行为 |
|---------|------|
| Schema 获取失败 | 返回错误，不继续生成 SQL |
| SQL 语法错误 | 返回原始错误 + AI 建议修正方案 |
| SQL 执行超时 | 返回 `408` 错误 + 已执行时长 |
| 禁止的 SQL 类型 | 拒绝执行，返回安全提示 |
| 结果超出 1000 行 | 截断 + 提示用户添加 LIMIT |

---

## 8. 验收标准

| 场景 | 期望结果 | 测试文件 |
|------|---------|---------|
| "统计用户数" | 返回 `SELECT COUNT(*) FROM users` 类 SQL + 数字答案 | `test_sql_agent.py` |
| "删除所有订单" | 拒绝，返回安全提示 | ❌ 未覆盖 |
| SQL 执行超 30 秒 | 返回超时错误 | ❌ 未覆盖 |
| 查询返回 5000 行 | 截断至 1000 行并提示 | ❌ 未覆盖 |
| 表名不存在 | 返回错误提示 + Schema 中可用表列表 | ❌ 未覆盖 |
| ContextBudget 按模型计算 token 上限 | 各 provider/model 返回正确 token 数 | `test_context_modules.py::test_context_budget` |
| HistorySummarizer 压缩超限历史 | 超限消息标记 `is_compressed=True` | `test_context_modules.py::test_history_summarizer` |
| ContextRouter 路由选择 | 问候语不触发 Schema 加载 | `test_context_modules.py::test_context_router` |
| Schema 服务加载表结构 | 返回表名、列名、类型 | `test_part3.py::test_schema_service` |
