/**
 * syncService.ts — 同步引擎
 * pull-then-push + 时间戳策略
 * 冲突解决: last-write-wins (updated_at)
 */

import { Capacitor } from '@capacitor/core'
import axios from 'axios'
import { getBaseURL } from '../api'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'
import {
  getDirtyRows,
  clearDirtyFlags,
  webMergeFromServer,
} from './localStore'
import dbService, { isDbInitialized, saveCommunitiesToDb, listKnowledgeDocs } from './db'
import { knowledgeGraphApi } from '../api'

const SYNC_TIMEOUT_MS = 15000       // ping / pull 超时
const PUSH_TIMEOUT_MS = 60000       // push 可能携带大量 chunks，热点传输给足时间
const LAST_SYNC_TS_KEY = 'dp_last_sync_ts'

function getToken(): string {
  return useAuthStore.getState().token || ''
}


function getApiBaseUrl(): string {
  const base = getBaseURL()
  return base.endsWith('/') ? base.slice(0, -1) : base
}

// ==================== Ping ====================

export async function ping(): Promise<boolean> {
  const url = `${getApiBaseUrl()}/sync/ping`
  try {
    const res = await axios.get(url, { timeout: SYNC_TIMEOUT_MS })
    return res.status === 200
  } catch (e) {
    console.warn(`[Sync] ping failed (${url}):`, e)
    return false
  }
}

// ==================== Pull ====================

interface PullResponse {
  sessions: any[]
  messages: any[]
  api_keys: any[]
  knowledge_chunks: any[]
  server_time: string
}

export async function pull(since?: string): Promise<PullResponse | null> {
  const token = getToken()
  if (!token) return null

  const url = since
    ? `${getApiBaseUrl()}/sync/pull?since=${encodeURIComponent(since)}`
    : `${getApiBaseUrl()}/sync/pull`

  const res = await axios.get<PullResponse>(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: SYNC_TIMEOUT_MS,
  })
  if (res.status !== 200) return null
  return res.data
}

// ==================== Push ====================

interface PushPayload {
  sessions: any[]
  messages: any[]
  api_keys: any[]
  knowledge_chunks: any[]
  deleted_sessions: string[]
  deleted_messages: string[]
  deleted_api_keys: string[]
  deleted_knowledge_chunks: string[]
}

export async function push(payload: PushPayload): Promise<boolean> {
  const token = getToken()
  if (!token) return false

  const res = await axios.post(`${getApiBaseUrl()}/sync/push`, payload, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: PUSH_TIMEOUT_MS,
  })
  return res.status === 200
}

// ==================== Full sync ====================

