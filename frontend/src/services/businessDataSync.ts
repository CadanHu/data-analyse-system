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
import dbService, { BizSyncMeta } from './db'
import { mysqlTypeToSQLite, bizTableName } from './sqlDialectConverter'

const PAGE_SIZE = 500

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
 */
export async function syncBusinessDatabase(
  dbKey: string,
  onProgress?: ProgressCallback
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('业务数据同步仅支持 iOS / Android 原生平台')
  }

  // 1. Fetch schema
  const schemaResp = await apiFetch<{
    db_key: string
    tables: Array<{
      name: string
      columns: Array<{ name: string; type: string; nullable: boolean; primary_key: boolean }>
    }>
  }>(`/biz-sync/schema/${dbKey}`)
  const tables = schemaResp.tables

  // Clear old meta
  await dbService.clearBizSyncMeta(dbKey)

  let tableIdx = 0
  for (const tableInfo of tables) {
    tableIdx++
    const localTableName = bizTableName(dbKey, tableInfo.name)

    // 2. Map columns to SQLite types
    const cols = tableInfo.columns.map(c => ({
      name: c.name,
      sqliteType: mysqlTypeToSQLite(c.type),
    }))

    // 3. Create local table (drop + recreate for full sync)
    await dbService.createBusinessTable(localTableName, cols)

    // 4. Paginate + insert
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
        ? Math.round(((tableIdx - 1) / tables.length + (done / total) / tables.length) * 100)
        : Math.round((tableIdx / tables.length) * 100)

      onProgress?.({
        db_key: dbKey,
        table: tableInfo.name,
        tableIndex: tableIdx,
        totalTables: tables.length,
        rowsDone: done,
        rowsTotal: total,
        percent: pct,
        message: `${tableInfo.name} (${done.toLocaleString()} / ${total.toLocaleString()})`,
      })

      if (!pageResp.has_more) break
    }

    // 5. Update meta
    await dbService.upsertBizSyncMeta({
      db_key: dbKey,
      table_name: tableInfo.name,
      synced_at: new Date().toISOString(),
      row_count: done,
    })
  }
}
