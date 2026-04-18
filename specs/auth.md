# 规格：用户认证 (Authentication)

> 来源：`data-sys-docs/state-machines/auth.md` + `backend/routers/auth_router.py` 逆向
> 版本：v2.0

---

## 1. 认证机制

- **协议**：JWT 无状态认证
- **存储**：Token 存于前端（localStorage 或 Capacitor SecureStorage）
- **有效期**：7 天
- **刷新策略**：过期后需重新登录（无 Refresh Token 机制）

---

## 2. API Key 管理

用户可为每个 AI 供应商配置独立的 API Key：

| 供应商 | 标识 |
|--------|------|
| DeepSeek | `deepseek` |
| OpenAI | `openai` |
| Google Gemini | `gemini` |
| Anthropic Claude | `claude` |

**约束**：
- 同一用户同一 Provider 只能有一条记录（唯一约束：`user_id + provider`）
- API Key 返回给前端时必须掩码处理（如 `sk-***...***xyz`）
- API Key 用于 AI 模型调用，通过 `LLMFactory` 动态创建客户端

---

## 3. 多租户隔离

- 所有业务数据查询必须带 `user_id` 过滤
- `current_user` 通过 `Depends(get_current_user)` 注入到每个路由
- 禁止在任何接口中不校验用户身份直接返回数据

---

## 4. 完整状态机

见 `data-sys-docs/state-machines/auth.md`

---

## 5. 验收标准

| 场景 | 期望行为 | 测试文件 |
|------|---------|---------|
| 无 Token 访问受保护接口 | 返回 401 | ❌ 未覆盖 |
| Token 过期 | 返回 401，前端跳转登录页 | ❌ 未覆盖 |
| 配置 API Key 后 | 该 Provider 的模型可正常调用 | ❌ 未覆盖 |
| 查看 API Key | 只返回掩码版本，不暴露明文 | ❌ 未覆盖 |
