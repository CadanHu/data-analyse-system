# 规格：SSE 流式传输协议 (SSE Protocol)

> 来源：`data-sys-docs/requirements/008-standardized-sse-and-android-connectivity.md` + `chat_router.py` 逆向
> 版本：v2.0

---

## 1. 协议标准

所有流式响应必须严格遵循 SSE 规范：

```
data: <json>\n\n
```

- 每条消息以 `data: ` 开头
- 内容为 JSON 字符串
- 每条消息后跟**两个换行符**（`\n\n`）
- Content-Type: `text/event-stream`
- 禁止使用自定义帧格式

---

## 2. 事件类型（Event Types）

所有 SSE 消息的 JSON 中必须包含 `type` 字段：

| `type` 值 | 触发场景 | payload 说明 |
|----------|---------|------------|
| `thinking` | 思考模式推理内容 | `{ "content": "..." }` |
| `content` | AI 正文回答逐字流 | `{ "content": "..." }` |
| `sql` | SQL 语句生成完毕 | `{ "sql": "SELECT ..." }` |
| `data` | SQL 执行结果 | `{ "rows": [...], "columns": [...] }` |
| `chart` | 可视化配置 | `{ "chart_cfg": {...} }` |
| `plot` | Python 图表（Base64） | `{ "plot_image_base64": "..." }` |
| `done` | 流结束 | `{ "session_title": "...", "message_id": "..." }` |
| `error` | 错误 | `{ "message": "错误描述" }` |

**约束**：
- `done` 事件必须携带 `session_title`（用于 UI 实时更新侧边栏标题）
- 所有模式的 `done` 事件数据结构必须一致
- 发生错误时必须发送 `error` 事件后关闭流，不得静默挂起

---

## 3. 移动端兼容性约束

| 约束项 | 规格 |
|--------|------|
| Android 网关 | 使用 `10.0.2.2:8000` 替代 `localhost` |
| iOS/Android URL | 必须通过 `getBaseURL()` 动态获取，禁止硬编码 |
| Capacitor 原生拦截 | 必须在 `capacitor.config.ts` 中禁用，让 WebView 原始 fetch 处理流 |
| Mixed Content | 强制开启 `androidScheme: 'http'`，允许 HTTP 明文传输 |
| 实时性 | 关闭流式缓冲，字符逐个到达，无肉眼可见延迟 |

---

## 4. 前端消费规范

- 使用 `useSSE` hook 统一处理所有 SSE 连接
- `thinking` 事件内容追加到思考面板（不进入正文）
- `content` 事件内容追加到消息气泡
- `done` 事件触发：关闭连接 + 更新侧边栏标题 + 保存 message_id
- `error` 事件触发：显示错误 Toast + 关闭连接

---

## 5. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| Android 模拟器发送消息 | 不出现 `Network Error`，思考内容实时跳出 | ❌ 未覆盖 |
| 网络中断后重连 | 前端显示错误提示，不挂起 | ❌ 未覆盖 |
| 长回答（>5000字） | 全程流式显示，不出现整段闪入 | ❌ 未覆盖 |
| `done` 事件后继续接收数据 | 忽略，不重复渲染 | ❌ 未覆盖 |
