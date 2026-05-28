# v2 路线图 · 进度与待办

**作者**：CadanHu + Claude
**最近更新**：2026-05-26（commit `35ff7e7d` 之后）
**用途**：未来回来继续推进时的索引文档。先看这份，再决定下一步做什么。

---

## 1. 一句话状态

`feature/v2-preview` 分支 **16 个 commit**，**v2 schema 36/36 表全部落地**（独立物理库 `data_pulse_v2`），后端 **130+ API**，设计稿 **21/21 个画板**前端都接通了真实数据。**8 个实施阶段 100% 完成**。下一步主要是「**画板之间串联**」+ 几个独立横向工程。

旧 `/app` 完全不动，新设计走 `/v2-preview/*`，开关由 `VITE_ENABLE_V2_PREVIEW` 控制。

---

## 2. 已完成清单（按 commit）

| commit | 阶段 | 内容 |
|---|---|---|
| `c94e01ea` | 阶段 0 | 把 v2-preview 路由 + V2Preview 索引页骨架接入 |
| `a984efc5` | 阶段 0 | 批量移植 22 个设计画板（静态预览） |
| `dba5cc23` | step 1+2 | CanvasA 接旧 sessionStore（试水阶段） |
| `a05bc38e` | **阶段 1** | v2 库基础设施 + 用户扩展 5 表 + 工作区 2 表 + schema 设计文档 |
| `25e647a1` | **阶段 2** | 画布核心 5 表（v2_sessions / v2_messages / canvas_nodes / node_comments / node_mentions）+ CanvasA 切到 v2 + SSE ask |
| `3c142723` | **阶段 3** 前半 | 看板 4 表 + 钉看板 API + CanvasA 接钉 |
| `3454ee7f` | A 档 | 6 角色 UI 个性化（topbar/dock/chips/头像） |
| `3a5415af` | C 档 | 角色权限隔离 require_role + 索引页按 role 过滤 + 403 兜底 |
| `f4774aed` | B 档 | RoleViews 3 画板移植 + 索引页角色默认视图推荐 |
| `0f442685` | 阶段 3 后半 | BoardEditor 顶部 LiveBar 连接真实 widgets |
| `59c431ad` | 短期 3 件 | EChartsRenderer 接 canvas + 分支真落库 + Settings Profile/Notify 接 API |
| `1daa6fbb` | **阶段 4** | 分享 2 表 + 通知 1 表 + ShareDialog/NotificationCenter |
| `8eb16e76` | **阶段 5** | 告警 3 表 + AlertWizard/Detail |
| `69686e84` | **阶段 6** | 管理后台 8 表（audit + billing + model routes/keys）+ 4 个 Admin LiveBar |
| `831bf0e3` | **阶段 7** | 安全设置（2FA + login_sessions + oauth_apps）+ SettingsSecurity |
| `1cf694fd` | 综合 | 节点详情 service + audit middleware + TOTP 真接入 + **阶段 8 MVP** 语义层 6 表 |
| `212c00f6` | 收尾 | NodeDetail + DataLayer 6 画板移植 + 接入阶段 8 API |
| `35ff7e7d` | 横向 | apscheduler 告警 cron worker + _eval_now + CRUD 同步 scheduler |

详见 commit log（`git log --oneline feature/v2-preview ^main`）。

---

## 3. 表/路由完整盘点

详见 [`v2-schema.md`](./v2-schema.md) 的 §5 / §6 / §9。本节给"现在哪些**真能用**"的速查：

