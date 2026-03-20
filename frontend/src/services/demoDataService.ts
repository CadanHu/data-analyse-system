/**
 * demoDataService.ts — 方案A：内置演示数据库初始化
 *
 * 将 demoData.ts 中的静态数据写入本地 SQLite，
 * 无需后端，零门槛开箱即用。
 */

import { Capacitor } from '@capacitor/core'
import { DemoTables, DemoRows, GlobalAnalysisTables, GlobalAnalysisRows } from './demoData'
import { bizTableName } from './sqlDialectConverter'
import {
  createBusinessTable,
  bulkInsertBusinessRows,
  upsertBizSyncMeta,
  clearBizSyncMeta,
  getAllBizSyncMeta,
} from './db'
import type { ProgressCallback, SyncProgress } from './businessDataSync'

export const DEMO_DB_KEY = 'demo_classic_business'
export const GA_DEMO_DB_KEY = 'global_analysis'

const BATCH_SIZE = 500

/** 检查演示库是否已完整初始化（所有表均在 biz_sync_meta 中） */
export async function isDemoDbInitialized(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const meta = await getAllBizSyncMeta()
    const demoMeta = meta.filter(m => m.db_key === DEMO_DB_KEY)
    const expectedTables = Object.keys(DemoTables)
    return expectedTables.every(tbl => demoMeta.some(m => m.table_name === tbl))
  } catch {
    return false
  }
}

/** 获取演示库已存储的总行数（用于 UI 显示） */
export async function getDemoDbRowCount(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0
  try {
    const meta = await getAllBizSyncMeta()
    return meta
      .filter(m => m.db_key === DEMO_DB_KEY)
      .reduce((s, m) => s + (m.row_count || 0), 0)
  } catch {
    return 0
  }
}

/**
 * 初始化（或重新初始化）演示库。
 * @param onProgress  进度回调（可选）
 * @param force       true 时强制重建（先清除 meta）
 */
export async function initDemoDatabase(
  onProgress?: ProgressCallback,
  force = false
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  if (!force && (await isDemoDbInitialized())) return

  await clearBizSyncMeta(DEMO_DB_KEY)

  const tableNames = Object.keys(DemoTables)
  const totalRows = tableNames.reduce((s, t) => s + DemoRows[t].length, 0)
  let globalDone = 0

  for (let ti = 0; ti < tableNames.length; ti++) {
    const tbl = tableNames[ti]
    const cols = DemoTables[tbl]
    const rows = DemoRows[tbl]
    const colNames = cols.map(c => c.name)
    const localTableName = bizTableName(DEMO_DB_KEY, tbl)

    // Create (drop + recreate) table
    await createBusinessTable(localTableName, cols)

    // Insert in batches
    let batchDone = 0
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE)
      await bulkInsertBusinessRows(localTableName, colNames, batch)
      batchDone += batch.length
      globalDone += batch.length

      const percent = totalRows > 0 ? Math.round((globalDone / totalRows) * 100) : 0
      const progress: SyncProgress = {
        db_key: DEMO_DB_KEY,
        table: tbl,
        tableIndex: ti + 1,
        totalTables: tableNames.length,
        rowsDone: batchDone,
        rowsTotal: rows.length,
        percent,
        message: `${tbl} (${batchDone.toLocaleString()} / ${rows.length.toLocaleString()})`,
      }
      onProgress?.(progress)
    }

    // Update meta for this table
    await upsertBizSyncMeta({
      db_key: DEMO_DB_KEY,
      table_name: tbl,
      synced_at: new Date().toISOString(),
      row_count: rows.length,
    })
  }
}

/** 获取 global_analysis 演示库已存储的总行数 */
export async function getGaDbRowCount(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0
  try {
    const meta = await getAllBizSyncMeta()
    return meta
      .filter(m => m.db_key === GA_DEMO_DB_KEY)
      .reduce((s, m) => s + (m.row_count || 0), 0)
  } catch {
    return 0
  }
}

/** 检查 global_analysis 演示库是否已完整初始化 */
export async function isGlobalAnalysisDemoInitialized(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const meta = await getAllBizSyncMeta()
    const gaMeta = meta.filter(m => m.db_key === GA_DEMO_DB_KEY)
    const expectedTables = Object.keys(GlobalAnalysisTables)
    return expectedTables.every(tbl => gaMeta.some(m => m.table_name === tbl))
  } catch {
    return false
  }
}

/**
 * 初始化（或重新初始化）global_analysis 演示库。
 * 当手机未连接服务器时，从内置静态数据写入本地 SQLite。
 * @param onProgress  进度回调（可选）
 * @param force       true 时强制重建（先清除 meta）
 */
export async function initGlobalAnalysisDemo(
  onProgress?: ProgressCallback,
  force = false
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  if (!force && (await isGlobalAnalysisDemoInitialized())) return

  await clearBizSyncMeta(GA_DEMO_DB_KEY)

  const tableNames = Object.keys(GlobalAnalysisTables)
  const totalRows = tableNames.reduce((s, t) => s + GlobalAnalysisRows[t].length, 0)
  let globalDone = 0

  for (let ti = 0; ti < tableNames.length; ti++) {
    const tbl = tableNames[ti]
    const cols = GlobalAnalysisTables[tbl]
    const rows = GlobalAnalysisRows[tbl]
    const colNames = cols.map(c => c.name)
    const localTableName = bizTableName(GA_DEMO_DB_KEY, tbl)

    await createBusinessTable(localTableName, cols)

    let batchDone = 0
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE)
      await bulkInsertBusinessRows(localTableName, colNames, batch)
      batchDone += batch.length
      globalDone += batch.length

      const percent = totalRows > 0 ? Math.round((globalDone / totalRows) * 100) : 0
      const progress: SyncProgress = {
        db_key: GA_DEMO_DB_KEY,
        table: tbl,
        tableIndex: ti + 1,
        totalTables: tableNames.length,
        rowsDone: batchDone,
        rowsTotal: rows.length,
        percent,
        message: `${tbl} (${batchDone.toLocaleString()} / ${rows.length.toLocaleString()})`,
      }
      onProgress?.(progress)
    }

    await upsertBizSyncMeta({
      db_key: GA_DEMO_DB_KEY,
      table_name: tbl,
      synced_at: new Date().toISOString(),
      row_count: rows.length,
    })
  }
}
