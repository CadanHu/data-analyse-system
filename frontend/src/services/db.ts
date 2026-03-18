/**
 * db.ts — 本地 SQLite 核心服务
 * 封装 @capacitor-community/sqlite，提供类型化 CRUD 接口
 * iOS / Android 通用，web 环境下 isNative=false 时退化为 no-op（由 localStore.ts 处理）
 */

import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'

// ==================== Types ====================

export interface LocalSession {
  id: string
  user_id: number
  title: string | null
  database_key: string | null
  status: string | null
  enable_data_science_agent: number
  enable_thinking: number
  enable_rag: number
  model_provider: string | null
  model_name: string | null
  created_at: string | null
  updated_at: string | null
  _sync_dirty: number
  _deleted: number
}

export interface LocalMessage {
  id: string
  session_id: string
  parent_id: string | null
  role: string
  content: string
  sql: string | null
  chart_cfg: string | null
  thinking: string | null
  data: string | null
  is_current: number
  feedback: number
  feedback_text: string | null
  tokens_prompt: number
  tokens_completion: number
  created_at: string | null
  _sync_dirty: number
  _deleted: number
}

export interface LocalAccount {
  id: number
  username: string
  email: string
  password_hash: string
  avatar_url: string | null
  is_active: number
  created_at: string
  last_login: string | null
  local_only: number
  server_id: number | null
}

export interface LocalApiKey {
  id: string
  user_id: number
  provider: string
  api_key: string
  base_url: string | null
  model_name: string | null
  created_at: string | null
  updated_at: string | null
  _sync_dirty: number
  _deleted: number
}

// ==================== DDL ====================

const DDL = `
CREATE TABLE IF NOT EXISTS sessions (
  id                        TEXT    NOT NULL PRIMARY KEY,
  user_id                   INTEGER NOT NULL,
  title                     TEXT    NULL,
  database_key              TEXT    NULL DEFAULT 'business',
  status                    TEXT    NULL DEFAULT 'active',
  enable_data_science_agent INTEGER NULL DEFAULT 0,
  enable_thinking           INTEGER NULL DEFAULT 0,
  enable_rag                INTEGER NULL DEFAULT 0,
  model_provider            TEXT    NULL,
  model_name                TEXT    NULL,
  created_at                TEXT    NULL,
  updated_at                TEXT    NULL,
  _sync_dirty  INTEGER NOT NULL DEFAULT 0,
  _deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_sync ON sessions(_sync_dirty);

CREATE TABLE IF NOT EXISTS messages (
  id                TEXT    NOT NULL PRIMARY KEY,
  session_id        TEXT    NOT NULL,
  parent_id         TEXT    NULL,
  role              TEXT    NOT NULL,
  content           TEXT    NOT NULL DEFAULT '',
  sql               TEXT    NULL,
  chart_cfg         TEXT    NULL,
  thinking          TEXT    NULL,
  data              TEXT    NULL,
  is_current        INTEGER NULL DEFAULT 1,
  feedback          INTEGER NULL DEFAULT 0,
  feedback_text     TEXT    NULL,
  tokens_prompt     INTEGER NULL DEFAULT 0,
  tokens_completion INTEGER NULL DEFAULT 0,
  created_at        TEXT    NULL,
  _sync_dirty  INTEGER NOT NULL DEFAULT 0,
  _deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_sync ON messages(_sync_dirty);

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER NOT NULL PRIMARY KEY,
  username     TEXT    NOT NULL,
  email        TEXT    NOT NULL,
  avatar_url   TEXT    NULL,
  is_active    INTEGER NULL DEFAULT 1,
  created_at   TEXT    NULL,
  last_login   TEXT    NULL
);

CREATE TABLE IF NOT EXISTS user_api_keys (
  id           TEXT    NOT NULL PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  provider     TEXT    NOT NULL,
  api_key      TEXT    NOT NULL,
  base_url     TEXT    NULL,
  model_name   TEXT    NULL,
  created_at   TEXT    NULL,
  updated_at   TEXT    NULL,
  _sync_dirty  INTEGER NOT NULL DEFAULT 0,
  _deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_user_provider ON user_api_keys(user_id, provider);

CREATE TABLE IF NOT EXISTS knowledge_entities (
  id TEXT NOT NULL PRIMARY KEY,
  doc_id TEXT,
  entity_class TEXT,
  entity_text TEXT NOT NULL,
  attributes TEXT NULL DEFAULT '{}',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id TEXT NOT NULL PRIMARY KEY,
  doc_id TEXT,
  source_text TEXT NOT NULL,
  target_text TEXT NOT NULL,
  relation_type TEXT,
  attributes TEXT NULL DEFAULT '{}',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS local_accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  avatar_url    TEXT    NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL,
  last_login    TEXT    NULL,
  local_only    INTEGER NOT NULL DEFAULT 1,
  server_id     INTEGER NULL
);

CREATE TABLE IF NOT EXISTS biz_sync_meta (
  db_key     TEXT NOT NULL,
  table_name TEXT NOT NULL,
  synced_at  TEXT,
  row_count  INTEGER DEFAULT 0,
  PRIMARY KEY (db_key, table_name)
);
`

