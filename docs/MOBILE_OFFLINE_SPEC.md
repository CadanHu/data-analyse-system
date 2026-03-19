# DataPulse 移动端离线架构规格说明

> **最后更新**: 2026-03-19
> **当前主力分支**: `feature/offline-local-sync`
> **状态**: 开发中，核心功能完整可用

---

## 一、总体设计理念

手机端采用 **离线优先（Offline-First）** 架构，核心原则：

1. **不依赖电脑后端即可使用**：AI 直连云端 Provider，数据存本地 SQLite
2. **有网时无感同步**：后台自动 Pull+Push，用户无需手动操作
3. **数据不丢失**：所有本地操作标记 dirty flag，联网后自动上传
4. **电脑后端仍可选用**：在线时走服务器路由，享受 RAG/数据科学 Agent 等高级功能

```
┌─────────────────────────────────────────────────┐
│                  手机 App (Capacitor)             │
│                                                   │
│  本地 SQLite ←→ directAiService → AI Provider    │
│       ↕ (有网时)                                  │
│  syncService ←→ 电脑后端 (FastAPI + MySQL)        │
└─────────────────────────────────────────────────┘
```

---

## 二、核心模块与文件

### 2.1 本地数据层

| 文件 | 职责 |
|------|------|
| `frontend/src/services/db.ts` | SQLite DDL + 所有 CRUD 函数，基于 `@capacitor-community/sqlite ^6.0.0` |
| `frontend/src/services/localStore.ts` | 平台分发层：Native→SQLite，Web→内存 Map |
| `frontend/src/services/localAuthService.ts` | 本地账号注册/登录（bcryptjs 哈希），生成伪 JWT |
| `frontend/src/services/businessDataSync.ts` | 从后端分页下载业务库数据，写入 SQLite `biz_{key}__{table}` 前缀表 |
| `frontend/src/services/syncService.ts` | 双向同步引擎：Ping → Pull → Merge → Push，LWW（最后写者胜）策略 |
| `frontend/src/services/sqlDialectConverter.ts` | MySQL → SQLite SQL 方言转换（29 条规则） |
| `frontend/src/services/directAiService.ts` | 离线时直连 OpenAI/DeepSeek/Claude/Gemini，SSE 流式输出 |
| `frontend/src/services/fileCache.ts` | PDF/图片/ECharts JS 本地缓存，透明 URL 替换 |

### 2.2 状态管理

| Store / Hook | 职责 |
|------|------|
| `authStore.ts` | `user`, `token`, `offlineMode`, `localUserId`，含 `initOffline()` / `migrateUserId()` |
| `syncStore.ts` | `connectionStatus: 'offline' \| 'online' \| 'checking'`, `isSyncing`, `lastSyncAt`, `syncError` |
| `useSyncManager.ts` | 每 60s Ping，页面可见性变化触发同步，写入后 300ms 防抖 Push |

### 2.3 UI 组件

| 组件 | 职责 |
|------|------|
| `SyncStatusBadge.tsx` | 四态徽章：检查中 / 离线·直连(琥珀) / 同步中(蓝转) / 已同步(绿√) |
| `BizSyncModal.tsx` | 业务数据库同步面板（下载进度、表选择） |
| `StorageModal.tsx` | 本地存储管理：查看各表行数、清除业务缓存 |
| `ModelKeyModal.tsx` | 模型选择 + API Key 配置（含"测试 Key"验证按钮） |
| `InputBar.tsx` | 离线时显示"离线模式·AI直连"横幅 |
| `SessionList.tsx` | CRUD 路由：离线→本地 SQLite，在线→后端 API；Native 先加载本地数据再更新 |

### 2.4 后端（电脑服务器，可选）

| 文件 | 职责 |
|------|------|
| `backend/routers/sync_router.py` | `GET /sync/ping`, `GET /sync/pull?since=`, `POST /sync/push` |
| `backend/routers/business_sync_router.py` | `GET /api/biz-sync/databases`, `/schema/{key}`, `/data/{key}/{table}?page=` |
| `backend/routers/api_key_router.py` | `GET/POST/DELETE /api/api-keys`，服务端 API Key 管理 |
| `backend/session_db.py` | `upsert_session/message/api_key`，`get_*_since(ts)` 增量查询 |

---

## 三、SQLite 本地数据库 Schema

数据库名：`datapulse_local`（`DB_NAME` in db.ts）

