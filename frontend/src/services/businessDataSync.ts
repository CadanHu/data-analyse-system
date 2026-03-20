/**
 * businessDataSync.ts — 业务数据库全量同步到本地 SQLite
 *
 * 仅在 iOS / Android 原生平台运行，Web 端所有函数均为安全 no-op。
 *
 * 流程:
 *   1. GET /api/biz-sync/schema/{db_key}       → 获取所有表结构
 *   2. 对每张表创建本地 SQLite 表（名称格式: biz_{db_key}__{table}）
 *   3. 分页 GET /api/biz-sync/data/{db_key}/{table}  → 下载数据
 *   4. 批量写入 SQLite
 *   5. 更新 biz_sync_meta
 */

import { Capacitor } from '@capacitor/core'
import { getBaseURL } from '../api'
import { useAuthStore } from '../stores/authStore'
import dbService, { BizSyncMeta, executeLocalQuery } from './db'
import { mysqlTypeToSQLite, bizTableName } from './sqlDialectConverter'

const PAGE_SIZE = 2000

export interface BizDbInfo {
  key: string
  name: string
  type: string
}

export interface SyncProgress {
  db_key: string
  table: string
  tableIndex: number
  totalTables: number
  rowsDone: number
  rowsTotal: number
  percent: number // 0–100
  message: string
}

export type ProgressCallback = (p: SyncProgress) => void