| 模块 | 表 | service | 路由 | 前端 LiveBar |
|---|---|---|---|---|
| 用户扩展 | 5 | profile + prefs（2FA/sessions/oauth_apps 在阶段 7 补） | ✅ 12 个 | SettingsSecurity ✅ |
| 工作区 | 2 | ✅ | ✅ 5 个 | TeamWorkspace 仅有 demo（**未接**） |
| 画布 | 5 | ✅ + node CRUD | ✅ 15 个 | CanvasA ✅ / NodeDetail ✅ |
| 看板 | 4 | ✅ | ✅ 10 个 | BoardEditor ✅ |
| 分享 | 2 | ✅ | ✅ 7 个 | ShareDialog ✅ |
| 通知 | 1 | ✅ | ✅ 5 个 | NotificationCenter ✅ |
| 告警 | 3 | ✅ + cron worker | ✅ 13 个 + _eval_now | AlertWizard/Detail ✅ |
| 审计 | 1 | ✅ + auto middleware | ✅ 3 个 | AdminAudit ✅ |
| 计费 | 4 | ✅ | ✅ 9 个 | AdminBilling ✅ |
| 模型路由 | 3 | ✅ | ✅ 8 个 | AdminModels / AdminApiKeys ✅ |
| 语义层 | 6 | ✅（DSL 解析未做） | ✅ 22 个 | DataSources / SchemaSemantic / MetricCenter ✅ |

---

## 4. 未完成工作清单

### 4.1 画板串联（**最高优先级 · 最直接的下一步**）

完整方案见本文档底部 §6。短版：

| 波次 | 工程量 | 价值 | 内容 |
|---|---|---|---|
| 第一波 | 半天 | 高 | URL 协议（query 接收 session/node/board/event 等 id）+ NotificationCenter 通知点击跳转 + CanvasA NodeCard "查看详情" + 钉看板后 toast 加 "打开看板" |
| 第二波 | 半天 | 中 | 全局 V2Context（workspace / profile / 通知未读数）+ 各 LiveBar 加 "下一步去哪" 按钮（5-6 个跳转点） |
| 第三波 | 半-1 天 | 中 | 常驻顶部 toolbar（会话切换 + 🔔 bell + ⌘K 占位 + 头像） |
| 第四波 | 1 天 | 中 | 索引页加 4 条主流程视图（PathMap） |
| 第五波 | 1-2 天 | 低 | 全局搜索（后端 /api/v2/_search 聚合接口 + 前端 cmdk） |

### 4.2 剩余横向工程

| 项 | 工程量 | 价值 | 说明 |
|---|---|---|---|
| **告警去重窗口** | 1 小时 | 高 | 现在 `* * * * *` 每分钟连发同一事件会刷屏；加"上次 fired_at 在 X 分钟内不再触发" |
| **scheduler 跨进程持久化** | 半天 | 中 | 用 `SQLAlchemyJobStore` 把 jobs 落表；现在 backend 重启时从 alert_rules 重建够用，多实例部署才必需 |
| **计费月度结算 worker** | 半天 | 中 | 每月 1 号 cron 跑：`usage_counters` 滚动 + 自动生成 `invoices`（draft 状态）|
| **metric DSL 解析** | 大 · 1 周+ | 高 | 让 `metric.expression` 真能跑出数；这是阶段 8 当初被推迟的根本原因，需要先定 DSL（SQL fragment / jq / YAML？）|
| **AI 同义词向量化** | 中 · 2-3 天 | 中 | 用 embedding 替代当前的子串匹配；接现有 `embedding_service` |
| **OAuth provider 真集成** | 大 | 低 | 当前 `oauth_authorized_apps` 只能 `_seed`；真做需要 oauth2-provider 库（authlib）|
| **Stripe / 微信支付** | 大 | 中 | 当前 `invoices.status` 是本地状态机；真做要接 webhook |

### 4.3 已知小缺陷（不阻塞但应顺手修）