// ==================== DB Service ====================

const DB_NAME = 'datapulse_local'
const DB_VERSION_KEY = 'dp_db_version'
const CURRENT_DB_VERSION = 1

let sqlite: SQLiteConnection | null = null
let db: SQLiteDBConnection | null = null
let initialized = false

export function isDbInitialized(): boolean {
  return initialized
}

export async function initDb(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[DB] Web platform — SQLite skipped')
    return false
  }
  if (initialized) return true

  try {
    sqlite = new SQLiteConnection(CapacitorSQLite)
    db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', CURRENT_DB_VERSION, false)
    await db.open()
    await db.execute(DDL)
    initialized = true
    console.log('✅ [DB] SQLite initialized:', DB_NAME)
    return true
  } catch (e) {
    console.error('[DB] Init failed:', e)
    return false
  }
}

function requireDb(): SQLiteDBConnection {
  if (!db) throw new Error('[DB] Not initialized')
  return db
}

// ==================== Sessions ====================

export async function getSessions(userId: number): Promise<LocalSession[]> {
  const result = await requireDb().query(
    'SELECT * FROM sessions WHERE user_id = ? AND _deleted = 0 ORDER BY updated_at DESC',
    [userId]
  )
  return (result.values || []) as LocalSession[]
}

export async function getSession(id: string): Promise<LocalSession | null> {
  const result = await requireDb().query(
    'SELECT * FROM sessions WHERE id = ? AND _deleted = 0',
    [id]
  )
  return (result.values?.[0] as LocalSession) || null
}

export async function upsertSession(session: Partial<LocalSession> & { id: string }): Promise<void> {
  const now = new Date().toISOString()
  await requireDb().run(
    `INSERT INTO sessions (id, user_id, title, database_key, status,
      enable_data_science_agent, enable_thinking, enable_rag,
      model_provider, model_name, created_at, updated_at, _sync_dirty, _deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title,
       database_key=excluded.database_key,
       status=excluded.status,
       enable_data_science_agent=excluded.enable_data_science_agent,
       enable_thinking=excluded.enable_thinking,
       enable_rag=excluded.enable_rag,
       model_provider=excluded.model_provider,
       model_name=excluded.model_name,
       updated_at=excluded.updated_at,
       _sync_dirty=excluded._sync_dirty,
       _deleted=excluded._deleted`,
    [
      session.id,
      session.user_id ?? -1,
      session.title ?? null,
      session.database_key ?? 'business',
      session.status ?? 'active',
      session.enable_data_science_agent ?? 0,
      session.enable_thinking ?? 0,
      session.enable_rag ?? 0,
      session.model_provider ?? null,
      session.model_name ?? null,
      session.created_at ?? now,
      session.updated_at ?? now,
      session._sync_dirty ?? 1,
      session._deleted ?? 0,
    ]
  )
}

export async function markSessionDirty(id: string): Promise<void> {
  await requireDb().run(
    'UPDATE sessions SET _sync_dirty = 1, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), id]
  )
}

export async function softDeleteSession(id: string): Promise<void> {
  await requireDb().run(
    'UPDATE sessions SET _deleted = 1, _sync_dirty = 1, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), id]
  )
}

export async function getDirtySessions(): Promise<LocalSession[]> {
  const result = await requireDb().query(
    'SELECT * FROM sessions WHERE _sync_dirty = 1'
  )
  return (result.values || []) as LocalSession[]
}

export async function clearSessionDirty(id: string): Promise<void> {
  await requireDb().run('UPDATE sessions SET _sync_dirty = 0 WHERE id = ?', [id])
}