function getApiBase(): string {
  const base = getBaseURL()
  return base.endsWith('/') ? base.slice(0, -1) : base
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ==================== Public API ====================

/** List all syncable business databases from server */
export async function listBizDatabases(): Promise<BizDbInfo[]> {
  const data = await apiFetch<{ databases: BizDbInfo[] }>('/biz-sync/databases')
  return data.databases
}

/** Get local sync status — native only, returns [] on web */
export async function getAllSyncStatus(): Promise<BizSyncMeta[]> {
  if (!Capacitor.isNativePlatform()) return []
  try {
    return await dbService.getAllBizSyncMeta()
  } catch {
    return []
  }
}

/**
 * Sync all tables of a business database to local SQLite.
 * Native only — throws if called on web.
 *
 * @param force  true = 强制全量（drop+recreate 所有表）
 *               false (默认) = 增量：只同步新增或行数有变化的表
 */
export async function syncBusinessDatabase(
  dbKey: string,
  onProgress?: ProgressCallback,
  force = false
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('业务数据同步仅支持 iOS / Android 原生平台')
  }

  interface ServerTableMeta {
    row_count: number
    update_time: string | null  // ISO string from information_schema, null if unavailable
  }

  // 1. 获取服务端每张表的元数据（行数 + UPDATE_TIME）
  let serverMeta: Record<string, ServerTableMeta> = {}
  if (!force) {
    try {
      const metaResp = await apiFetch<{
        db_key: string
        tables: Array<{ table: string; row_count: number; update_time: string | null }>
      }>(`/biz-sync/meta/${dbKey}`)
      serverMeta = Object.fromEntries(
        metaResp.tables.map(t => [t.table, { row_count: t.row_count, update_time: t.update_time }])
      )
    } catch {
      // 若 meta 接口不可用则退化为全量
      force = true
    }
  }

  // 2. 获取本地已缓存的元数据
  const localMetaList = await dbService.getAllBizSyncMeta()
  const localMeta: Record<string, { row_count: number; synced_at: string | null }> = Object.fromEntries(
    localMetaList
      .filter(m => m.db_key === dbKey)
      .map(m => [m.table_name, { row_count: m.row_count ?? -1, synced_at: m.synced_at ?? null }])
  )

  // 3. Fetch schema
  const schemaResp = await apiFetch<{
    db_key: string
    tables: Array<{
      name: string
      columns: Array<{ name: string; type: string; nullable: boolean; primary_key: boolean }>
    }>
  }>(`/biz-sync/schema/${dbKey}`)
  const tables = schemaResp.tables

  // 增量模式下过滤出需要同步的表
  let tablesToSync: typeof tables
  if (force) {
    tablesToSync = tables
  } else {
    tablesToSync = []
    for (const t of tables) {
      const local = localMeta[t.name]

      // 未曾同步过 → 必须同步
      if (!local || local.row_count === -1) {
        tablesToSync.push(t)
        continue
      }

      const serverInfo = serverMeta[t.name]
      const serverUpdateTime = serverInfo?.update_time ?? null
      const localSyncedAt = local.synced_at

      if (serverUpdateTime && localSyncedAt) {
        // 优先用 UPDATE_TIME 判断：服务端有新修改则同步
        if (new Date(serverUpdateTime) > new Date(localSyncedAt)) {
          tablesToSync.push(t)
          continue
        }
        // UPDATE_TIME 未变，但还要检查列结构
      } else {
        // UPDATE_TIME 不可用 → fallback 到行数对比
        const serverCount = serverInfo?.row_count ?? -1
        if (serverCount !== local.row_count) {
          tablesToSync.push(t)
          continue
        }
      }

      // 最后检查列结构是否变化（ALTER TABLE ADD COLUMN）
      try {
        const localTableName = bizTableName(dbKey, t.name)
        const pragmaRows = await executeLocalQuery(`PRAGMA table_info("${localTableName}")`)
        const localCols = (pragmaRows as any[]).map(r => r.name as string).sort().join(',')
        const serverCols = t.columns.map(c => c.name).sort().join(',')
        if (localCols !== serverCols) {
          tablesToSync.push(t) // 列结构不同 → 需要重建
        }
      } catch {
        tablesToSync.push(t) // 无法读取本地表 → 保守起见同步
      }
    }
  }

  if (!force) {
    const skipped = tables.length - tablesToSync.length
    if (skipped > 0) {
      onProgress?.({
        db_key: dbKey,
        table: '',
        tableIndex: 0,
        totalTables: tables.length,
        rowsDone: 0,
        rowsTotal: 0,
        percent: 0,
        message: `增量检测：跳过 ${skipped} 张未变化的表，同步 ${tablesToSync.length} 张`,
      })
    }
    if (tablesToSync.length === 0) return
  } else {
    // 全量时清除旧 meta
    await dbService.clearBizSyncMeta(dbKey)
  }

  let tableIdx = 0
  for (const tableInfo of tablesToSync) {
    tableIdx++
    const localTableName = bizTableName(dbKey, tableInfo.name)

    // 4. Map columns to SQLite types
    const cols = tableInfo.columns.map(c => ({
      name: c.name,
      sqliteType: mysqlTypeToSQLite(c.type),
    }))

    // 5. Create local table (drop + recreate)
    await dbService.createBusinessTable(localTableName, cols)

    // 6. Paginate + insert
    let offset = 0
    let total = 0
    let done = 0

    while (true) {
      const pageResp = await apiFetch<{
        total: number
        rows: Record<string, unknown>[]
        has_more: boolean
      }>(`/biz-sync/data/${dbKey}/${tableInfo.name}?offset=${offset}&limit=${PAGE_SIZE}`)

      total = pageResp.total

      if (pageResp.rows.length > 0) {
        const colNames = cols.map(c => c.name)
        const rowArrays = pageResp.rows.map(row =>
          colNames.map(col => {
            const v = row[col]
            if (v === undefined || v === null) return null
            if (typeof v === 'object') return JSON.stringify(v)
            return v as string | number | null
          })
        )
        await dbService.bulkInsertBusinessRows(localTableName, colNames, rowArrays)
      }

      done += pageResp.rows.length
      offset += PAGE_SIZE

      const pct = total > 0
        ? Math.round(((tableIdx - 1) / tablesToSync.length + (done / total) / tablesToSync.length) * 100)
        : Math.round((tableIdx / tablesToSync.length) * 100)

      onProgress?.({
        db_key: dbKey,
        table: tableInfo.name,
        tableIndex: tableIdx,
        totalTables: tablesToSync.length,
        rowsDone: done,
        rowsTotal: total,
        percent: pct,
        message: `${tableInfo.name} (${done.toLocaleString()} / ${total.toLocaleString()})`,
      })

      if (!pageResp.has_more) break
    }

    // 7. Update meta
    await dbService.upsertBizSyncMeta({
      db_key: dbKey,
      table_name: tableInfo.name,
      synced_at: new Date().toISOString(),
      row_count: done,
    })
  }
}
