/**
 * syncService.ts — 同步引擎
 * pull-then-push + 时间戳策略
 * 冲突解决: last-write-wins (updated_at)
 */

import { getBaseURL } from '../api'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'
import {
  localGetSessions,
  localGetApiKeys,
  getDirtyRows,
  clearDirtyFlags,
} from './localStore'
import dbService from './db'

const PING_TIMEOUT_MS = 3000
const LAST_SYNC_TS_KEY = 'dp_last_sync_ts'

function getToken(): string {
  return useAuthStore.getState().token || ''
}

function getUserId(): number {
  return useAuthStore.getState().user?.id ?? -1
}

function getApiBaseUrl(): string {
  const base = getBaseURL()
  return base.endsWith('/') ? base.slice(0, -1) : base
}

// ==================== Ping ====================

export async function ping(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
    const res = await fetch(`${getApiBaseUrl()}/sync/ping`, { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

// ==================== Pull ====================

interface PullResponse {
  sessions: any[]
  messages: any[]
  api_keys: any[]
  server_time: string
}

export async function pull(since?: string): Promise<PullResponse | null> {
  const token = getToken()
  if (!token) return null

  const url = since
    ? `${getApiBaseUrl()}/sync/pull?since=${encodeURIComponent(since)}`
    : `${getApiBaseUrl()}/sync/pull`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

// ==================== Push ====================

interface PushPayload {
  sessions: any[]
  messages: any[]
  api_keys: any[]
  deleted_sessions: string[]
  deleted_messages: string[]
  deleted_api_keys: string[]
}

export async function push(payload: PushPayload): Promise<boolean> {
  const token = getToken()
  if (!token) return false

  const res = await fetch(`${getApiBaseUrl()}/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  return res.ok
}

// ==================== Full sync ====================

export async function fullSync(): Promise<void> {
  const { setSyncing, setSyncError, setLastSyncAt, setConnectionStatus } = useSyncStore.getState()
  const userId = getUserId()

  // Only sync when authenticated
  if (!useAuthStore.getState().isAuthenticated) return

  setSyncing(true)
  setSyncError(null)

  try {
    // 1. Ping
    const online = await ping()
    if (!online) {
      setConnectionStatus('offline')
      return
    }
    setConnectionStatus('online')

    const since = localStorage.getItem(LAST_SYNC_TS_KEY) || undefined

    // 2. Pull
    const pulled = await pull(since)
    if (pulled) {
      // Merge: server.updated_at > local.updated_at → overwrite local
      // But if local._sync_dirty = 1 → keep local (push handles it)
      for (const serverSession of pulled.sessions) {
        const local = await dbService.getSession(serverSession.id)
        if (!local || (local._sync_dirty === 0 && serverSession.updated_at > (local.updated_at || ''))) {
          await dbService.upsertSession({ ...serverSession, _sync_dirty: 0, _deleted: 0 })
        }
      }

      for (const serverMsg of pulled.messages) {
        // Messages are append-only from server side, just upsert if not locally dirty
        try {
          await dbService.upsertMessage({ ...serverMsg, _sync_dirty: 0, _deleted: 0 })
        } catch { /* ignore */ }
      }

      for (const serverKey of pulled.api_keys) {
        const local = await dbService.getApiKey(serverKey.user_id, serverKey.provider)
        if (!local || (local._sync_dirty === 0 && serverKey.updated_at > (local.updated_at || ''))) {
          await dbService.upsertApiKey({ ...serverKey, _sync_dirty: 0, _deleted: 0 })
        }
      }

      // Store server time as next sync cursor
      if (pulled.server_time) {
        localStorage.setItem(LAST_SYNC_TS_KEY, pulled.server_time)
      }
    }

    // 3. Push dirty rows
    const dirty = await getDirtyRows()
    const activeSessions = dirty.sessions.filter(s => !s._deleted)
    const deletedSessionIds = dirty.sessions.filter(s => s._deleted).map(s => s.id)
    const activeMessages = dirty.messages.filter(m => !m._deleted)
    const deletedMessageIds = dirty.messages.filter(m => m._deleted).map(m => m.id)
    const activeKeys = dirty.apiKeys.filter(k => !k._deleted)
    const deletedKeyIds = dirty.apiKeys.filter(k => k._deleted).map(k => k.id)

    const hasDirty = activeSessions.length || deletedSessionIds.length ||
      activeMessages.length || deletedMessageIds.length ||
      activeKeys.length || deletedKeyIds.length

    if (hasDirty) {
      const pushed = await push({
        sessions: activeSessions,
        messages: activeMessages,
        api_keys: activeKeys,
        deleted_sessions: deletedSessionIds,
        deleted_messages: deletedMessageIds,
        deleted_api_keys: deletedKeyIds,
      })

      if (pushed) {
        // 4. Clear dirty flags + hard-delete soft-deleted
        await clearDirtyFlags({
          sessionIds: dirty.sessions.map(s => s.id),
          messageIds: dirty.messages.map(m => m.id),
          apiKeyIds: dirty.apiKeys.map(k => k.id),
        })
      }
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