export async function hardDeleteSyncedDeleted(): Promise<void> {
  await requireDb().run(
    'DELETE FROM sessions WHERE _deleted = 1 AND _sync_dirty = 0'
  )
  await requireDb().run(
    'DELETE FROM messages WHERE _deleted = 1 AND _sync_dirty = 0'
  )
  await requireDb().run(
    'DELETE FROM user_api_keys WHERE _deleted = 1 AND _sync_dirty = 0'
  )
}

// ==================== Messages ====================

export async function getMessages(sessionId: string): Promise<LocalMessage[]> {
  const result = await requireDb().query(
    'SELECT * FROM messages WHERE session_id = ? AND _deleted = 0 AND is_current = 1 ORDER BY created_at ASC',
    [sessionId]
  )
  return (result.values || []) as LocalMessage[]
}

export async function getAllMessages(sessionId: string): Promise<LocalMessage[]> {
  const result = await requireDb().query(
    'SELECT * FROM messages WHERE session_id = ? AND _deleted = 0 ORDER BY created_at ASC',
    [sessionId]
  )
  return (result.values || []) as LocalMessage[]
}

export async function upsertMessage(msg: Partial<LocalMessage> & { id: string }): Promise<void> {
  const now = new Date().toISOString()
  await requireDb().run(
    `INSERT INTO messages (id, session_id, parent_id, role, content, sql, chart_cfg, thinking, data,
       is_current, feedback, feedback_text, tokens_prompt, tokens_completion, created_at, _sync_dirty, _deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       content=excluded.content,
       sql=excluded.sql,
       chart_cfg=excluded.chart_cfg,
       thinking=excluded.thinking,
       data=excluded.data,
       is_current=excluded.is_current,
       feedback=excluded.feedback,
       feedback_text=excluded.feedback_text,
       _sync_dirty=excluded._sync_dirty,
       _deleted=excluded._deleted`,
    [
      msg.id,
      msg.session_id ?? '',
      msg.parent_id ?? null,
      msg.role ?? 'user',
      msg.content ?? '',
      msg.sql ?? null,
      msg.chart_cfg ?? null,
      msg.thinking ?? null,
      typeof msg.data === 'object' ? JSON.stringify(msg.data) : (msg.data ?? null),
      msg.is_current ?? 1,
      msg.feedback ?? 0,
      msg.feedback_text ?? null,
      msg.tokens_prompt ?? 0,
      msg.tokens_completion ?? 0,
      msg.created_at ?? now,
      msg._sync_dirty ?? 1,
      msg._deleted ?? 0,
    ]
  )
}

export async function updateMessageContent(id: string, updates: Partial<LocalMessage>): Promise<void> {
  const sets: string[] = []
  const vals: any[] = []
  if (updates.content !== undefined) { sets.push('content=?'); vals.push(updates.content) }
  if (updates.thinking !== undefined) { sets.push('thinking=?'); vals.push(updates.thinking) }
  if (updates.sql !== undefined) { sets.push('sql=?'); vals.push(updates.sql) }
  if (updates.chart_cfg !== undefined) { sets.push('chart_cfg=?'); vals.push(updates.chart_cfg) }
  if (updates.data !== undefined) {
    sets.push('data=?')
    vals.push(typeof updates.data === 'object' ? JSON.stringify(updates.data) : updates.data)
  }
  if (sets.length === 0) return
  sets.push('_sync_dirty=1')
  vals.push(id)
  await requireDb().run(`UPDATE messages SET ${sets.join(',')} WHERE id = ?`, vals)
}

export async function getDirtyMessages(): Promise<LocalMessage[]> {
  const result = await requireDb().query(
    'SELECT * FROM messages WHERE _sync_dirty = 1'
  )
  return (result.values || []) as LocalMessage[]
}

export async function clearMessageDirty(id: string): Promise<void> {
  await requireDb().run('UPDATE messages SET _sync_dirty = 0 WHERE id = ?', [id])
}

// ==================== API Keys ====================

export async function getApiKeys(userId: number): Promise<LocalApiKey[]> {
  const result = await requireDb().query(
    'SELECT * FROM user_api_keys WHERE user_id = ? AND _deleted = 0',
    [userId]
  )
  return (result.values || []) as LocalApiKey[]
}

export async function getApiKey(userId: number, provider: string): Promise<LocalApiKey | null> {
  const result = await requireDb().query(
    'SELECT * FROM user_api_keys WHERE user_id = ? AND provider = ? AND _deleted = 0',
    [userId, provider]
  )
  return (result.values?.[0] as LocalApiKey) || null
}

