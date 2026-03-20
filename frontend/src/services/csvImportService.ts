/**
 * csvImportService.ts — 方案B：从本地 CSV / XLSX / XLS 文件导入数据到 SQLite
 *
 * CSV 依赖 papaparse；XLSX/XLS 依赖 SheetJS (xlsx)
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Capacitor } from '@capacitor/core'
import { bizTableName } from './sqlDialectConverter'
import {
  createBusinessTable,
  bulkInsertBusinessRows,
  upsertBizSyncMeta,
} from './db'
import type { ProgressCallback } from './businessDataSync'

export interface CsvPreview {
  headers: string[]
  rawHeaders: string[]
  types: string[]
  rows: (string | number | null)[][]
}

const BATCH_SIZE = 500

/** 清洗列名为合法 SQLite 标识符 */
function sanitizeIdentifier(s: string): string {
  let result = s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[0-9_]+/, '')
    .slice(0, 64)
  return result || 'col'
}

/** 推断 SQLite 类型 */
function inferSqliteType(values: (string | number | null)[]): string {
  const nonNull = values.filter(v => v !== null && v !== '')
  if (nonNull.length === 0) return 'TEXT'

  if (nonNull.every(v => {
    const n = Number(v)
    return !isNaN(n) && Number.isInteger(n)
  })) return 'INTEGER'

  if (nonNull.every(v => {
    const n = Number(v)
    return !isNaN(n) && isFinite(n)
  })) return 'REAL'

  return 'TEXT'
}

function normalizeValue(v: unknown): string | number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return v
  return String(v)
}

function isExcelFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name)
}

/** 用 SheetJS 解析 XLSX/XLS，取第一个 Sheet，返回与 papaparse 相同的数据结构 */
async function parseExcelFile(file: File): Promise<{ rawHeaders: string[]; allRows: (string | number | null)[][] }> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const jsonRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false,    // 日期统一转为字符串，避免序列号
  })

  if (jsonRows.length === 0) return { rawHeaders: [], allRows: [] }

  const rawHeaders = jsonRows[0].map(h => (h == null ? '' : String(h)))
  const allRows = jsonRows.slice(1).map(row =>
    rawHeaders.map((_, ci) => normalizeValue(row[ci]))
  )
  return { rawHeaders, allRows }
}

/** 解析 CSV/XLSX/XLS 文件并返回预览（不导入数据库） */
export async function previewCsvFile(file: File, maxRows = 5): Promise<CsvPreview> {
  if (isExcelFile(file)) {
    const { rawHeaders, allRows } = await parseExcelFile(file)
    const headers = rawHeaders.map(sanitizeIdentifier)
    const types = headers.map((_, ci) => inferSqliteType(allRows.map(r => r[ci])))
    return { headers, rawHeaders, types, rows: allRows.slice(0, maxRows) }
  }

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete(result) {
        const rawHeaders: string[] = result.meta.fields ?? []
        const headers = rawHeaders.map(sanitizeIdentifier)

        const allRows = (result.data as Record<string, unknown>[]).map(row =>
          rawHeaders.map(h => normalizeValue(row[h]))
        )

        const types = headers.map((_, ci) => {
          const colValues = allRows.map(r => r[ci])
          return inferSqliteType(colValues)
        })

        const previewRows = allRows.slice(0, maxRows)
        resolve({ headers, rawHeaders, types, rows: previewRows })
      },
      error(err) {
        reject(new Error(`CSV 解析失败: ${err.message}`))
      },
    })
  })
}

async function writeRowsToSQLite(
  headers: string[],
  allRows: (string | number | null)[][],
  dbKey: string,
  tableName: string,
  onProgress?: ProgressCallback
): Promise<{ rowCount: number; dbKey: string; tableName: string }> {
  const colDefs = headers.map((name, ci) => ({
    name,
    sqliteType: inferSqliteType(allRows.map(r => r[ci])),
  }))

  const localTableName = bizTableName(dbKey, tableName)
  await createBusinessTable(localTableName, colDefs)

  const total = allRows.length
  let done = 0

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const batch = allRows.slice(offset, offset + BATCH_SIZE)
    await bulkInsertBusinessRows(localTableName, headers, batch)
    done += batch.length

    const percent = total > 0 ? Math.round((done / total) * 100) : 100
    onProgress?.({
      db_key: dbKey,
      table: tableName,
      tableIndex: 1,
      totalTables: 1,
      rowsDone: done,
      rowsTotal: total,
      percent,
      message: `${tableName} (${done.toLocaleString()} / ${total.toLocaleString()})`,
    })
  }

  await upsertBizSyncMeta({
    db_key: dbKey,
    table_name: tableName,
    synced_at: new Date().toISOString(),
    row_count: total,
  })

  return { rowCount: total, dbKey, tableName }
}

/** 完整导入 CSV / XLSX / XLS 到本地 SQLite */
export async function importCsvFile(
  file: File,
  dbKey: string,
  tableName: string,
  onProgress?: ProgressCallback
): Promise<{ rowCount: number; dbKey: string; tableName: string }> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('数据导入仅支持 iOS / Android 原生平台')
  }

  if (isExcelFile(file)) {
    const { rawHeaders, allRows } = await parseExcelFile(file)
    const headers = rawHeaders.map(sanitizeIdentifier)
    return writeRowsToSQLite(headers, allRows, dbKey, tableName, onProgress)
  }

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      async complete(result) {
        try {
          const rawHeaders: string[] = result.meta.fields ?? []
          const headers = rawHeaders.map(sanitizeIdentifier)
          const allRows = (result.data as Record<string, unknown>[]).map(row =>
            rawHeaders.map(h => normalizeValue(row[h]))
          )
          resolve(await writeRowsToSQLite(headers, allRows, dbKey, tableName, onProgress))
        } catch (e) {
          reject(e)
        }
      },
      error(err) {
        reject(new Error(`CSV 解析失败: ${err.message}`))
      },
    })
  })
}
