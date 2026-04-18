# 业务状态机文档索引

本目录对系统中所有核心业务对象的状态机进行精确定义。每份文档包含：状态枚举与含义、合法转换路径、触发条件、约束规则。

## 文档清单

| 业务对象 | 文件 | 核心状态数 | 说明 |
|---|---|---|---|
| 会话 (Session) | [session.md](./session.md) | 3 | 生命周期 + 模式开关 |
| 消息 (Message) | [message.md](./message.md) | 3 个维度 | 分支态 · 压缩态 · 反馈态 |
| 对话处理流 (Chat Flow) | [chat-flow.md](./chat-flow.md) | 6 种模式 × 事件序列 | SSE 事件流状态机 |
| 数据源 (DataSource) | [datasource.md](./datasource.md) | 4 | 连接生命周期 |
| 报告生成 (Report) | [report.md](./report.md) | 3 | 异步生成状态 |
| 用户认证 (Auth) | [auth.md](./auth.md) | 5 | 注册 / 登录 / Token 生命周期 |

## 约定

- 状态名使用 `SCREAMING_SNAKE_CASE`，与数据库字段值对应关系在各文档中单独说明。
- 状态转换图使用 Mermaid `stateDiagram-v2` 语法，可在 GitHub / 支持 Mermaid 的 Markdown 渲染器中直接预览。
- **非法转换**：未列出的转换路径均视为非法，系统应在业务层拒绝此类操作并返回 4xx 错误。
