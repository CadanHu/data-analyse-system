# 规格：API 接口规范 (API Spec)

> 版本：v2.0
> Base URL：`/api`
> 认证：所有接口（除 `/send-code`、`/register`、`/login`）需携带 `Authorization: Bearer <token>`

---

## 通用错误码

| HTTP 状态码 | 含义 | 常见场景 |
|------------|------|---------|
| `400` | 请求参数错误 | 验证码错误/过期、用户名重复 |
| `401` | 未认证或认证失败 | Token 缺失/过期/签名错误、密码错误 |
| `404` | 资源不存在 | 会话/用户/Token 不存在 |
| `422` | 参数格式校验失败 | Pydantic 字段类型不匹配 |
| `500` | 服务端内部错误 | DB 操作失败、邮件发送失败 |

**错误响应体（JSON）**：
```json
{ "detail": "错误描述文字" }
```

---

## 1. 认证（Auth）

### `POST /send-code` — 发送邮箱验证码

**请求体**：
```json
{ "email": "user@example.com" }
```
**响应 200**：
```json
{ "success": true, "message": "验证码已发送" }
```

---

### `POST /register` — 用户注册

**请求体**：
```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "password123",
  "verification_code": "123456"
}
```
**响应 200**：
```json
{
  "id": 1,
  "username": "alice",
  "email": "alice@example.com",
  "created_at": "2026-04-18T10:00:00"
}
```
**错误**：`400` 验证码错误/过期、用户名/邮箱重复

---

### `POST /login` — 用户登录

**请求体**：
```json
{ "username": "alice@example.com", "password": "password123" }
```
> `username` 字段实际传入邮箱（OAuth2PasswordRequestForm 兼容）

**响应 200**：
```json
{ "access_token": "eyJ...", "token_type": "bearer" }
```
**错误**：`404` 邮箱未注册、`401` 密码错误

---

### `GET /users/me` — 获取当前用户信息

**响应 200**：
```json
{ "id": 1, "username": "alice", "email": "alice@example.com" }
```

---

## 2. 会话（Sessions）

### `POST /sessions` — 创建会话

**请求体**（可选，支持额外字段）：
```json
{
  "title": "",
  "database_key": "business",
  "model_provider": "deepseek",
  "model_name": "deepseek-chat"
}
```
**响应 201**：
```json
{ "id": "sess-uuid-xxx", "title": "", "created_at": "..." }
```

---

### `GET /sessions` — 获取会话列表

**响应 200**：
```json
[
  {
    "id": "sess-uuid-xxx",
    "title": "用户数量分析",
    "database_key": "business",
    "enable_thinking": false,
    "enable_rag": false,
    "enable_data_science_agent": false,
    "model_provider": "deepseek",
    "model_name": null,
    "created_at": "2026-04-18T10:00:00",
    "updated_at": "2026-04-18T10:05:00"
  }
]
```

---

### `GET /sessions/{session_id}` — 获取单个会话

**响应 200**：同上单条。**错误**：`404`

---

### `DELETE /sessions/{session_id}` — 删除会话

**响应 200**：`{ "success": true }`。**错误**：`404`

---

### `PATCH /sessions/{session_id}` — 更新标题

**请求体**：`{ "title": "新标题" }`
**响应 200**：`{ "success": true }`。**错误**：`404`

---

### `PATCH /sessions/{session_id}/modes` — 更新模式开关

**请求体**：
```json
{
  "enable_thinking": false,
  "enable_rag": true,
  "enable_data_science_agent": false,
  "model_provider": "gemini",
  "model_name": "gemini-2.0-flash"
}
```
**响应 200**：`{ "success": true }`。**错误**：`404`

---

### `GET /sessions/{session_id}/messages` — 获取消息列表

**Query 参数**：`?all=false`（默认只返回当前活跃分支）

**响应 200**：
```json
[
  {
    "id": "msg-uuid-xxx",
    "role": "user",
    "content": "有多少用户？",
    "sql": null,
    "chart_cfg": null,
    "thinking": null,
    "data": null,
    "is_current": 1,
    "feedback": 0,
    "created_at": "2026-04-18T10:01:00"
  }
]
```

---

