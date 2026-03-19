/**
 * localStore.ts — 平台分发层
 * Native (iOS/Android) → SQLite via db.ts
 * Web → 内存 Map 回退（不影响 web 调试）
 */

import { Capacitor } from '@capacitor/core'
import { v4 as uuidv4 } from 'uuid'
import dbService, {
  LocalSession,
  LocalMessage,
  LocalApiKey,
} from './db'

// ==================== Simple UUID ====================
function genId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return uuidv4()
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }
}

// ==================== Web fallback memory store ====================
const _sessions = new Map<string, LocalSession>()
const _messages = new Map<string, LocalMessage>()
const _apiKeys = new Map<string, LocalApiKey>() // key: `${userId}:${provider}`

// ==================== Init ====================
let _dbReady = false
export async function initLocalStore(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    _dbReady = await dbService.init()
  }
}

// ==================== Sessions ====================

export async function localGetSessions(userId: number): Promise<LocalSession[]> {
  if (_dbReady) return dbService.getSessions(userId)
  return Array.from(_sessions.values()).filter(s => s.user_id === userId && !s._deleted)
}

export async function localCreateSession(userId: number, extra?: Partial<LocalSession>): Promise<LocalSession> {
  const now = new Date().toISOString()
  const session: LocalSession = {
    id: genId(),
    user_id: userId,
    title: null,
    database_key: 'business',
    status: 'active',
    enable_data_science_agent: 0,
    enable_thinking: 0,
    enable_rag: 0,
    model_provider: null,
    model_name: null,
    created_at: now,
    updated_at: now,
    _sync_dirty: 1,
    _deleted: 0,
    ...extra,
  }
  if (_dbReady) {
    await dbService.upsertSession(session)
  } else {
    _sessions.set(session.id, session)
  }
  return session
}

export async function localUpdateSession(id: string, updates: Partial<LocalSession>): Promise<void> {
  const now = new Date().toISOString()
  if (_dbReady) {
    const existing = await dbService.getSession(id)
    if (existing) {
      await dbService.upsertSession({ ...existing, ...updates, updated_at: now, _sync_dirty: 1 })
    }
  } else {
    const s = _sessions.get(id)
    if (s) _sessions.set(id, { ...s, ...updates, updated_at: now, _sync_dirty: 1 })
  }
}

export async function localDeleteSession(id: string): Promise<void> {
  if (_dbReady) {
    await dbService.softDeleteSession(id)
  } else {
    const s = _sessions.get(id)
    if (s) _sessions.set(id, { ...s, _deleted: 1, _sync_dirty: 1 })
  }
}

// ==================== Messages ====================

export async function localGetMessages(sessionId: string): Promise<LocalMessage[]> {
  if (_dbReady) return dbService.getMessages(sessionId)
  return Array.from(_messages.values()).filter(
    m => m.session_id === sessionId && !m._deleted && m.is_current
  )
}

export async function localGetAllMessages(sessionId: string): Promise<LocalMessage[]> {
  if (_dbReady) return dbService.getAllMessages(sessionId)
  return Array.from(_messages.values()).filter(
    m => m.session_id === sessionId && !m._deleted
  )
}

export async function localSaveMessage(msg: Partial<LocalMessage> & { id: string; session_id: string; role: string; content: string }): Promise<void> {
  const now = new Date().toISOString()
  const full: LocalMessage = {
    parent_id: null,
    sql: null,
    chart_cfg: null,
    thinking: null,
    data: null,
    is_current: 1,
    feedback: 0,
    feedback_text: null,
    tokens_prompt: 0,
    tokens_completion: 0,
    created_at: now,
    _sync_dirty: 1,
    _deleted: 0,
    ...msg,
  }
  if (_dbReady) {
    await dbService.upsertMessage(full)
  } else {
    _messages.set(full.id, full)
  }
}

export async function localUpdateMessage(id: string, updates: Partial<LocalMessage>): Promise<void> {
  if (_dbReady) {
    await dbService.updateMessageContent(id, updates)
  } else {
    const m = _messages.get(id)
    if (m) _messages.set(id, { ...m, ...updates, _sync_dirty: 1 })
  }
}

// ==================== API Keys ====================

