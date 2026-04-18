# 规格：对话处理模式 (Chat Modes)

> 来源：`data-sys-docs/requirements/011-data-scientist-mode-spec.md` + `chat_router.py` 逆向
> 版本：v4.0

---

## 1. 模式路由规则

收到 `POST /chat/stream` 请求后，按以下优先级选择模式（互斥）：

```
enable_data_science_agent = true  →  科学家模式
enable_thinking = true            →  思考模式
enable_rag = true                 →  RAG 模式
enable_depth = true               →  深度模式
（默认）                           →  标准模式
```

**约束**：一次请求只能激活一种模式，模式由 Session 级别开关持久化（`sessions` 表字段）。

---

## 2. 请求协议（ChatRequest）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `session_id` | str | 必填 | 会话 ID |
| `question` | str | 必填 | 用户问题 |
| `parent_id` | str? | null | 分支消息的父消息 ID |
| `enable_thinking` | bool | false | 开启思考模式 |
| `enable_rag` | bool | false | 开启 RAG 模式 |
| `rag_scope` | str | "session" | RAG 范围：`session` / `global` |
| `enable_data_science_agent` | bool | false | 开启科学家模式 |
| `enable_depth` | bool | false | 开启深度模式 |
| `no_database` | bool | false | 跳过意图分类，直接走对话路径 |
| `external_data` | list? | null | 外部 Agent 注入数据 |
| `model_provider` | str? | null | 供应商：`deepseek`/`openai`/`gemini`/`claude` |
| `model_name` | str? | null | 具体模型名称 |
| `language` | str | "zh" | 响应语言：`zh`/`en` |

---

## 3. 标准模式（Standard Mode）

**触发**：无任何模式开关。

**行为**：
1. 调用 `SchemaService` 获取当前数据库 Schema
2. Agent 执行意图分类（查询 / 对话 / 确认）
3. 若为查询：生成 SQL → 执行 → 自然语言总结
4. 若为对话：直接生成回答
5. 首条消息后异步触发会话自动命名

**约束**：
- 只允许 SELECT 语句
- 执行超时：30 秒
- 结果集限制：1000 行

---

## 4. 思考模式（Thinking Mode）

**触发**：`enable_thinking = true`

**行为**：
- 启用支持推理的模型（DeepSeek-Reasoner / Gemini-Thinking / Claude）
- 必须捕获 `thinking` 内容并流式传输到前端
- `thinking` 字段必须存入 `messages` 表

**约束**：
- 思考内容通过独立 SSE 事件类型 `thinking` 传输
- 禁止与科学家模式同时开启
- 参见 [sse-protocol.md](./sse-protocol.md) 获取完整事件规范

---

## 5. 科学家模式（Scientist Mode）

**触发**：`enable_data_science_agent = true`

**行为**：
1. AI 生成 Python 数据分析代码
2. 代码通过 `PythonExecutor` 沙盒执行
3. Matplotlib 图像转 Base64 存入 `messages.plot_image_base64`
4. ECharts 配置存入 `messages.chart_cfg`
5. 支持异步 HTML 报告生成

**约束**：
- **严禁**展示思考过程（`thinking` 字段必须为空）
- 执行前必须通过 AST 审计，禁止导入 `os`/`sys`/`shutil` 等系统库
- 代码执行失败必须返回格式化错误，不得崩溃后端进程
- JS 风格注释（`//`）和中文引号必须在执行前预处理剔除
- 修改 `chat_router.py` 时必须用 `if request.enable_data_science_agent:` 分支隔离

---

## 6. RAG 模式（RAG Mode）

**触发**：`enable_rag = true`

**行为**：
1. 根据 `rag_scope` 确定检索范围（当前会话 / 全局）
2. 向量检索 + 文件名提升（filename boost）
3. 检索结果注入对话上下文
4. 生成基于文档的回答并附带来源引用

**约束**：
- `rag_scope = "global"` 时，检索当前用户所有会话的知识库
- 最多检索 top_k = 8 个片段
- 参见 [rag.md](./rag.md) 获取完整规格

---

## 7. 深度模式（Depth Mode）

**触发**：`enable_depth = true`

**行为**：
- 向 Agent Prompt 注入专用深度分析指令
- 执行多步骤高维数据建模
- 输出穷举式分析结论

**约束**：
- 禁止与科学家模式同时开启

---

## 8. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| 标准模式非流式调用 | 返回完整回答，无错误 | `test_deepseek.py::test_case_1` |
| 标准模式流式调用 | 逐字流式返回内容 | `test_deepseek.py::test_case_2` |
| 思考模式单轮 | SSE 流中出现 `thinking` 内容，推理与回答分离 | `test_deepseek.py::test_case_3` |
| 思考模式多轮对话 | 多轮均正确捕获思考内容 | `test_deepseek.py::test_case_4` |
| SSE 流包含 content 和 done 事件 | 流中必须出现 summary/content 和 done | `test_chat_regression.py::test_stream_returns_content_and_done` |
| 消息写入数据库 | 对话后 DB 中有 user + assistant 两条消息 | `test_chat_regression.py::test_messages_persisted_to_db` |
| 用户消息内容与问题一致 | DB 中 user 消息 content == 请求 question | `test_chat_regression.py::test_user_message_content_matches_question` |
| done 事件携带 message_id | done.data 中含 message_id 字段 | `test_chat_regression.py::test_done_event_has_message_id` |
| Agent 异常不崩溃后端 | 流中出现 error 事件，HTTP 仍为 200 | `test_chat_regression.py::test_agent_error_returns_error_event` |
| 科学家模式下问"绘制销售趋势图" | 返回 Base64 图像，`thinking` 为空 | ❌ 未覆盖 |
| RAG 模式下问文档内容 | 回答附带来源引用 | ❌ 未覆盖 |
| 两个模式开关同时为 true | 按优先级只执行优先级高的模式 | ❌ 未覆盖 |