export async function upsertApiKey(key: LocalApiKey): Promise<void> {
  const now = new Date().toISOString()
  await requireDb().run(
    `INSERT INTO user_api_keys (id, user_id, provider, api_key, base_url, model_name, created_at, updated_at, _sync_dirty, _deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       api_key=excluded.api_key,
       base_url=excluded.base_url,
       model_name=excluded.model_name,
       updated_at=excluded.updated_at,
       _sync_dirty=excluded._sync_dirty,
       _deleted=excluded._deleted`,
    [
      key.id,
      key.user_id,
      key.provider,
      key.api_key,
      key.base_url ?? null,
      key.model_name ?? null,
      key.created_at ?? now,
      key.updated_at ?? now,
      key._sync_dirty ?? 1,
      key._deleted ?? 0,
    ]
  )
}

export async function softDeleteApiKey(userId: number, provider: string): Promise<void> {
  await requireDb().run(
    'UPDATE user_api_keys SET _deleted = 1, _sync_dirty = 1, updated_at = ? WHERE user_id = ? AND provider = ?',
    [new Date().toISOString(), userId, provider]
  )
}

export async function getDirtyApiKeys(): Promise<LocalApiKey[]> {
  const result = await requireDb().query(
    'SELECT * FROM user_api_keys WHERE _sync_dirty = 1'
  )
  return (result.values || []) as LocalApiKey[]
}

export async function clearApiKeyDirty(id: string): Promise<void> {
  await requireDb().run('UPDATE user_api_keys SET _sync_dirty = 0 WHERE id = ?', [id])
}

// ==================== User ID Migration ====================

export async function migrateUserId(fromId: number, toId: number): Promise<void> {
  const db = requireDb()
  // Mark messages dirty first (before sessions user_id changes)
  await db.run('UPDATE messages SET _sync_dirty = 1 WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)', [fromId])
  await db.run('UPDATE sessions SET user_id = ?, _sync_dirty = 1 WHERE user_id = ?', [toId, fromId])
  await db.run('UPDATE user_api_keys SET user_id = ?, _sync_dirty = 1 WHERE user_id = ?', [toId, fromId])
  console.log(`[DB] Migrated user_id ${fromId} → ${toId} (marked dirty)`)
}

// ==================== User Cache ====================

export async function upsertUser(user: { id: number; username: string; email: string; avatar_url?: string | null; created_at?: string | null; last_login?: string | null }): Promise<void> {
  await requireDb().run(
    `INSERT INTO users (id, username, email, avatar_url, created_at, last_login)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       username=excluded.username,
       email=excluded.email,
       avatar_url=excluded.avatar_url,
       last_login=excluded.last_login`,
    [user.id, user.username, user.email, user.avatar_url ?? null, user.created_at ?? null, user.last_login ?? null]
  )
}

// ==================== Local Accounts ====================

export async function upsertLocalAccount(account: {
  username: string; email: string; password_hash: string;
  avatar_url?: string | null; local_only?: number; server_id?: number | null
}): Promise<void> {
  const now = new Date().toISOString()
  await requireDb().run(
    `INSERT INTO local_accounts (username, email, password_hash, avatar_url, created_at, local_only, server_id)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET
       username=excluded.username,
       password_hash=excluded.password_hash,
       avatar_url=excluded.avatar_url,
       local_only=excluded.local_only,
       server_id=excluded.server_id,
       last_login=?`,
    [
      account.username,
      account.email,
      account.password_hash,
      account.avatar_url ?? null,
      now,
      account.local_only ?? 1,
      account.server_id ?? null,
      now,
    ]
  )
}

export async function getLocalAccount(email: string): Promise<LocalAccount | null> {
  const result = await requireDb().query(
    'SELECT * FROM local_accounts WHERE email = ?',
    [email]
  )
  return (result.values?.[0] as LocalAccount) || null
}

export async function getLocalOnlyAccounts(): Promise<LocalAccount[]> {
  const result = await requireDb().query(
    'SELECT * FROM local_accounts WHERE local_only = 1'
  )
  return (result.values || []) as LocalAccount[]
}

export async function updateLocalAccountServerId(email: string, serverId: number): Promise<void> {
  await requireDb().run(
    'UPDATE local_accounts SET server_id = ?, local_only = 0 WHERE email = ?',
    [serverId, email]
  )
}

// ==================== Business Data Tables ====================

