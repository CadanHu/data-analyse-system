# Gemini CLI 开发规范 (Rules)

## 核心原则
- **日志记录**：在所有后端路由入口、数据库执行器、AI Agent 处理环节，必须添加详细的中文 `print` 日志。日志应包含关键状态（如：📥 收到请求、📡 发起 AI 请求、✅ 执行成功、❌ 发生错误）。
- **JSON 序列化**：所有涉及后端返回给前端的 JSON 数据，必须支持 Date/DateTime/Decimal 等 MySQL 常见类型。使用 `utils.json_utils.json_dumps` 或 `CustomJSONEncoder`。
- **错误处理**：捕获异常时必须打印完整堆栈（使用 `traceback.print_exc()`），并通过流式或 JSON 响应将清晰的错误信息返回给前端。

## 数据库规范
- **多数据库兼容**：所有功能必须兼容 MySQL 和 PostgreSQL（已废除 SQLite 支持）。
- **SQLAlchemy 驱动**：所有数据库交互必须通过 `DatabaseManager` 获取 SQLAlchemy 异步引擎，禁止直接使用底层驱动（如 `aiomysql`）手动编写 SQL。
- **Schema 动态加载**：Agent 在处理问题前必须先调用 `SchemaService` 获取当前数据库的最新的 Schema。

## 前端规范
- **代理优先**：所有 API 请求必须使用 `/api` 相对路径，禁止硬编码 `localhost:8000` 或其他具体端口。
- **状态同步**：删除或修改操作后，必须确保本地 Store 与后端状态同步。

## 功能变更记录
- 已删除“清空会话上下文”功能（包括前端按钮、API 接口及相关前端 Service 调用）。
- **[NEW] 用户认证系统**: 实现了完整的注册、登录、Token 验证流程，支持多用户隔离。
- **[NEW] 智能意图识别**: 引入意图分类逻辑，能够区分“数据查询(SQL)”与“普通对话(Chat)”，并提供智能回复。
- **[NEW] 架构优化**: 整合了 API 服务层，统一使用 Axios 拦截器注入 Token，支持流式 SSE 认证。
- **[FIX] 数据库兼容性**: 修复了 SQLite 关键字引用 bug，确保 Northwind 等数据库的稳定运行。