export async function fullSync(): Promise<void> {
  const { setSyncing, setSyncError, setLastSyncAt, setConnectionStatus } = useSyncStore.getState()
  // Only sync when authenticated with a real token (not offline mode)
  const authState = useAuthStore.getState()
  if (!authState.isAuthenticated || authState.offlineMode) return

  // On native, wait for SQLite to be ready (max 3s)
  if (Capacitor.isNativePlatform() && !isDbInitialized()) {
    let waited = 0
    while (!isDbInitialized() && waited < 3000) {
      await new Promise(r => setTimeout(r, 100))
      waited += 100
    }
    if (!isDbInitialized()) {
      console.warn('[Sync] DB not ready after 3s, skipping sync')
      return
    }
  }

  setSyncing(true)
  setSyncError(null)

  try {
    // 1. Ping
    const online = await ping()
    if (!online) {
      setConnectionStatus('offline')
      console.warn('[Sync] ❌ Ping failed — backend unreachable')
      return
    }
    setConnectionStatus('online')
    console.log('[Sync] ✅ Ping OK')

    const since = localStorage.getItem(LAST_SYNC_TS_KEY) || undefined

    // 2. Pull → merge into local store (pull once, branch on platform)
    //    Native: merge into SQLite; Web: merge into in-memory Maps as warm cache
    const pulled = await pull(since)
    if (!pulled) {
      setSyncError('Failed to pull data from server')
      setConnectionStatus('offline')
      return
    }

    if (Capacitor.isNativePlatform()) {
      for (const serverSession of pulled.sessions) {
        const local = await dbService.getSession(serverSession.id)
        if (!local || (local._sync_dirty === 0 && serverSession.updated_at > (local.updated_at || ''))) {
          await dbService.upsertSession({ ...serverSession, _sync_dirty: 0, _deleted: 0 })
        }
      }

      for (const serverMsg of pulled.messages) {
        try {
          await dbService.upsertMessageFromServer({ ...serverMsg, _sync_dirty: 0, _deleted: 0 })
        } catch { /* ignore */ }
      }

      for (const serverKey of pulled.api_keys) {
        const local = await dbService.getApiKey(serverKey.user_id, serverKey.provider)
        if (!local || (local._sync_dirty === 0 && serverKey.updated_at > (local.updated_at || ''))) {
          await dbService.upsertApiKey({ ...serverKey, _sync_dirty: 0, _deleted: 0 })
        }
      }

      for (const serverChunk of (pulled.knowledge_chunks || [])) {
        try {
          await dbService.upsertKnowledgeChunkFromServer(serverChunk)
        } catch { /* ignore */ }
      }
    } else {
      // Web platform: populate memory Maps so offline-fallback reads are warm
      webMergeFromServer(pulled)
    }

    if (pulled.server_time) {
      localStorage.setItem(LAST_SYNC_TS_KEY, pulled.server_time)
    }

    // ─── 社区数据主动同步（原生端）——拉取服务器所有已知文档的社区数据
    // 解决旧数据没有存入本地的历史问题
    if (Capacitor.isNativePlatform()) {
      try {
        const userId = useAuthStore.getState().localUserId ?? -1
        // 获取本地所有知识图谱已知文档
        const localDocs = await listKnowledgeDocs(userId, null)
        if (localDocs.length > 0) {
          console.log(`[Sync] 📥 开始社区数据同步，共 ${localDocs.length} 个文档`)
          let synced = 0
          for (const docName of localDocs) {
            try {
              const res = await knowledgeGraphApi.getCommunities(docName)
              if (res.communities.length > 0) {
                await saveCommunitiesToDb(docName, res.communities.map(c => ({
                  community_id: c.community_id,
                  title: c.title,
                  summary: c.summary,
                  entity_texts: Array.isArray(c.entity_texts) ? c.entity_texts : [],
                  size: c.size ?? 0,
                })))
                synced++
              }
            } catch {
              // 单个文档失败不阻断后续同步
            }
          }
          if (synced > 0) console.log(`[Sync] ✅ 社区同步完成: ${synced}/${localDocs.length} 个文档`)
        }
      } catch (commErr) {
        console.warn('[Sync] 社区批量同步失败:', commErr)
      }
    }

    // 3. Push dirty rows (native only; web has no local dirty rows)
    // Snapshot dirty rows BEFORE push to avoid clearing flags for writes that
    // happen concurrently during the network round-trip (race condition fix).
    const dirty = await getDirtyRows()
    console.log(`[Sync] 📦 Dirty rows — sessions:${dirty.sessions.length} msgs:${dirty.messages.length} keys:${dirty.apiKeys.length} chunks:${dirty.knowledgeChunks.length}`)
    const snapshotSessionIds = dirty.sessions.map(s => s.id)
    const snapshotMessageIds = dirty.messages.map(m => m.id)
    const snapshotApiKeyIds = dirty.apiKeys.map(k => k.id)
    // chunks 按批推送，clearDirtyFlags 用 batch.map 即可，这里不再做整体快照

    const activeSessions = dirty.sessions.filter(s => !s._deleted)
    const deletedSessionIds = dirty.sessions.filter(s => s._deleted).map(s => s.id)
    const activeMessages = dirty.messages.filter(m => !m._deleted)
    const deletedMessageIds = dirty.messages.filter(m => m._deleted).map(m => m.id)
    const activeKeys = dirty.apiKeys.filter(k => !k._deleted)
    const deletedKeyIds = dirty.apiKeys.filter(k => k._deleted).map(k => k.id)
    // Strip local embeddings before pushing — backend re-embeds with its own model
    const activeChunks = dirty.knowledgeChunks
      .filter(c => !c._deleted)
      .map(({ _sync_dirty: _sd, _deleted: _dl, embedding: _emb, embedding_provider: _ep, ...rest }) => rest)
    const deletedChunkIds = dirty.knowledgeChunks.filter(c => c._deleted).map(c => c.id)

    const hasDirty = activeSessions.length || deletedSessionIds.length ||
      activeMessages.length || deletedMessageIds.length ||
      activeKeys.length || deletedKeyIds.length ||
      activeChunks.length || deletedChunkIds.length

    if (!hasDirty) {
      console.log('[Sync] ✅ Nothing to push — all rows clean')
    }

    if (hasDirty) {
      console.log('[Sync] 📤 Pushing dirty rows...')

      // chunks 按批发送，避免大文件解析后单次 payload 过大导致超时
      // 非 chunk 数据量少，随第一批一起发
      const CHUNK_BATCH_SIZE = 20
      const chunkBatches: any[][] = activeChunks.length === 0
        ? [[]]
        : Array.from({ length: Math.ceil(activeChunks.length / CHUNK_BATCH_SIZE) },
            (_, i) => activeChunks.slice(i * CHUNK_BATCH_SIZE, (i + 1) * CHUNK_BATCH_SIZE))

      let allPushed = true
      for (let bi = 0; bi < chunkBatches.length; bi++) {
        const isFirst = bi === 0
        const batch = chunkBatches[bi]
        const pushed = await push({
          sessions:                  isFirst ? activeSessions    : [],
          messages:                  isFirst ? activeMessages    : [],
          api_keys:                  isFirst ? activeKeys        : [],
          knowledge_chunks:          batch,
          deleted_sessions:          isFirst ? deletedSessionIds  : [],
          deleted_messages:          isFirst ? deletedMessageIds  : [],
          deleted_api_keys:          isFirst ? deletedKeyIds      : [],
          deleted_knowledge_chunks:  isFirst ? deletedChunkIds    : [],
        })
        if (pushed) {
          // 每批成功后立即清对应 dirty flag，避免整体失败时重复发
          await clearDirtyFlags({
            sessionIds:        isFirst ? snapshotSessionIds  : [],
            messageIds:        isFirst ? snapshotMessageIds  : [],
            apiKeyIds:         isFirst ? snapshotApiKeyIds   : [],
            knowledgeChunkIds: batch.map(c => c.id),
          })
          if (chunkBatches.length > 1) {
            console.log(`[Sync] ✅ Batch ${bi + 1}/${chunkBatches.length} pushed (${batch.length} chunks)`)
          }
        } else {
          allPushed = false
          break
        }
      }

      if (allPushed) console.log('[Sync] ✅ Push succeeded')
    }

    setLastSyncAt(new Date().toISOString())
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    setSyncError(msg)
    console.error('[Sync] Error:', e)
  } finally {
    setSyncing(false)
  }
}