| 现象 | 原因 | 修法 |
|---|---|---|
| audit middleware 写出 `action=create_create` | `_PATH_RULES` 里 action 已经是 `create`，又被 method 前缀 `create_` 加了一次 | 在 `v2_audit.py:_async_write_audit` 里加条件：method=POST 且 action 已含动词时不再加前缀 |
| `AdminAudit` LiveBar 看不到 middleware 写的 platform-level 日志 | 默认查时传了 workspace_id，但 middleware 写的 workspace_id 是 null | 给 AuditLiveBar 加"全部/本工作区"开关；或让 middleware 尝试从 body/path 提取 workspace_id |
| 告警 cron 每分钟连发同一规则 | 见 §4.2 去重窗口 | 同上 |
| `_search` 路径冲突已修一次 | FastAPI 路由按声明顺序匹配 `/{metric_id}` 会吃掉 `_search` | 已改用 `/semantic/search-metrics`；如果以后加 `_xxx` 子路径要避开同样的坑 |
| TeamWorkspace 静态画板仍未接 API | 没有专属 LiveBar | 后端 workspace member 增删改 API 都有，只缺前端浮动条；属于阶段 1 收尾 |
| 旧 sql_agent.py 在 process_question_with_history 用了未 import 的 DatabaseManager | 阶段 2 时已补一行 import 临时修复 | 旧代码自身的 bug，根因是 SchemaService._current_db_key 默认 None；长期应给 SchemaService 加 fallback |

### 4.4 还没接真实数据的画板（其实只剩一个）

- **TeamWorkspace** — 静态预览。后端 workspace member 接口已存在，只差前端 LiveBar。半小时工作量。

---

## 5. 怎么继续（环境/账号/启动）

### 5.1 启动

```bash
# 后端 (FastAPI + MySQL + 阶段 9 apscheduler 一起跑)
bash /Users/huyitao/data-analyse-system/start_backend.sh
# 注意：脚本本身没执行权限，得用 bash 调

# 前端
cd /Users/huyitao/data-analyse-system/frontend && npm run dev
# 浏览器: http://localhost:5173/v2-preview
```

### 5.2 关键开关

| 文件 | 变量 | 默认 |
|---|---|---|
| `frontend/.env.development` | `VITE_ENABLE_V2_PREVIEW=true` | 开 |
| `frontend/.env.production` | （未设） | 关 — 生产暂不暴露 |
| `backend/.env` | `MYSQL_V2_DATABASE=data_pulse_v2` | 独立物理库 |

### 5.3 测试账号

| user_id | email | v2 user_profiles.role |
|---|---|---|
| 2 | pelang666@outlook.com | **admin**（多次 smoke test 设为 admin） |
| 3 | 1156423101@qq.com | 无 profile（兜底当 ops） |
| 4 | demo@example.com | 之前 smoke test 一度设过 ops |

生成 M2M token 做 smoke test：

```bash
/Users/huyitao/data-analyse-system/backend/venv312/bin/python3 -W ignore -c "
import asyncio, sys; sys.path.insert(0, '/Users/huyitao/data-analyse-system/backend')
async def m():
  from database.user_db import user_db
  r = await user_db.create_api_token(user_id=2, name='ad-hoc', scopes='full', expires_days=1)
  print(r['token'])
asyncio.run(m())
"
```

### 5.4 关键文档

- [`v2-schema.md`](./v2-schema.md) — 36 张表完整 schema 设计 + 关键决策 + ER 图
- 这份 `v2-roadmap.md` — 进度索引 + 待办

### 5.5 v2 API 速查

所有路由前缀 `/api/v2`：

| 域 | 路径前缀 |
|---|---|
| 用户扩展 | `/workspaces/*` `/me/profile` `/me/notification-prefs` `/me/security/*` |
| 画布 | `/sessions/*` `/sessions/{id}/ask` `/sessions/{id}/canvas-nodes` `/nodes/{id}/*` |
| 看板 | `/boards/*` `/board-templates` |
| 分享 | `/share-links/*` `/share-grants/*` `/share-links/_lookup/{token}`（公开） |
| 通知 | `/notifications/*` |
| 告警 | `/alert-rules/*` `/alert-events/*` `/me/alert-subscriptions` |
| 管理后台 | `/admin/*`（全部 `Depends(require_role('admin'))`） |
| 语义层 | `/semantic/*` `/semantic/search-metrics` |