export interface BizSyncMeta {
  db_key: string
  table_name: string
  synced_at: string | null
  row_count: number
}

/**
 * Create (or recreate) a business data table in SQLite.
 * tableName should be the full prefixed name, e.g. "biz_classic_business__orders".
 * columns: array of {name, sqliteType} where sqliteType is one of TEXT/INTEGER/REAL/BLOB.
 */
export async function createBusinessTable(
  tableName: string,
  columns: { name: string; sqliteType: string }[]
): Promise<void> {
  const db = requireDb()
  // Drop + recreate for a clean full sync
  await db.execute(`DROP TABLE IF EXISTS "${tableName}"`)
  const colDefs = columns.map(c => `"${c.name}" ${c.sqliteType}`).join(', ')
  await db.execute(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs})`)
}

/**
 * Bulk-insert rows into a business table using executeSet (batched transaction).
 * rows: array of value arrays, must match the column order of columns[].
 */
export async function bulkInsertBusinessRows(
  tableName: string,
  columns: string[],
  rows: (string | number | null)[][]
): Promise<void> {
  if (rows.length === 0) return
  const db = requireDb()
  const colList = columns.map(c => `"${c}"`).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const sql = `INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${placeholders})`
  const set = rows.map(values => ({ statement: sql, values }))
  await db.executeSet(set)
}

/**
 * Execute an arbitrary SQL query on the local SQLite database.
 * Used for offline AI query execution.
 */
export async function executeLocalQuery(sql: string): Promise<Record<string, unknown>[]> {
  const result = await requireDb().query(sql)
  return (result.values || []) as Record<string, unknown>[]
}

export async function getBizSyncMeta(dbKey: string): Promise<BizSyncMeta[]> {
  const result = await requireDb().query(
    'SELECT * FROM biz_sync_meta WHERE db_key = ?',
    [dbKey]
  )
  return (result.values || []) as BizSyncMeta[]
}

export async function getAllBizSyncMeta(): Promise<BizSyncMeta[]> {
  const result = await requireDb().query('SELECT * FROM biz_sync_meta')
  return (result.values || []) as BizSyncMeta[]
}

export async function upsertBizSyncMeta(meta: BizSyncMeta): Promise<void> {
  await requireDb().run(
    `INSERT INTO biz_sync_meta (db_key, table_name, synced_at, row_count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(db_key, table_name) DO UPDATE SET
       synced_at = excluded.synced_at,
       row_count = excluded.row_count`,
    [meta.db_key, meta.table_name, meta.synced_at, meta.row_count]
  )
}

export async function getLocalBizTables(dbKey: string): Promise<{ tableName: string; columns: string[] }[]> {
  if (!initialized) return []
  const safeKey = dbKey.replace(/[^a-zA-Z0-9]/g, '_')
  const prefix = `biz_${safeKey}__`
  try {
    const tables = await executeLocalQuery(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '${prefix}%' ORDER BY name`
    )
    const result: { tableName: string; columns: string[] }[] = []
    for (const t of tables) {
      const fullName = t.name as string
      const tableName = fullName.slice(prefix.length)
      try {
        const cols = await executeLocalQuery(`PRAGMA table_info("${fullName}")`)
        const columns = (cols as any[])
          .map((c: any) => c.name as string)
          .filter(n => !n.startsWith('_'))
        result.push({ tableName, columns })
      } catch { /* skip */ }
    }
    return result
  } catch { return [] }
}

export async function clearBizSyncMeta(dbKey: string): Promise<void> {
  await requireDb().run('DELETE FROM biz_sync_meta WHERE db_key = ?', [dbKey])
}

export const dbService = {
  init: initDb,
  getSessions,
  getSession,
  upsertSession,
  markSessionDirty,
  softDeleteSession,
  getDirtySessions,
  clearSessionDirty,
  hardDeleteSyncedDeleted,
  getMessages,
  getAllMessages,
  upsertMessage,
  updateMessageContent,
  getDirtyMessages,
  clearMessageDirty,
  getApiKeys,
  getApiKey,
  upsertApiKey,
  softDeleteApiKey,
  getDirtyApiKeys,
  clearApiKeyDirty,
  migrateUserId,
  upsertUser,
  createBusinessTable,
  bulkInsertBusinessRows,
  executeLocalQuery,
  getBizSyncMeta,
  getAllBizSyncMeta,
  upsertBizSyncMeta,
  clearBizSyncMeta,
  getLocalBizTables,
}

export default dbService
