# Gemini CLI 开发规范 (Rules)

## 核心原则
- **日志记录**：在所有后端路由入口、数据库执行器、AI Agent 处理环节，必须添加详细的中文 `print` 日志。日志应包含关键状态（如：📥 收到请求、📡 发起 AI 请求、✅ 执行成功、❌ 发生错误）。
- **JSON 序列化**：所有涉及后端返回给前端的 JSON 数据，必须支持 Date/DateTime/Decimal 等 MySQL 常见类型。使用 `utils.json_utils.json_dumps` 或 `CustomJSONEncoder`。
- **错误处理**：捕获异常时必须打印完整堆栈（使用 `traceback.print_exc()`），并通过流式或 JSON 响应将清晰的错误信息返回给前端。

## 数据库规范
- **多数据库兼容**：所有功能必须兼容 MySQL 和 PostgreSQL（已废除 SQLite 支持）。
- **SQLAlchemy 驱动**：所有数据库交互必须通过 `DatabaseManager` 获取 SQLAlchemy 异步引擎，禁止直接使用底层驱动（如 `aiomysql`）手动编写 SQL。
- **Schema 动态加载**：Agent 在处理问题前必须先调用 `SchemaService` 获取当前数据库的最新的 Schema。

## 通讯协议规范
- **标准 SSE**：流式接口必须遵循标准 Server-Sent Events 协议，数据以 `data: ` 开头，以 `\n\n` 结尾。
- **无缓冲传输**：后端响应头必须包含 `X-Accel-Buffering: no` 和 `Cache-Control: no-transform`，确保移动端流式体验。

## 前端规范
- **防御性渲染**：在对后端返回的列表数据（如 sessions, databases, messages）执行 `.map()` 操作前，必须进行 `Array.isArray()` 校验。
- **URL 发现**：禁止在组件中硬编码 API 地址，统一调用 `api/index.ts` 中的 `getBaseURL()`。
- **状态同步**：切换会话或回看历史消息时，必须通过 `chatStore.setCurrentAnalysis` 同步可视化状态。
