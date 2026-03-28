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

export interface KnowledgeChunk {
  id: string
  user_id: number
  session_id: string | null
  doc_name: string
  chunk_index: number
  content: string
  embedding: string | null      // JSON float array, null if no embedding
  embedding_provider: string | null
  metadata: string | null       // JSON: {page?, section?}
  created_at: string
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

-- 知识块存储（mobile 本地知识抽取）
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                 TEXT    NOT NULL PRIMARY KEY,
  user_id            INTEGER NOT NULL,
  session_id         TEXT    NULL,
  doc_name           TEXT    NOT NULL,
  chunk_index        INTEGER NOT NULL DEFAULT 0,
  content            TEXT    NOT NULL,
  embedding          TEXT    NULL,
  embedding_provider TEXT    NULL,
  metadata           TEXT    NULL,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  _sync_dirty        INTEGER NOT NULL DEFAULT 1,
  _deleted           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_kc_user_session ON knowledge_chunks(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_kc_doc ON knowledge_chunks(doc_name);

-- FTS5 全文检索（无 embedding 时降级用）
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  content,
  content='knowledge_chunks',
  content_rowid='rowid',
  tokenize='unicode61'
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
const CURRENT_DB_VERSION = 3

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
    // v2→v3: add sync columns to knowledge_chunks (idempotent)
    for (const col of [
      'ALTER TABLE knowledge_chunks ADD COLUMN _sync_dirty INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE knowledge_chunks ADD COLUMN _deleted INTEGER NOT NULL DEFAULT 0',
      'CREATE INDEX IF NOT EXISTS idx_kc_sync ON knowledge_chunks(_sync_dirty)',
    ]) {
      try { await db.execute(col) } catch { /* column already exists */ }
    }
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
  await requireDb().run(
    'DELETE FROM knowledge_chunks WHERE _deleted = 1 AND _sync_dirty = 0'
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

/**
 * Pull 专用：只有当本地消息 _sync_dirty=0（无未推送改动）时才覆盖，
 * 防止服务器旧版本覆盖手机刚写入的新版本。
 */
export async function upsertMessageFromServer(msg: Partial<LocalMessage> & { id: string }): Promise<void> {
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
       _deleted=excluded._deleted
     WHERE messages._sync_dirty = 0`,
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
      msg._sync_dirty ?? 0,
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

// ==================== Knowledge Chunks ====================

export async function insertKnowledgeChunk(chunk: KnowledgeChunk & { _sync_dirty?: number }): Promise<void> {
  const d = requireDb()
  await d.run(
    `INSERT OR REPLACE INTO knowledge_chunks
       (id, user_id, session_id, doc_name, chunk_index, content, embedding, embedding_provider, metadata, created_at, _sync_dirty, _deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
    [
      chunk.id, chunk.user_id, chunk.session_id ?? null, chunk.doc_name,
      chunk.chunk_index, chunk.content,
      chunk.embedding ?? null, chunk.embedding_provider ?? null,
      chunk.metadata ?? null, chunk.created_at,
      chunk._sync_dirty ?? 1,
    ]
  )
  // Keep FTS in sync (insert)
  await d.run(
    `INSERT INTO knowledge_fts(rowid, content)
     SELECT rowid, content FROM knowledge_chunks WHERE id = ?`,
    [chunk.id]
  )
}

/** 接收服务端 pull 下来的 chunk，不标记 dirty */
export async function upsertKnowledgeChunkFromServer(chunk: KnowledgeChunk): Promise<void> {
  const d = requireDb()
  // Only update if not locally dirty (last-write-wins: local edits take priority)
  const existing = await d.query('SELECT _sync_dirty FROM knowledge_chunks WHERE id = ?', [chunk.id])
  const local = existing.values?.[0] as { _sync_dirty: number } | undefined
  if (local && local._sync_dirty === 1) return  // local uncommitted change wins

  await d.run(
    `INSERT OR REPLACE INTO knowledge_chunks
       (id, user_id, session_id, doc_name, chunk_index, content, embedding, embedding_provider, metadata, created_at, _sync_dirty, _deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,0)`,
    [
      chunk.id, chunk.user_id, chunk.session_id ?? null, chunk.doc_name,
      chunk.chunk_index, chunk.content,
      chunk.embedding ?? null, chunk.embedding_provider ?? null,
      chunk.metadata ?? null, chunk.created_at,
    ]
  )
  // Refresh FTS
  await d.run(
    `INSERT OR IGNORE INTO knowledge_fts(rowid, content)
     SELECT rowid, content FROM knowledge_chunks WHERE id = ?`,
    [chunk.id]
  )
}

export async function getDirtyKnowledgeChunks(): Promise<(KnowledgeChunk & { _sync_dirty: number; _deleted: number })[]> {
  const result = await requireDb().query(
    'SELECT * FROM knowledge_chunks WHERE _sync_dirty = 1'
  )
  return (result.values || []) as (KnowledgeChunk & { _sync_dirty: number; _deleted: number })[]
}

export async function clearKnowledgeChunkDirty(id: string): Promise<void> {
  await requireDb().run('UPDATE knowledge_chunks SET _sync_dirty = 0 WHERE id = ?', [id])
}

/** 文档所有处理步骤（视觉识别 + 知识图谱）完成后，批量标记为待同步 */
export async function markDocChunksDirty(userId: number, docName: string): Promise<void> {
  await requireDb().run(
    'UPDATE knowledge_chunks SET _sync_dirty = 1 WHERE user_id = ? AND doc_name = ? AND _deleted = 0',
    [userId, docName]
  )
}

export async function softDeleteKnowledgeChunk(id: string): Promise<void> {
  await requireDb().run(
    'UPDATE knowledge_chunks SET _deleted = 1, _sync_dirty = 1 WHERE id = ?',
    [id]
  )
}

/** FTS5 关键词搜索，返回最相关的 topK 块 */
export async function searchKnowledgeFTS(
  userId: number, sessionId: string | null, query: string, topK = 5
): Promise<KnowledgeChunk[]> {
  const d = requireDb()
  // Escape FTS special chars
  const escaped = query.replace(/['"*^]/g, ' ')
  const res = await d.query(
    `SELECT kc.*
     FROM knowledge_chunks kc
     JOIN knowledge_fts fts ON kc.rowid = fts.rowid
     WHERE fts.content MATCH ?
       AND kc.user_id = ?
       ${sessionId != null ? 'AND kc.session_id = ?' : ''}
     ORDER BY fts.rank
     LIMIT ?`,
    sessionId != null ? [escaped, userId, sessionId, topK] : [escaped, userId, topK]
  )
  return (res.values || []) as KnowledgeChunk[]
}

/** 获取有 embedding 的所有块（用于 JS 侧余弦相似度计算） */
export async function getChunksWithEmbeddings(
  userId: number, sessionId: string | null
): Promise<KnowledgeChunk[]> {
  const d = requireDb()
  const res = await d.query(
    `SELECT * FROM knowledge_chunks
     WHERE user_id = ? AND embedding IS NOT NULL
     ${sessionId != null ? 'AND session_id = ?' : ''}`,
    sessionId != null ? [userId, sessionId] : [userId]
  )
  return (res.values || []) as KnowledgeChunk[]
}

/** 删除某文档的所有块（覆盖导入时用） */
export async function deleteDocChunks(userId: number, docName: string): Promise<void> {
  const d = requireDb()
  // Remove from FTS first
  await d.run(
    `INSERT INTO knowledge_fts(knowledge_fts, rowid, content)
     SELECT 'delete', rowid, content FROM knowledge_chunks
     WHERE user_id = ? AND doc_name = ?`,
    [userId, docName]
  )
  await d.run(
    'DELETE FROM knowledge_chunks WHERE user_id = ? AND doc_name = ?',
    [userId, docName]
  )
}

/** 获取某用户所有知识块（用于管理界面展示） */
export async function getAllKnowledgeChunks(userId: number): Promise<KnowledgeChunk[]> {
  const d = requireDb()
  const res = await d.query(
    `SELECT * FROM knowledge_chunks WHERE user_id = ? ORDER BY session_id, doc_name, chunk_index`,
    [userId]
  )
  return (res.values || []) as KnowledgeChunk[]
}

/** 更新知识块内容，同时清空旧向量并刷新 FTS 索引 */
export async function updateKnowledgeChunkContent(id: string, newContent: string): Promise<void> {
  const d = requireDb()
  // 删除 FTS 中的旧条目
  await d.run(
    `INSERT INTO knowledge_fts(knowledge_fts, rowid, content)
     SELECT 'delete', rowid, content FROM knowledge_chunks WHERE id = ?`,
    [id]
  )
  // 更新内容，清空已失效的向量
  await d.run(
    'UPDATE knowledge_chunks SET content = ?, embedding = NULL WHERE id = ?',
    [newContent, id]
  )
  // 将新内容写入 FTS
  await d.run(
    `INSERT INTO knowledge_fts(rowid, content)
     SELECT rowid, content FROM knowledge_chunks WHERE id = ?`,
    [id]
  )
}

/** 按 ID 删除单个知识块 */
export async function deleteKnowledgeChunkById(id: string): Promise<void> {
  const d = requireDb()
  await d.run(
    `INSERT INTO knowledge_fts(knowledge_fts, rowid, content)
     SELECT 'delete', rowid, content FROM knowledge_chunks WHERE id = ?`,
    [id]
  )
  await d.run('DELETE FROM knowledge_chunks WHERE id = ?', [id])
}

/** 按文档名删除某用户/会话的所有知识块 */
export async function deleteKnowledgeChunksByDoc(userId: number, sessionId: string | null, docName: string): Promise<void> {
  const d = requireDb()
  const condition = sessionId != null
    ? 'user_id = ? AND session_id = ? AND doc_name = ?'
    : 'user_id = ? AND doc_name = ?'
  const params = sessionId != null ? [userId, sessionId, docName] : [userId, docName]
  // 先从 FTS 中删除
  await d.run(
    `INSERT INTO knowledge_fts(knowledge_fts, rowid, content)
     SELECT 'delete', rowid, content FROM knowledge_chunks WHERE ${condition}`,
    params
  )
  await d.run(`DELETE FROM knowledge_chunks WHERE ${condition}`, params)
}

/** 列出某用户/会话已导入的文档 */
export async function listKnowledgeDocs(userId: number, sessionId: string | null): Promise<string[]> {
  const d = requireDb()
  const res = await d.query(
    `SELECT DISTINCT doc_name FROM knowledge_chunks
     WHERE user_id = ?
     ${sessionId != null ? 'AND session_id = ?' : ''}
     ORDER BY doc_name`,
    sessionId != null ? [userId, sessionId] : [userId]
  )
  return ((res.values || []) as any[]).map(r => r.doc_name)
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

export async function getLocalBizTables(dbKey: string): Promise<{ tableName: string; fullTableName: string; columns: string[] }[]> {
  if (!initialized) return []
  const safeKey = dbKey.replace(/[^a-zA-Z0-9]/g, '_')
  const prefix = `biz_${safeKey}__`
  try {
    const tables = await executeLocalQuery(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '${prefix}%' ORDER BY name`
    )
    const result: { tableName: string; fullTableName: string; columns: string[] }[] = []
    for (const t of tables) {
      const fullName = t.name as string
      const tableName = fullName.slice(prefix.length)
      try {
        const cols = await executeLocalQuery(`PRAGMA table_info("${fullName}")`)
        const columns = (cols as any[])
          .map((c: any) => c.name as string)
          .filter(n => !n.startsWith('_'))
        result.push({ tableName, fullTableName: fullName, columns })
      } catch { /* skip */ }
    }
    return result
  } catch { return [] }
}

export async function clearBizSyncMeta(dbKey: string): Promise<void> {
  await requireDb().run('DELETE FROM biz_sync_meta WHERE db_key = ?', [dbKey])
}

// ─── 知识图谱持久化（knowledge_entities / knowledge_relationships）──────────────

/** 将知识图谱写入 SQLite（覆盖同文档旧数据） */
export async function saveKnowledgeGraphToDb(
  docName: string,
  userId: number,
  entities: { id: string; text: string; type: string; description?: string }[],
  relations: { id: string; source: string; target: string; label: string }[]
): Promise<void> {
  const d = requireDb()
  const now = new Date().toISOString()
  const docId = `${userId}::${docName}`
  // 清旧数据
  await d.run('DELETE FROM knowledge_entities WHERE doc_id = ?', [docId])
  await d.run('DELETE FROM knowledge_relationships WHERE doc_id = ?', [docId])
  for (const e of entities) {
    await d.run(
      'INSERT INTO knowledge_entities (id, doc_id, entity_class, entity_text, attributes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [`${docId}::${e.id}`, docId, e.type, e.text, JSON.stringify({ description: e.description || '' }), now]
    )
  }
  for (const r of relations) {
    const srcText = entities.find(e => e.id === r.source)?.text ?? r.source
    const tgtText = entities.find(e => e.id === r.target)?.text ?? r.target
    await d.run(
      'INSERT INTO knowledge_relationships (id, doc_id, source_text, target_text, relation_type, attributes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`${docId}::${r.id}`, docId, srcText, tgtText, r.label, '{}', now]
    )
  }
}

/** 从 SQLite 读取知识图谱（app 重装后 localStorage 丢失时的恢复路径） */
export async function loadKnowledgeGraphFromDb(
  docName: string,
  userId: number
): Promise<{ entities: { id: string; text: string; type: string; description?: string }[]; relations: { id: string; source: string; target: string; label: string }[] } | null> {
  const d = requireDb()
  const docId = `${userId}::${docName}`
  const eRes = await d.query('SELECT * FROM knowledge_entities WHERE doc_id = ?', [docId])
  if (!eRes.values || eRes.values.length <= 1) return null   // 只有 ios_columns 行
  const rows = eRes.values.slice(1) as any[]
  const entities = rows.map((r, i) => {
    let desc = ''
    try { desc = JSON.parse(r.attributes || '{}').description || '' } catch { /* */ }
    return { id: `e${i + 1}`, text: r.entity_text, type: r.entity_class || 'Other', description: desc }
  })
  const idMap = new Map(entities.map(e => [e.text, e.id]))
  const rRes = await d.query('SELECT * FROM knowledge_relationships WHERE doc_id = ?', [docId])
  const rRows = ((rRes.values || []).slice(1)) as any[]
  const relations = rRows.map((r, i) => ({
    id: `r${i + 1}`,
    source: idMap.get(r.source_text) ?? `e1`,
    target: idMap.get(r.target_text) ?? `e2`,
    label: r.relation_type || '',
  }))
  return { entities, relations }
}

// ─── 知识图谱 GraphRAG 检索辅助函数 ──────────────────────────────────────────

/**
 * 获取用户在指定 session 下已建立图谱的所有文档 docId 列表。
 * 通过 knowledge_chunks 获取 doc_name，再构造 docId。
 */
export async function getGraphDocIdsForSession(
  userId: number,
  sessionId: string | null
): Promise<string[]> {
  const d = requireDb()
  const sql = sessionId
    ? 'SELECT DISTINCT doc_name FROM knowledge_chunks WHERE user_id = ? AND session_id = ? AND _deleted = 0'
    : 'SELECT DISTINCT doc_name FROM knowledge_chunks WHERE user_id = ? AND _deleted = 0'
  const params = sessionId ? [userId, sessionId] : [userId]
  const res = await d.query(sql, params)
  const rows = ((res.values || []).slice(1)) as any[]
  return rows.map(r => `${userId}::${r.doc_name}`)
}

/**
 * 在指定 docIds 范围内，找出所有「出现在 questionText 中」的实体名。
 * 查询方向：已知实体 → 问题文本（question LIKE '%entity_text%'），
 * 避免中文无分词时候选词提取不准确的问题。
 */
export async function findEntitiesInText(
  docIds: string[],
  questionText: string
): Promise<Array<{ docId: string; entityText: string; entityClass: string; description: string }>> {
  if (docIds.length === 0 || !questionText.trim()) return []
  const d = requireDb()
  const placeholders = docIds.map(() => '?').join(',')
  // SQLite: instr(questionText, entity_text) > 0  ↔  entity_text 出现在问题中
  const res = await d.query(
    `SELECT doc_id, entity_text, entity_class, attributes
     FROM knowledge_entities
     WHERE doc_id IN (${placeholders})
       AND instr(?, entity_text) > 0
       AND length(entity_text) >= 2
     LIMIT 15`,
    [...docIds, questionText]
  )
  const rows = ((res.values || []).slice(1)) as any[]
  return rows.map(r => {
    let description = ''
    try { description = JSON.parse(r.attributes || '{}').description || '' } catch { /* */ }
    return { docId: r.doc_id, entityText: r.entity_text, entityClass: r.entity_class || 'Other', description }
  })
}

/**
 * 查询涉及给定实体名（source 或 target）的所有关系，限定在 docIds 范围内。
 * 返回: [{source, relation, target}]
 */
export async function findRelationsForEntityNames(
  docIds: string[],
  entityTexts: string[]
): Promise<Array<{ source: string; relation: string; target: string }>> {
  if (docIds.length === 0 || entityTexts.length === 0) return []
  const d = requireDb()
  const docPlaceholders = docIds.map(() => '?').join(',')
  const results: Array<{ source: string; relation: string; target: string }> = []
  const seen = new Set<string>()

  for (const et of entityTexts.slice(0, 15)) {
    const res = await d.query(
      `SELECT source_text, target_text, relation_type
       FROM knowledge_relationships
       WHERE doc_id IN (${docPlaceholders})
         AND (source_text LIKE ? OR target_text LIKE ?)
       LIMIT 20`,
      [...docIds, `%${et}%`, `%${et}%`]
    )
    const rows = ((res.values || []).slice(1)) as any[]
    for (const r of rows) {
      const key = `${r.source_text}|${r.relation_type}|${r.target_text}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({ source: r.source_text, relation: r.relation_type || '', target: r.target_text })
      }
    }
  }
  return results.slice(0, 60)
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
  upsertMessageFromServer,
  updateMessageContent,
  getDirtyMessages,
  clearMessageDirty,
  getApiKeys,
  getApiKey,
  upsertApiKey,
  softDeleteApiKey,
  getDirtyApiKeys,
  clearApiKeyDirty,
  insertKnowledgeChunk,
  upsertKnowledgeChunkFromServer,
  getDirtyKnowledgeChunks,
  clearKnowledgeChunkDirty,
  softDeleteKnowledgeChunk,
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
