# 规格：安全规范 (Security)

> 来源：`backend/utils/security.py` + `backend/services/python_executor.py` + `backend/config.py` 逆向
> 版本：v1.0

---

## 1. 认证安全

### JWT 配置
| 参数 | 当前值 | 风险 |
|------|--------|------|
| 算法 | HS256 | 低 |
| 有效期 | 365 天（`config.py`） | 中：Token 泄露后长期有效，无法主动吊销 |
| 刷新机制 | 无 Refresh Token | 中：过期前无法强制下线 |

**已知问题**：`config.py` 有硬编码的默认 `SECRET_KEY`（`09d25e...`）。生产部署**必须**通过环境变量覆盖，否则任何人可伪造 Token。

```bash
# 生成强密钥
openssl rand -hex 32
```

---

## 2. API Key 存储

用户 AI 供应商 API Key 存储于 MySQL `users` 表（或独立 `api_keys` 表）。

**当前实现**：
- 写入：明文存储（无 Fernet/AES 加密）
- 读取：返回前必须掩码处理，格式 `sk-***...***xyz`（后 4 位可见）
- 传输：仅通过 HTTPS + JWT 认证接口访问

**安全边界**：
- API Key 仅在服务端调用 LLM 时解密使用，不经过前端
- 每条记录有 `user_id` 绑定，禁止跨用户读取

**已知风险**：明文存储意味着数据库泄露 = API Key 全部泄露。未来应引入 `cryptography.Fernet` 加密存储。

---

## 3. Python 代码执行沙盒

AI Data Scientist 模式允许 AI 生成 Python 代码并在服务端执行。沙盒实现位于 `backend/services/python_executor.py`。

### 防护层级

| 层 | 机制 | 覆盖范围 |
|----|------|---------|
| L1 | AST 静态分析 | 在执行前解析代码树，阻断危险节点 |
| L2 | 模块白名单 | 只允许 `pandas/numpy/matplotlib/seaborn/sklearn/scipy/statsmodels/json/datetime` |
| L3 | 函数黑名单 | 禁止 `exec/eval/__import__/open/os/sys/subprocess` |
| L4 | 进程隔离 | 无（当前在主进程 `exec()` 中运行） |

### 已知绕过风险
- **无进程/容器隔离**：AST 审计被绕过则可执行任意代码（e.g. `getattr(builtins, 'ex'+'ec')(...)`）
- **无资源限制**：无 CPU/内存 quota，恶意代码可导致服务 OOM
- **无超时**：长循环可阻塞 worker

**建议**（未实施）：使用 `subprocess` + 独立进程 + `timeout` 参数替代内联 `exec`。

---

## 4. SQL 注入防护

所有数据库查询通过 SQLAlchemy 参数化执行，禁止字符串拼接 SQL。

**适用范围**：
- 内置 MySQL（business data）：✅ SQLAlchemy ORM/Core
- 用户连接的外部数据库：✅ `text()` + bindparams，但 SQL Agent 生成的查询由 LLM 构造，理论上存在提示注入后的 SQL 注入链路

**SQL Agent 边界约束**（见 `specs/sql-agent.md`）：
- 只允许 `SELECT`，禁止 `INSERT/UPDATE/DELETE/DROP`
- 单次查询结果行数上限 1000 行
- 执行超时 `MAX_SQL_EXECUTION_TIME`（默认 30 秒）

---

## 5. 多租户数据隔离

| 规则 | 实现位置 |
|------|---------|
| 所有路由必须注入 `current_user` | `Depends(get_current_user)` |
| 查询必须带 `user_id` 过滤 | 各 Router 逻辑层 |
| 会话/消息禁止跨用户访问 | `session_router.py` |
| 知识库文档按 `session_id` 隔离 | `rag_router.py` |

---

## 6. 传输安全

| 场景 | 要求 |
|------|------|
| 生产环境 | 必须启用 HTTPS（Nginx TLS 终止） |
| Docker 本地开发 | HTTP 可接受 |
| API Key 传输 | 仅通过认证接口，不出现在 URL 参数中 |
| SSE 流 | 与普通 HTTP 同信道，依赖 HTTPS 加密 |

---

## 7. 威胁模型（简版）

| 威胁 | 可能性 | 影响 | 现有缓解 |
|------|--------|------|---------|
| JWT 伪造（默认 SECRET_KEY） | 高（若未修改） | 严重 | 文档要求必须覆盖 |
| API Key 数据库泄露 | 低 | 高 | 明文存储，无额外缓解 |
| Python 沙盒逃逸 | 低（需绕过 AST） | 严重 | AST 审计（非完整隔离） |
| SQL 注入（via LLM 生成 SQL） | 低 | 中 | SELECT-only 限制 |
| 跨用户数据访问 | 低 | 高 | user_id 过滤 |
| 外部数据库凭证泄露 | 中 | 高 | 凭证存 DB，无加密 |

---

## 8. 验收标准

| 场景 | 期望行为 |
|------|---------|
| 生产部署时未设置 SECRET_KEY | 启动日志告警，建议生成强密钥 |
| API Key 读取接口 | 只返回掩码版本，数据库明文不出现在响应中 |
| Python 沙盒：尝试 `import os` | 执行被拒绝，返回错误信息 |
| Python 沙盒：尝试 `__import__('os')` | 执行被拒绝（AST 检测到危险调用） |
| SQL Agent：执行 DROP TABLE | 被拦截，返回"只允许 SELECT"错误 |
| 无 Token 访问任意受保护接口 | 返回 401 |