```sql
sessions          -- 对话会话，含 _sync_dirty / _deleted 标志
messages          -- 聊天消息，含 thinking / sql / chart_cfg / data 字段
users             -- 用户信息缓存（从服务器同步）
user_api_keys     -- API Key（按 user_id + provider 唯一）
local_accounts    -- 本地账号（password_hash bcrypt），支持离线注册
knowledge_entities    -- RAG 知识图谱实体（表已建，离线提取待实现）
knowledge_relationships -- RAG 知识图谱关系
biz_sync_meta     -- 业务库同步元数据（db_key, table_name, synced_at, row_count）
biz_{key}__{table}    -- 动态创建：每个同步的业务表
```

### 同步标志规则
- `_sync_dirty = 1`：本地有未推送的修改
- `_deleted = 1`：软删除，同步成功后硬删除
- `updated_at`：LWW 冲突解决的时间戳依据

---

## 四、数据流

### 4.1 登录流程

```
用户输入账号密码
        ↓
   尝试服务器登录 (POST /auth/login)
   ┌──────────────┬──────────────────┐
成功 │              │ 失败(网络错误)
   ↓              ↓
setAuth()    saveOnlineLoginLocally()已跑过?
navigate()          ↓
             localLogin(email, pwd) ← bcryptjs.compare
             ┌───────────┬──────────────────┐
          成功 │           │ 失败
             ↓           ↓
         setAuth()   显示"服务器无法连接"
         setLoginInfo  (提示先联网登录)
         1.5s后跳转
```

### 4.2 isOffline 判断规则（跨平台）

离线判断在 `useSSE`、`ChatArea`、`InputBar`、`App` 中统一为：

```ts
const isNative = Capacitor.isNativePlatform()
const isOffline = offlineMode || (isNative ? connectionStatus !== 'online' : connectionStatus === 'offline')
```

**关键区别：**
- **Native（iOS/Android）**：`connectionStatus = 'checking'`（ping 进行中）也视为离线，防止 60 秒 ping 周期中 checking→offline 过渡期触发远程 API 调用。
- **Web（浏览器）**：只有 `offlineMode = true` 才走离线路径，transient ping 失败不影响在线流程，确保 PLAN_GENERATION 两步交互流程正常工作。

### 4.3 发消息流程（离线模式，两步 PLAN_GENERATION）

```
用户输入 → useSSE.connect()
               ↓
    isOffline ? (平台感知判断，见 4.2)
               ↓ Yes
    从 SQLite getState().messages 取最近20条消息（快照，避免 stale closure）
    从 biz_sync_meta 取已同步表的 schema
               ↓
    检测对话状态：
    上一条 assistant 消息包含「这个分析方案是否可以」且无 SQL？
    + 当前用户输入匹配确认词（可以/好的/ok/确认/执行 等）？
               ↓
    ┌──────────────────┬────────────────────────────┐
    │ 否（新问题）      │ 是（确认执行）              │
    │  Step 1 Prompt   │  Step 2 Prompt              │
    │  要求：           │  要求：                     │
    │  - 不生成 SQL     │  - 生成完整 SQL             │
    │  - 提出分析方案   │  - 返回 chart_type          │
    │  - 以「这个分析方 │  - JSON: {sql, chart_type,  │
    │    案是否可以」结尾│    reasoning}               │
    └──────────────────┴────────────────────────────┘
               ↓
    directAiService.streamDirectAi() → 流式输出
               ↓
    流完成后解析 JSON：
    ┌──────────────────────────────────────────┐
    │ sql 为空（Step 1）                        │
    │  → 提取 reasoning 替换聊天气泡中的原始 JSON│
    │  → 等待用户确认                           │
    ├──────────────────────────────────────────┤
    │ sql 非空（Step 2）                        │
    │  → sqlDialectConverter → SQLite 执行     │
    │  → 构建 ECharts option                   │
    │  → setCurrentAnalysis() 打开右侧图表面板  │
    │  → updateLastMessage 写入 chart_cfg/data  │
    │    （供可视化按钮使用）                   │
    └──────────────────────────────────────────┘
               ↓
    消息写入 SQLite messages 表 (_sync_dirty=1)
    → 联网后自动推送到服务器
```

**注意**：`reasoning` 文本替换必须在流完成后执行（`onDone` 回调后的后处理阶段），流中途用户看到原始 JSON 是正常现象（brief flash）。

### 4.3 业务数据同步流程

