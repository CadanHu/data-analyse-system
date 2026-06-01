# RFC · OAuth Provider 选型(authlib vs 自研)

- Linear: DAT-46(Spike,parent DAT-36)
- 状态: **草案 → 待评审**
- 现状: `oauth_authorized_apps` 表只能 `_seed`,无真实授权流程。
- 目标: 确定 OAuth provider 实现方案,定端点 / token 存储 / 安全方案,供 DAT-47(endpoints)、DAT-48(注册 UI)实施。

---

## 1. 背景与定位

需求是让第三方应用通过 OAuth 2.0 拿到代表某用户的 access token,调用我们的 v2 API(如 `/api/v2/...`)。这是**我们做 provider(授权服务器)**,不是接入别人的登录。

优先级低(`DAT-36` 标 backlog,等有外部接入需求再做),但 RFC 先定型,避免将来仓促。

---

## 2. 候选

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. authlib** | 成熟、被广泛审计;PKCE / refresh 轮换 / introspection 现成;`authlib.integrations.starlette_client` + `AuthorizationServer` 与 FastAPI(Starlette)契合 | 引入依赖;需理解其 grant 抽象 |
| **B. FastAPI security 自研** | 无新依赖、可控 | 要自己实现 PKCE、code 交换、refresh 轮换、token 签名/校验、introspection——**安全敏感、易踩坑** |

---

## 3. 决策:采用 **authlib**

理由:OAuth 的安全细节(PKCE challenge 校验、code 一次性、refresh 轮换、定时常量比较防时序攻击)是「自研容易出安全漏洞」的典型领域。authlib 是 Python 生态事实标准、经过审计,用它的 `AuthorizationServer` + grant 类即可,我们只实现存储后端(用现有 DB)和 consent 页面。

---

## 4. 端点列表(交给 DAT-47)

| 端点 | 方法 | 说明 |
|---|---|---|
| `/oauth/authorize` | GET | 展示 consent 页;校验 client_id / redirect_uri / scope / PKCE `code_challenge`;用户同意后下发 authorization code |
| `/oauth/token` | POST | `grant_type=authorization_code`(带 `code_verifier`)换 access+refresh;`grant_type=refresh_token` 轮换 |
| `/oauth/introspect` | POST | 资源端校验 token(active / scope / exp);仅受信 client 或内部调用 |
| `/oauth/revoke` | POST | 主动吊销 token(可选,DAT-47 视情况) |

**强制 PKCE**(`S256`),不支持隐式授权(implicit)和明文 `plain` challenge。

---

## 5. Token 存储方案

复用 + 扩展现有表:
- `oauth_authorized_apps`(现有):存 client 注册信息——`client_id` / `client_secret_hash`(只存 hash)/ `redirect_uris` / `scopes` / `owner_user_id`。注册 UI 见 DAT-48,secret 仅创建时明文返回一次。
- **新增** `oauth_tokens`:`token_hash`(sha256,不存明文)/ `client_id` / `user_id` / `scopes` / `type`(access|refresh)/ `expires_at` / `revoked_at`。
- **新增** `oauth_auth_codes`:`code_hash` / `client_id` / `user_id` / `redirect_uri` / `code_challenge` / `scopes` / `expires_at`(短 TTL,如 60s)/ `consumed_at`(一次性)。

access token 用 JWT(自包含,资源端可本地校验,introspect 作兜底);refresh / auth code 用不透明随机串 + DB 查存。

---

## 6. 安全考虑

- **PKCE 强制** `S256`,`code_verifier` 比对失败拒绝。
- **scope 最小化**:定义粗粒度 scope(如 `read:metrics` / `read:boards` / `write:boards`),token 校验时在依赖项里检查。
- **refresh 轮换**:每次 refresh 旧 token 失效(检测重放 = 疑似泄露,吊销整条 token family)。
- **secret / token 全部存 hash**,日志不打印。
- **redirect_uri 精确匹配**注册值,不做前缀/通配。
- **auth code 一次性 + 短 TTL**,`consumed_at` 防重放。
- 复用现有 v2 audit middleware,授权 / 发 token / 吊销均落审计。

---

## 7. DoD

- [ ] 本 RFC 评审通过
- [ ] DAT-47 据此实现 3~4 个端点 + authlib 接线 + 2 张新表
- [ ] DAT-48 实现 AdminApiKeys 的 OAuth app 注册 UI
- [ ] 端到端可走通:注册 app → 用户授权 → 拿 token → 调 API → introspect/refresh
