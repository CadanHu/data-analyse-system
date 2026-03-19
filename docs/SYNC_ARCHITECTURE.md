# 同步架构 Spec — 手机端 ↔ 服务端双向自动同步

> 分支: `feature/offline-local-sync`
> 更新: 2026-03-19

---

## 1. 整体架构

```
┌─────────────────────────────┐        WiFi / 4G        ┌───────────────────────────┐
│  手机 (iOS / Android)        │ ◄─────────────────────► │  Mac 后端服务器 (FastAPI)   │
│                             │                          │                           │
│  React (Capacitor)          │   GET  /api/sync/pull    │  MySQL (sessions/         │
│  ├─ 本地 SQLite              │   POST /api/sync/push    │         messages/         │
│  │   sessions               │   GET  /api/sync/ping    │         api_keys)         │
│  │   messages               │                          │                           │
│  │   api_keys               │                          │  sync_router.py           │
│  └─ _sync_dirty / _deleted  │                          │  session_db.py            │
└─────────────────────────────┘                          └───────────────────────────┘
```

**Mac "系统"指的是部署在 Mac 上的 FastAPI + MySQL 后端服务，不是 Mac 桌面 App。**
Web 版（浏览器直接访问后端）无本地 SQLite，数据只在服务端存储。

---

## 2. 回答核心问题：消息会自动同步吗？

**是的，完全自动双向同步。** 只要手机和后端在同一网络（或手机能访问服务器），：

| 触发时机 | 动作 |
|---|---|
| App 启动 / 每 60 秒 | Ping 检测连通性 |
| 网络从离线恢复为在线 | 立即触发全量同步 |
| App 从后台切回前台 | 触发全量同步 |
| 手机本地写入数据后 300ms | 防抖推送 dirty 数据到服务端 |
| 用户从离线模式登录账号 | 600ms 后触发同步（等待数据迁移完成） |

---

## 3. 同步流程（手机端发起）

```
fullSync()
  │
  ├─ 1. Ping  GET /sync/ping  (timeout 3s)
  │         失败 → connectionStatus = 'offline'，退出
  │
  ├─ 2. Pull  GET /sync/pull?since=<last_sync_ts>
  │         服务端返回: sessions / messages / api_keys (增量)
  │         合并策略: last-write-wins (按 updated_at 比较)
  │         仅当本地行 _sync_dirty=0 且服务端更新更新时才覆盖
  │         成功后更新 localStorage['dp_last_sync_ts'] = server_time
  │
  └─ 3. Push  POST /sync/push
            payload: { sessions, messages, api_keys,
                       deleted_sessions, deleted_messages, deleted_api_keys }
            只发送 _sync_dirty=1 的行
            成功后: 清除 dirty 标志，硬删除软删除行
```

> Pull 和 Push 仅在 **native 平台**（iOS/Android）执行。Web 版无本地 SQLite，跳过。

---

## 4. 冲突解决策略

**Last-Write-Wins（最后写入胜出）**

- 比较字段: `updated_at`（ISO-8601 UTC）
- 本地 `_sync_dirty=1`（有未推送修改）时，**本地优先**，不被服务端覆盖
- 本地 `_sync_dirty=0` 且服务端时间戳更新 → 服务端覆盖本地

无向量钟 / 三路合并，设计简洁但有极端情况下的冲突风险（同一行在两端同时修改）。

---

## 5. 同步的数据范围

| 数据类型 | Pull | Push | 软删除支持 |
|---|---|---|---|
| sessions | ✅ | ✅ | ✅ |
| messages | ✅ | ✅ | ✅ |
| api_keys | ✅ | ✅ | ✅ |

**不同步的内容：**
- AI 回复的实时流（SSE）— 直接写入本地 SQLite，再由 Push 同步到服务端
- 文件缓存（ECharts 等静态资源）— 独立的 `fileCache.ts` 管理

---

## 6. 离线模式

用户可选择"离线使用"（不登录账号）：

```
Login → "离线使用" → initOffline() → offlineMode=true, localUserId=-1
```

- 离线时：所有数据仅写入本地 SQLite，AI 调用走 `directAiService.ts`（直连 OpenAI/DeepSeek/Claude/Gemini）
- 上线后登录：`migrateOfflineUserId()` 将 localUserId=-1 的数据迁移到真实 userId，600ms 后全量 Push

---

## 7. 关键文件索引

| 文件 | 职责 |
|---|---|
| `frontend/src/services/syncService.ts` | ping / pull / push / fullSync 核心逻辑 |
| `frontend/src/hooks/useSyncManager.ts` | 定时器、事件监听、生命周期管理 |
| `frontend/src/services/localStore.ts` | 平台分发（native→SQLite, web→Map） |
| `frontend/src/services/db.ts` | SQLite DDL + CRUD（@capacitor-community/sqlite） |
| `frontend/src/stores/syncStore.ts` | connectionStatus: offline/online/checking/syncing |
| `frontend/src/components/SyncStatusBadge.tsx` | 4 状态同步徽章（SessionList 底部） |
| `backend/routers/sync_router.py` | GET /ping, GET /pull, POST /push |
| `backend/database/session_db.py` | upsert_session/message/api_key, get_*_since, delete |

---

## 8. 当前已知限制

1. **Web 版不缓存**：浏览器访问时无本地 SQLite，刷新页面需重新从服务端加载
2. **无实时推送**：服务端变更（如另一台设备操作）需等下次 ping（最长 60 秒）或切回前台才同步
3. **冲突极端情况**：两端同时修改同一条消息，最后一次 Push 胜出，另一端修改丢失
4. **API Key 明文传输**：api_key 字段在 push payload 中未加密，依赖 HTTPS 保护