```
用户打开 BizSyncModal → 点击同步
    ↓
GET /api/biz-sync/databases  (获取可用库列表)
    ↓
GET /api/biz-sync/schema/{key}  (获取表结构)
    ↓
CREATE TABLE biz_{key}__{table} (SQLite)
    ↓
分页下载: GET /api/biz-sync/data/{key}/{table}?page=0&size=500
    ↓
bulkInsertBusinessRows() → 写入 SQLite
    ↓
upsertBizSyncMeta() → 记录同步时间和行数
```

---

## 五、SQL 方言转换（MySQL → SQLite）

`sqlDialectConverter.ts` 共 29 条规则，关键转换：

| MySQL | SQLite | 说明 |
|-------|--------|------|
| `DATE_FORMAT(col, '%Y-%m')` | `strftime('%Y-%m', col)` | |
| `DATEDIFF(d1, d2)` | `CAST(julianday(d1) - julianday(d2) AS INTEGER)` | |
| `DATE_ADD(d, INTERVAL 3 MONTH)` | `date(d, '+3 month')` | |
| `DATE_SUB(d, INTERVAL 1 DAY)` | `date(d, '-1 day')` | |
| `JSON_ARRAYAGG(col)` | `json_group_array(col)` | |
| `JSON_OBJECTAGG(k, v)` | `json_group_object(k, v)` | |
| `GROUP BY x WITH ROLLUP` | `GROUP BY x` | 剔除 ROLLUP |
| `TRUNCATE(num, 2)` | `ROUND(num, 2)` | 近似替代 |
| `CAST(x AS SIGNED)` | `CAST(x AS INTEGER)` | |
| `CONCAT(a, b)` | `(a \|\| b)` | 仅2参数简单形式 |
| `CONCAT_WS(sep, a, b)` | `(a \|\| sep \|\| b)` | |
| `LIMIT offset, count` | `LIMIT count OFFSET offset` | MySQL 简写语法 |
| `QUARTER/WEEK/WEEKDAY/DAYOFWEEK` | `strftime` 等价 | 时间函数 |

> **窗口函数**（ROW_NUMBER, RANK, LAG, LEAD 等）SQLite 3.25+ 原生支持，无需转换。Capacitor 使用的 iOS/Android 系统 SQLite 均 ≥ 3.25。

### MySQL 版本影响说明

- **手机离线模式**：完全不涉及 MySQL，零影响
- **本机 MySQL 5.x（开发）vs Docker MySQL 8.x（生产）**：
  - 影响仅在**在线模式**下服务器执行 SQL 时体现
  - AI 可能生成 8.x 语法（窗口函数等），在 5.x 后端报错
  - 离线 SQLite 反而能跑通（SQLite 3.25+ 支持窗口函数）
  - 建议开发时统一用 Docker 8.x，或在 SQL Agent 提示词中限定 5.x 兼容语法

---

## 六、功能完成状态

### ✅ 已完成

- **本地登录**：bcryptjs 本地验证，网络失败自动降级并提示
- **离线会话列表**：Native 平台先显示本地缓存，再用服务器数据更新
- **离线 AI 对话**：直连四大 Provider，含思考模式
- **离线两步 PLAN_GENERATION**：先提方案 → 用户确认 → 再生成 SQL 并执行（与在线模式体验一致）
- **历史消息上下文**：使用 `getState().messages` 快照，规避 stale closure，AI 能感知历史对话
- **双向同步**：Pull+Push，LWW 冲突解决，60s 定时 + 可见性触发
- **会话删除同步**：在线删除立即写服务端，Web 端无感刷新；离线删除标记 `_deleted=1` 待下次同步
- **业务数据同步**：BizSyncModal 分页下载，写入本地 SQLite
- **SQL 方言转换**：29 条规则，覆盖常见 MySQL → SQLite 差异
- **文件本地缓存**：PDF/图片/ECharts JS 离线可访问
- **用户 ID 迁移**：离线账号联网后与服务器账号自动绑定
- **API Key 验证**：保存前可点"测试 Key"验证有效性
- **存储管理 UI**：StorageModal 查看/清理本地业务数据缓存
- **离线状态指示**：SyncStatusBadge + InputBar 横幅持续显示当前模式
- **per-session 图表隔离**：切换历史会话时自动从消息中恢复对应图表，科学家模式消息跳过图表恢复
- **SQLite 并发初始化保护**：singleton promise + `retrieveConnection` 兜底，防止 "Connection already exists" 崩溃
- **数据库下拉框行为修正**：切换会话时自动关闭下拉框，不再强制重新选择数据库