完整 OpenAPI：`http://localhost:8000/docs`，按 tag `v2` 过滤。

---

## 6. 画板串联方案（保留细节，下次直接照做）

### 6.1 4 条业务主流程

```
A · 分析 → 钉看板 → 分享
  CanvasA 提问 ──→ 节点上 "钉看板" ──→ BoardEditor 调整 ──→ ShareDialog 生成链接 ──→ 预览

B · 告警 → 排查 → 解决
  NotificationCenter alert ──→ AlertDetail ──→ 看 attribution ──→ 跳 canvas 排查 ──→ 回 AlertDetail resolve

C · 字段语义 → 指标 → 提问
  SchemaSemantic 打标 ──→ MetricCenter 用此字段建指标 ──→ 加同义词 ──→ canvas 问"X 是多少"命中

D · 协作 → 评论 → 提及
  TeamWorkspace 邀请 ──→ canvas 节点 @某人 ──→ 对方 NotificationCenter 看到 mention ──→ 跳回原节点
```

### 6.2 URL 协议（约定）

每个画板 LiveBar 顶部加 `useSearchParams()`，按下表初始化：

```
/v2-preview/canvas?session={id}&node={node_id}
/v2-preview/node/detail?id={node_id}
/v2-preview/board-editor?board={id}
/v2-preview/alert-detail?event={event_id}
/v2-preview/share?target_type={session|board|node}&target_id={id}
/v2-preview/data/metrics?metric={id}
/v2-preview/data/metrics?expr_seed={column_name}  ← 从字段打标过来时预填表达式
/v2-preview/canvas?seed_q={text}                  ← 从指标"用它问一句"过来时预填 dock 输入框
```

### 6.3 各 LiveBar 加的跳转按钮

| 当前画板 | 加按钮 | 跳哪 |
|---|---|---|
| NotificationCenter 每条通知 → | 按 source_type | alert_event → `/alert-detail?event=X`；mention → `/node/detail?id=X`；share → `/share-preview?token=X` |
| CanvasA NodeCard | "查看详情 →" | `/node/detail?id=节点id` |
| CanvasA handlePin 成功后 | toast 加链接 | `/board-editor?board=刚钉的板id` |
| BoardEditor 每个 widget | "看源节点 →" | `/canvas?session=Y&node=widget.source_node_id` |
| AlertDetail 每条事件 | "看源数据 →" | `/canvas?session=Y&node=widget.source_node_id`（事件 → 规则.widget_id → board_widget.source_node_id） |
| ShareDialog 生成链接后 | "预览 →" | 新 tab `/shared/{token}` |
| SchemaSemantic 打标后 | "用此字段建指标 →" | `/data/metrics?expr_seed=column_name` |
| MetricCenter 创建后 | "用它问一句 →" | `/canvas?seed_q={metric.name}` |

### 6.4 全局 V2Context（去重 + 通知 badge）

```tsx
// V2Preview.tsx 外面包一层
<V2GlobalProvider>
  <Routes>...</Routes>
</V2GlobalProvider>

// hook
const { workspace, profile, unreadCount, refresh } = useV2Ctx()
```

Provider 内部：
- mount 时一次性拉 `getCurrentWorkspace` + `getMyProfile`
- 30s 轮询 `countUnreadNotifications`
- 暴露 `refresh()` 给手动触发

各 LiveBar 把 `const [workspace, setWorkspace] = useState(null); useEffect(() => v2Api.getCurrentWorkspace().then(setWorkspace), [])` 这种重复样板**全部删掉**，改 `const { workspace } = useV2Ctx()`。

### 6.5 顶部常驻 toolbar

```
[DataPulse]  [当前会话标题▾]    ┊  [⌘K 搜索]  [🔔 3]  [→ 分享]  [👤 高]
```