export async function localGetApiKeys(userId: number): Promise<LocalApiKey[]> {
  if (_dbReady) return dbService.getApiKeys(userId)
  return Array.from(_apiKeys.values()).filter(k => k.user_id === userId && !k._deleted)
}

export async function localGetApiKey(userId: number, provider: string): Promise<LocalApiKey | null> {
  if (_dbReady) return dbService.getApiKey(userId, provider)
  return _apiKeys.get(`${userId}:${provider}`) || null
}

export async function localSaveApiKey(userId: number, data: {
  provider: string
  api_key: string
  base_url?: string
  model_name?: string
}): Promise<void> {
  const now = new Date().toISOString()
  const existing = await localGetApiKey(userId, data.provider)
  const key: LocalApiKey = {
    id: existing?.id ?? genId(),
    user_id: userId,
    provider: data.provider,
    api_key: data.api_key,
    base_url: data.base_url ?? null,
    model_name: data.model_name ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    _sync_dirty: 1,
    _deleted: 0,
  }
  if (_dbReady) {
    await dbService.upsertApiKey(key)
  } else {
    _apiKeys.set(`${userId}:${data.provider}`, key)
  }
}

export async function localDeleteApiKey(userId: number, provider: string): Promise<void> {
  if (_dbReady) {
    await dbService.softDeleteApiKey(userId, provider)
  } else {
    const k = _apiKeys.get(`${userId}:${provider}`)
    if (k) _apiKeys.set(`${userId}:${provider}`, { ...k, _deleted: 1, _sync_dirty: 1 })
  }
}

// ==================== Dirty rows for sync ====================

export async function getDirtyRows() {
  if (!_dbReady) return { sessions: [], messages: [], apiKeys: [] }
  const [sessions, messages, apiKeys] = await Promise.all([
    dbService.getDirtySessions(),
    dbService.getDirtyMessages(),
    dbService.getDirtyApiKeys(),
  ])
  return { sessions, messages, apiKeys }
}

export async function clearDirtyFlags(ids: { sessionIds: string[]; messageIds: string[]; apiKeyIds: string[] }) {
  if (!_dbReady) return
  await Promise.all([
    ...ids.sessionIds.map(id => dbService.clearSessionDirty(id)),
    ...ids.messageIds.map(id => dbService.clearMessageDirty(id)),
    ...ids.apiKeyIds.map(id => dbService.clearApiKeyDirty(id)),
  ])
  await dbService.hardDeleteSyncedDeleted()
}

// ==================== Web pull merge (memory Map only) ====================

/**
 * Merge server-pulled data into the in-memory Maps (web platform).
 * Does NOT set _sync_dirty so these rows won't be pushed back to server.
 * Uses last-write-wins: server data overwrites local only if local is not dirty.
 */
export function webMergeFromServer(data: {
  sessions: LocalSession[]
  messages: LocalMessage[]
  api_keys: LocalApiKey[]
}): void {
  for (const s of data.sessions) {
    const local = _sessions.get(s.id)
    if (!local || (local._sync_dirty === 0 && s.updated_at > (local.updated_at || ''))) {
      _sessions.set(s.id, { ...s, _sync_dirty: 0, _deleted: 0 })
    }
  }
  for (const m of data.messages) {
    const local = _messages.get(m.id)
    if (!local || local._sync_dirty === 0) {
      _messages.set(m.id, { ...m, _sync_dirty: 0, _deleted: 0 })
    }
  }
  for (const k of data.api_keys) {
    const mapKey = `${k.user_id}:${k.provider}`
    const local = _apiKeys.get(mapKey)
    if (!local || (local._sync_dirty === 0 && k.updated_at > (local.updated_at || ''))) {
      _apiKeys.set(mapKey, { ...k, _sync_dirty: 0, _deleted: 0 })
    }
  }
}

// ==================== User migration ====================

export async function migrateOfflineUserId(toId: number): Promise<void> {
  if (_dbReady) await dbService.migrateUserId(-1, toId)
  // In-memory fallback
  for (const [k, s] of _sessions) {
    if (s.user_id === -1) _sessions.set(k, { ...s, user_id: toId })
  }
  for (const [k, key] of _apiKeys) {
    if (key.user_id === -1) _apiKeys.set(k, { ...key, user_id: toId })
  }
}