### `GET /sessions/{session_id}/export` — 导出会话

**Query 参数**：`?format=pdf` 或 `?format=html`
**响应**：文件下载（`application/pdf` 或 `text/html`）。**错误**：`400` 不支持的格式、`404` 无消息

---

## 3. 对话（Chat）

### `POST /chat/stream` — 流式对话（核心接口）

**请求体**：
```json
{
  "session_id": "sess-uuid-xxx",
  "question": "有多少用户？",
  "parent_id": null,
  "enable_thinking": false,
  "enable_rag": false,
  "rag_scope": "session",
  "enable_data_science_agent": false,
  "enable_depth": false,
  "no_database": false,
  "model_provider": "deepseek",
  "model_name": null,
  "language": "zh"
}
```
**响应 200**：`text/event-stream`，每行格式：
```
data: {"event": "<type>", "data": {...}}\n\n
```
事件类型详见 [sse-protocol.md](./sse-protocol.md)

---

### `POST /chat/once` — 无状态单次调用

> 无需预创建会话，系统自动创建临时会话。

**请求体**：
```json
{
  "question": "有多少用户？",
  "database_key": "business",
  "model_provider": null,
  "language": "zh"
}
```
**响应 200**：同 `/chat/stream`，响应 Header 携带 `X-Session-Id`

---

### `POST /chat/generate_report` — 生成 AI 分析报告

**请求体**：
```json
{
  "message_id": "msg-uuid-xxx",
  "content": "消息正文内容",
  "session_id": "sess-uuid-xxx"
}
```
**响应 200**：`{ "status": "processing", "message_id": "msg-uuid-xxx" }`
> 前端通过轮询消息的 `data.report_status` 追踪进度

---

## 4. 数据库（Database）

### `GET /databases` — 当前可用数据库列表

**响应 200**：
```json
[{ "key": "business", "name": "业务库", "type": "mysql" }]
```

### `POST /database/switch` — 切换当前会话数据库

**请求体**：`{ "database_key": "business", "session_id": "sess-xxx" }`
**响应 200**：`{ "success": true }`

### `POST /databases/test` — 测试数据库连接

**请求体**：
```json
{
  "host": "localhost", "port": 3306,
  "database": "mydb", "username": "root", "password": "..."
}
```
**响应 200**：`{ "success": true }` 或 `{ "success": false, "error": "连接超时" }`

---

## 5. RAG 知识库

| 方法 | 路径 | 请求体 / 参数 | 响应 |
|------|------|-------------|------|
| GET | `/rag/chunks` | `?session_id=&page=1&size=20` | chunk 列表 |
| GET | `/rag/docs` | `?session_id=` | 文档列表 |
| POST | `/rag/deduplicate` | `{ "session_id": "..." }` | `{ "removed": 3 }` |
| POST | `/rag/chunk/delete` | `{ "chunk_id": "..." }` | `{ "success": true }` |
| POST | `/rag/doc/delete` | `{ "doc_id": "..." }` | `{ "success": true }` |

---

## 6. 文件上传

### `POST /upload/knowledge` — 上传文档并触发知识抽取

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | File | 上传文件（PDF/DOCX/TXT 等） |
| `session_id` | str | 关联的会话 ID |
| `engine` | str | `standard` / `deep` / `high_precision` |
| `prompt` | str? | 自定义抽取提示词 |

**响应 200**：
```json
{ "status": "processing", "session_id": "sess-xxx" }
```

### `GET /upload/knowledge/status/{session_id}` — 查询抽取进度

**响应 200**：
```json
{
  "status": "done",
  "chunks_created": 42,
  "error": null
}
```

---

## 7. API Key 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api-keys` | 获取当前用户所有 API Key（掩码） |
| POST | `/api-keys` | 保存/更新 API Key |
| DELETE | `/api-keys/{provider}` | 删除指定供应商的 Key |

**保存请求体**：
```json
{
  "provider": "deepseek",
  "api_key": "sk-xxxxx",
  "base_url": null,
  "model_name": "deepseek-chat"
}
```
**获取响应**（掩码）：
```json
[{
  "provider": "deepseek",
  "api_key": "sk-***...***chat",
  "model_name": "deepseek-chat"
}]
```