- 会话切换器：左侧下拉切 v2_sessions，切了之后 canvas 跟随
- 🔔 通知 bell：未读数 badge，点击下拉显示最近 5 条；点其中一条 → 走 §6.3 通知跳转
- ⌘K 占位（第五波再做）
- 角色头像：复用 CanvasA 顶栏的 RoleSwitcher

### 6.6 索引页流程地图（第四波）

平铺 22 个卡片**之上**，加一个 hero 区域，画出 4 条主流程：

```
┌─ 流程 A · 分析 → 看板 → 分享 ────────────────────────────────┐
│  [CanvasA] ──→ [钉看板] ──→ [BoardEditor] ──→ [ShareDialog]  │
│   ↓ 点开始     ↓↑ 自动     ↓ 调整           ↓ 生成链接       │
└──────────────────────────────────────────────────────────────┘
```

每个方框点击 → 进对应画板（带正确 query 上下文）。给每步标"当前是否可用"（没有 v2 session 时整条流程 A 灰色）。

---

## 7. 后端启动时该看的几行 log（健康度速查）

正常 backend 启动应该看到：

```
✅ 会话数据库初始化完成: data_pulse_sessions      ← 旧库
✅ PostgreSQL 知识库初始化完成: knowledge_base
✅ 数据源表初始化完成
✅ v2 数据库初始化完成: data_pulse_v2             ← 新库 36 表
✅ v2 board_templates 灌入 6 条内置模板          ← 仅空表时
✅ 数据库初始化完成
✅ alert worker 启动，注册 N 条规则 (共 M 条)    ← cron worker
```

如果 ❌ alert worker 行没出现 → apscheduler 没装上或者 `start_worker()` 异常被吞。

---

## 8. 下次开工建议

按价值密度排：

1. **告警去重窗口**（1 小时，立刻让 cron 可用）
2. **画板串联第一波**（半天，URL 协议 + 通知跳转 + canvas → node 详情按钮）
3. **TeamWorkspace 接入**（半小时，补最后一个未接真实数据的画板）
4. **画板串联第二波**（V2Context 整合）
5. **计费月度结算 worker**（半天，让账单页有真数据）

后面的（DSL / Stripe / OAuth）都是单独立项工程。

---

**结束。** 下次回来从这文档第 4 节挑一项开始即可。

---

## 9. 工具决策 · 项目管理三件套

| 平台 | 用来做什么 | 不用来做什么 |
|---|---|---|
| **Linear** (主真源) | 故事(DAT-25 ~ 49) / Cycle (Sprint) / Story Points / Milestone / 燃尽图 / 依赖关系 / 优先级 / 标签 | 不存代码、不审查 PR |
| **GitHub Issues + Projects v2** | 关联 PR / commit 自动 link / CI 视图 / repo 内可见的 issue tracker(对外公开备份) | **不配 Insights Chart**(API 不暴露,手动 9 步成本高;Linear 已 0 点击给出) |
| **GitHub Project Sprint 字段** | 与 Linear Cycle **双向手动同步**(命名一致即可,数据不自动)。一次配好后两边都能看 Sprint 1/2/3 | 不作为唯一真源 |

### 决策记录

**2026-05-27 · 燃尽图走 Linear,不在 GitHub 上做**

GitHub Projects v2 Charts 只支持手动 UI 操作,GraphQL API 没暴露 chart 配置。可选项:
- ✅ **Linear Cycles 内建 Burndown/Burnup**(0 配置,自动收集 story points,数据从 Cycle 创建开始)
- ❌ ZenHub for GitHub:三方依赖,免费档够用但引入三套真理源,维护成本翻倍
- ❌ 自己写 gh + 脚本输出 SVG:复刻 Linear 已免费提供的功能,工程量不值得

**结论**:燃尽图 / Velocity / Roadmap 时间轴 / Cycle 进度统一看 Linear;GitHub 只用作 PR 关联 + 公开 issue 备份。