### ⚠️ 待实现

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P2 | 增量同步 | 当前全量 Pull，需后端 `/sync/pull?since=` 配合游标 |
| P3 | SQLite 加密 | 需接入 SQLCipher（`@capacitor-community/sqlite` 支持，需重新构建） |
| P3 | 离线 RAG | 知识图谱表已建，缺离线向量检索实现 |
| P3 | 存储配额管理 | 业务库数据量大时无提示，缺 SQLite 文件大小查询 |

---

## 七、移动端调试指南

### 查看手机日志

**iOS（推荐）**：
1. iPhone 设置 → Safari → 高级 → Web Inspector 开启
2. Mac Safari → 开发菜单 → \[设备名\] → \[App 的 WebView\]
3. 或 Xcode → Window → Devices → Open Console

**Android**：
1. 手机开启开发者模式 + USB 调试
2. USB 连电脑，Chrome 地址栏 `chrome://inspect`
3. 找到 App 对应的 WebView，点 inspect

**无 USB（应急）**：
- App 内置 `DebugPanel.tsx`（左下角调试图标）可测试连接状态
- 关键 `console.log` 带前缀：`[DB]` `[Sync]` `[DirectAI]` `[SessionList]`

### Chrome DevTools 为空白的原因
Capacitor 打包的 App 是原生壳，Chrome 的 Tab 列表找不到它。必须用 USB 连线 + Safari Inspector（iOS）或 `chrome://inspect`（Android）才能看到。

### 在线/离线切换验证
- 手机和电脑**不在同一 Wi-Fi** → `connectionStatus = 'offline'` → 消息走 directAiService 直连 AI ✅
- 手机和电脑**在同一 Wi-Fi** → 先 Ping 后端，成功则走服务器路由 → 数据同步 ✅

---

## 八、构建与部署

### 前端构建（每次代码变更后）
```bash
cd frontend
npm run build
npx cap copy ios    # 同步到 iOS 工程
npx cap copy android
```

### iOS 运行
```bash
cd frontend/ios/App && pod install  # 首次或 npm install 后
open frontend/ios/App/App.xcworkspace  # Xcode 打开
# Xcode → Run（⌘R）
```

### 后端（可选，离线模式不需要）
```bash
cd backend
source venv312/bin/activate  # 或 Docker
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 手机连接后端配置
- App 内 DebugPanel 填入电脑 IP（同一 Wi-Fi 时）
- 自动保存到 `localStorage['MOBILE_DEBUG_IP']`，重启后生效

---

## 九、分支与 Git 状态

```
main
└── feature/offline-local-sync  ← 当前工作分支
    ├── 完整离线架构
    ├── P1 优化（登录降级、BizSync 入口、离线状态指示）
    ├── P2 部分（SQL 转换增强、会话列表即时加载）
    └── P3 部分（StorageModal、API Key 验证）
```

**合并到 main 的建议时机**：完成登录降级 UX 测试 + BizSync 端到端验证后，核心体验闭环即可合并。

---

## 十、关键设计决策记录

| 决策 | 原因 |
|------|------|
| SQLite 而非 IndexedDB | Capacitor Native 平台性能更好，SQL 查询能力更强 |
| LWW（最后写者胜）同步策略 | 单用户场景，简单可靠，无需 CRDT |
| 直连 AI Provider 而非本地模型 | 手机算力不足以运行本地 LLM，Provider API 更稳定 |
| 伪 JWT 本地 Token | 与现有 authStore 接口兼容，无需改动 ProtectedRoute |
| biz_{key}__{table} 命名前缀 | 避免与系统表冲突，支持多个业务库同时缓存 |
| 29条 MySQL→SQLite 转换规则 | AI 生成 MySQL 方言，但手机只有 SQLite，需在客户端适配 |
| 优先显示本地数据（optimistic local load） | 消除因服务器超时导致的 3-10 秒空白列表 |
| Native 中 `checking` 视为离线 | ping 60s 周期过渡期（checking→offline）不触发远程 API，防止误调用和下拉框闪烁 |
| Web 中 `checking` 不视为离线 | Web 不存在本地 SQLite 回退，transient ping 失败不能中断在线 PLAN_GENERATION 流程 |
| 科学家模式不恢复图表 | 科学家模式返回 `is_data_science=true`，数据结构与标准图表不兼容，强行恢复会导致渲染崩溃 |
| 会话删除不弹二次确认（Web 端） | 删除已在手机端确认过一次；多设备二次确认体验极差；数据一致性由服务端保证，不存在冲突风险 |
| `getState().messages` 代替闭包中的 `messages` | `useCallback` 不包含 `messages` 依赖时捕获的是旧值（stale closure）；`getState()` 在调用时动态取最新快照 |
