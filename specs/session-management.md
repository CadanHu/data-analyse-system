# 规格：会话管理 (Session Management)

> 来源：`backend/routers/session_router.py` + `data-sys-docs/state-machines/session.md` 整合
> 版本：v2.0

---

## 1. API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/sessions` | 创建会话（201） |
| GET | `/sessions` | 获取用户所有会话列表 |
| GET | `/sessions/{id}` | 获取单个会话详情 |
| DELETE | `/sessions/{id}` | 删除会话 |
| PATCH | `/sessions/{id}` | 更新标题 |
| PATCH | `/sessions/{id}/modes` | 更新模式开关 |
| POST | `/sessions/{id}/database` | 切换关联数据库 |
| GET | `/sessions/{id}/messages` | 获取消息列表 |
| POST | `/sessions/{id}/activate_branch` | 激活消息分支 |
| GET | `/sessions/{id}/export` | 导出会话（PDF/HTML） |

---

## 2. 会话创建规格

- 创建时 `title` 为空（由首条消息后 AI 自动命名）
- `SessionCreate` 模型配置 `extra = "allow"`（允许前端携带额外字段，防止版本差异 422 错误）
- 创建后立即关联当前用户的默认数据库

---

## 3. 自动命名规格

**触发时机**：发送第一条消息后，异步执行（`_handle_session_auto_title`）

**约束**：
- 仅当 `sessions.title` 为空时触发
- 标题生成使用 Provider 的**默认标准模型**，强制 `model_name=None`（不继承会话的模型设置）
- 生成完成后通过 `done` SSE 事件中的 `session_title` 字段通知前端实时更新

---

## 4. 消息分支规格

- 每条消息有 `parent_id` 字段，支持树形对话结构
- `is_current = 1` 表示当前活跃分支，`0` 表示已切换的历史分支
- `POST /sessions/{id}/activate_branch` 切换分支：将目标分支及其祖先设为 `is_current = 1`，其他分支设为 `0`
- 消息列表默认只返回 `is_current = 1` 的消息（`all=false`），加 `?all=true` 返回全部

---

## 5. 导出规格

**PDF 导出**（`?format=pdf`）：
- 使用 Playwright 同步渲染
- 必须包含：完整对话、执行的代码、图表、深度洞察总结
- 图表以截图形式嵌入，不依赖 JavaScript 运行

**HTML 导出**：
- 生成独立可渲染的 HTML 文件
- 内嵌所有样式和图表数据，无外部依赖

---

## 6. 状态机

完整状态转换见 `data-sys-docs/state-machines/session.md`

摘要：
```
[created] → [active] → [archived]
                    ↘ [deleted]
```

---

## 7. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| 会话 CRUD 接口可用 | 创建、读取、删除会话正常响应 | `test_api.py::test_session_api` |
| 新建会话发第一条消息 | 会话标题自动生成并实时更新到侧边栏 | ❌ 未覆盖 |
| 切换消息分支 | 历史分支消息隐藏，新分支消息展示 | ❌ 未覆盖 |
| 导出 PDF | 包含图表截图，文件可正常打开 | ❌ 未覆盖 |
| 刷新页面 | 模式开关状态（思考/RAG/科学家）正确恢复 | ❌ 未覆盖 |
