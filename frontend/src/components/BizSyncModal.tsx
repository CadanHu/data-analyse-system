/**
 * BizSyncModal.tsx — 业务数据库离线同步管理面板
 *
 * 三段式布局：
 *   1. 演示数据区块（方案A）— 内置数据，零门槛
 *   2. 导入本地 CSV 区块（方案B）— 导入自己的数据
 *   3. 服务器同步区块 — 原有功能，仅联网时可用
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Database, RefreshCw, CheckCircle2, CloudOff,
  WifiOff, Upload, FileText, ChevronRight,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import {
  listBizDatabases,
  getAllSyncStatus,
  syncBusinessDatabase,
  BizDbInfo,
  SyncProgress,
} from '@/services/businessDataSync'
import { BizSyncMeta } from '@/services/db'
import { useAuthStore } from '@/stores/authStore'
import {
  DEMO_DB_KEY,
  isDemoDbInitialized,
  getDemoDbRowCount,
  initDemoDatabase,
  GA_DEMO_DB_KEY,
  isGlobalAnalysisDemoInitialized,
  getGaDbRowCount,
  initGlobalAnalysisDemo,
} from '@/services/demoDataService'
import {
  previewCsvFile,
  importCsvFile,
  CsvPreview,
} from '@/services/csvImportService'

interface Props {
  onClose: () => void
}

export default function BizSyncModal({ onClose }: Props) {
  const isMobile = Capacitor.isNativePlatform() || window.innerWidth < 768
  const { offlineMode, isAuthenticated } = useAuthStore()
  const isOfflineMode = offlineMode || !isAuthenticated

  // ── Server sync state ────────────────────────────────────────────────────
  const [databases, setDatabases] = useState<BizDbInfo[]>([])
  const [syncMeta, setSyncMeta] = useState<BizSyncMeta[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Demo data state (方案A — classic_business) ────────────────────────────
  const [demoInitialized, setDemoInitialized] = useState(false)
  const [demoRowCount, setDemoRowCount] = useState(0)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoProgress, setDemoProgress] = useState<SyncProgress | null>(null)
  const [demoError, setDemoError] = useState<string | null>(null)

  // ── Demo data state (方案A — global_analysis) ─────────────────────────────
  const [gaInitialized, setGaInitialized] = useState(false)
  const [gaRowCount, setGaRowCount] = useState(0)
  const [gaLoading, setGaLoading] = useState(false)
  const [gaProgress, setGaProgress] = useState<SyncProgress | null>(null)
  const [gaError, setGaError] = useState<string | null>(null)

  // ── CSV import state (方案B) ─────────────────────────────────────────────
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
  const [csvDbKey, setCsvDbKey] = useState('')
  const [csvTableName, setCsvTableName] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvProgress, setCsvProgress] = useState<SyncProgress | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [csvSuccess, setCsvSuccess] = useState<{ rowCount: number } | null>(null)
  const csvFileInputRef = useRef<HTMLInputElement>(null)

  const isAnySyncing = syncing !== null || demoLoading || gaLoading || csvImporting

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const meta = await getAllSyncStatus()
    setSyncMeta(meta)

    // Demo db status — classic_business
    const initialized = await isDemoDbInitialized()
    setDemoInitialized(initialized)
    if (initialized) setDemoRowCount(await getDemoDbRowCount())

    // Demo db status — global_analysis
    const gaInited = await isGlobalAnalysisDemoInitialized()
    setGaInitialized(gaInited)
    if (gaInited) setGaRowCount(await getGaDbRowCount())

    // Build server db list
    const localDbKeys = [...new Set(
      meta.filter(m => m.db_key !== DEMO_DB_KEY).map(m => m.db_key)
    )]
    const localDbs: BizDbInfo[] = localDbKeys.map(k => ({ key: k, name: k, type: 'local' }))
    if (localDbs.length > 0) setDatabases(localDbs)

    try {
      const serverDbs = await listBizDatabases()
      setDatabases(serverDbs)
    } catch {
      if (localDbs.length === 0) setError('无法连接服务器，且本地暂无已同步数据库')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Server sync handler ──────────────────────────────────────────────────
  const handleSync = useCallback(async (dbKey: string, force = false) => {
    setSyncing(dbKey)
    setError(null)
    setProgress(null)
    try {
      await syncBusinessDatabase(dbKey, p => setProgress(p), force)
      const meta = await getAllSyncStatus()
      setSyncMeta(meta)
    } catch (e) {
      setError(e instanceof Error ? e.message : '同步失败')
    } finally {
      setSyncing(null)
      setProgress(null)
    }
  }, [])

  // ── Demo data handlers (方案A) ────────────────────────────────────────────
  const handleDemoInit = useCallback(async (force = false) => {
    setDemoLoading(true)
    setDemoError(null)
    setDemoProgress(null)
    try {
      await initDemoDatabase(p => setDemoProgress(p), force)
      setDemoInitialized(true)
      setDemoRowCount(await getDemoDbRowCount())
      const meta = await getAllSyncStatus()
      setSyncMeta(meta)
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : '初始化失败')
    } finally {
      setDemoLoading(false)
      setDemoProgress(null)
    }
  }, [])

  // ── Global Analysis demo handler ──────────────────────────────────────────
  const handleGaInit = useCallback(async (force = false) => {
    setGaLoading(true)
    setGaError(null)
    setGaProgress(null)
    try {
      await initGlobalAnalysisDemo(p => setGaProgress(p), force)
      setGaInitialized(true)
      setGaRowCount(await getGaDbRowCount())
      const meta = await getAllSyncStatus()
      setSyncMeta(meta)
    } catch (e) {
      setGaError(e instanceof Error ? e.message : '初始化失败')
    } finally {
      setGaLoading(false)
      setGaProgress(null)
    }
  }, [])

  // ── CSV handlers (方案B) ─────────────────────────────────────────────────
  const handleCsvSelect = useCallback(async (file: File) => {
    setCsvFile(file)
    setCsvPreview(null)
    setCsvError(null)
    setCsvSuccess(null)
    // Auto-fill table name from filename
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '_').toLowerCase()
    setCsvTableName(base || 'imported')
    if (!csvDbKey) setCsvDbKey('csv_import')
    try {
      const preview = await previewCsvFile(file)
      setCsvPreview(preview)
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : 'CSV 预览失败')
    }
  }, [csvDbKey])

  const handleCsvImport = useCallback(async () => {
    if (!csvFile) return
    const dbKey = csvDbKey.trim() || 'csv_import'
    const tableName = csvTableName.trim() || 'imported'
    setCsvImporting(true)
    setCsvError(null)
    setCsvProgress(null)
    try {
      const result = await importCsvFile(csvFile, dbKey, tableName, p => setCsvProgress(p))
      setCsvSuccess({ rowCount: result.rowCount })
      setCsvFile(null)
      setCsvPreview(null)
      const meta = await getAllSyncStatus()
      setSyncMeta(meta)
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : 'CSV 导入失败')
    } finally {
      setCsvImporting(false)
      setCsvProgress(null)
    }
  }, [csvFile, csvDbKey, csvTableName])

  const resetCsvImport = useCallback(() => {
    setCsvFile(null)
    setCsvPreview(null)
    setCsvDbKey('')
    setCsvTableName('')
    setCsvError(null)
    setCsvSuccess(null)
    if (csvFileInputRef.current) csvFileInputRef.current.value = ''
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getSyncedAt(dbKey: string): string | null {
    const entries = syncMeta.filter(m => m.db_key === dbKey)
    if (entries.length === 0) return null
    const times = entries.map(e => e.synced_at).filter(Boolean) as string[]
    if (times.length === 0) return null
    const sorted = times.sort()
    return sorted[sorted.length - 1] ?? null
  }

  function getTotalRows(dbKey: string): number {
    return syncMeta.filter(m => m.db_key === dbKey).reduce((s, m) => s + (m.row_count || 0), 0)
  }

  function formatSyncedAt(iso: string): string {
    const d = new Date(iso)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const inner = (
    <div
      className={isMobile
        ? 'bg-white rounded-t-2xl w-full max-h-[90vh] flex flex-col'
        : 'bg-white rounded-xl w-full max-w-lg mx-4 flex flex-col shadow-2xl'}
      style={{ overflowY: 'auto' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-blue-600" />
          <span className="text-base font-semibold text-gray-800">数据管理</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
          disabled={isAnySyncing}
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* ── 方案A：演示数据区块 ─────────────────────────────────────── */}
        <div className="border border-green-200 bg-green-50/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-green-600" />
            <span className="text-sm font-semibold text-green-800">内置演示数据</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">无需后端</span>
          </div>

          {demoError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {demoError}
            </div>
          )}

          {demoProgress ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-green-700 font-medium">
                <span>初始化中: {demoProgress.message}</span>
                <span>{demoProgress.percent}%</span>
              </div>
              <div className="h-2 bg-green-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${demoProgress.percent}%` }}
                />
              </div>
              <div className="text-xs text-green-600">
                第 {demoProgress.tableIndex} / {demoProgress.totalTables} 张表 ·&nbsp;
                {demoProgress.rowsDone.toLocaleString()} / {demoProgress.rowsTotal.toLocaleString()} 行
              </div>
            </div>
          ) : demoInitialized ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-green-500" />
                <span className="text-xs text-gray-600">
                  已加载 <strong>{demoRowCount.toLocaleString()}</strong> 行演示数据
                </span>
              </div>
              <button
                onClick={() => handleDemoInit(true)}
                disabled={isAnySyncing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw size={11} />
                重新初始化
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">~12,440 行样本数据，立即体验 AI 分析</p>
              <button
                onClick={() => handleDemoInit(false)}
                disabled={isAnySyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                <ChevronRight size={14} />
                加载演示数据
              </button>
            </div>
          )}
        </div>

        {/* ── 方案A-2：global_analysis 演示数据区块 ───────────────────── */}
        <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-purple-600" />
            <span className="text-sm font-semibold text-purple-800">全场景分析演示数据</span>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">无需后端</span>
          </div>
          <p className="text-xs text-gray-500">雷达图、留存分析、多组织对比等进阶场景所需数据</p>

          {gaError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {gaError}
            </div>
          )}

          {gaProgress ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-purple-700 font-medium">
                <span>初始化中: {gaProgress.message}</span>
                <span>{gaProgress.percent}%</span>
              </div>
              <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${gaProgress.percent}%` }}
                />
              </div>
              <div className="text-xs text-purple-600">
                第 {gaProgress.tableIndex} / {gaProgress.totalTables} 张表 ·&nbsp;
                {gaProgress.rowsDone.toLocaleString()} / {gaProgress.rowsTotal.toLocaleString()} 行
              </div>
            </div>
          ) : gaInitialized ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-purple-500" />
                <span className="text-xs text-gray-600">
                  已加载 <strong>{gaRowCount.toLocaleString()}</strong> 行演示数据
                </span>
              </div>
              <button
                onClick={() => handleGaInit(true)}
                disabled={isAnySyncing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw size={11} />
                重新初始化
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">含留存队列、产品性能、预测等 7 张表</p>
              <button
                onClick={() => handleGaInit(false)}
                disabled={isAnySyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                <ChevronRight size={14} />
                加载演示数据
              </button>
            </div>
          )}
        </div>

        {/* ── 方案B：CSV 导入区块 ─────────────────────────────────────── */}
        <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload size={15} className="text-blue-600" />
            <span className="text-sm font-semibold text-blue-800">导入本地 CSV / Excel</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">分析自己的数据</span>
          </div>

          {csvError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {csvError}
            </div>
          )}

          {csvSuccess ? (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-green-500" />
                <span className="text-xs text-green-700">
                  成功导入 <strong>{csvSuccess.rowCount.toLocaleString()}</strong> 行
                </span>
              </div>
              <button
                onClick={resetCsvImport}
                className="text-xs text-blue-600 hover:underline"
              >
                再次导入
              </button>
            </div>
          ) : csvProgress ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-blue-700 font-medium">
                <span>导入中: {csvProgress.message}</span>
                <span>{csvProgress.percent}%</span>
              </div>
              <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${csvProgress.percent}%` }}
                />
              </div>
            </div>
          ) : csvFile && csvPreview ? (
            <div className="space-y-3">
              {/* File info */}
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <FileText size={13} className="text-blue-500" />
                <span className="font-medium truncate max-w-[200px]">{csvFile.name}</span>
                <span className="text-gray-400">· {csvPreview.headers.length} 列</span>
              </div>

              {/* Column type badges */}
              <div className="flex flex-wrap gap-1">
                {csvPreview.headers.map((h, i) => (
                  <span
                    key={h}
                    className={[
                      'text-xs px-2 py-0.5 rounded-full border',
                      csvPreview.types[i] === 'INTEGER' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                      csvPreview.types[i] === 'REAL'    ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                                          'bg-gray-50 border-gray-200 text-gray-600',
                    ].join(' ')}
                  >
                    {h} <span className="opacity-60">{csvPreview.types[i]}</span>
                  </span>
                ))}
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {csvPreview.headers.map(h => (
                        <th key={h} className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-gray-100">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[120px] truncate">
                            {cell === null ? <span className="text-gray-300">null</span> : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Form inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">数据库名</label>
                  <input
                    type="text"
                    value={csvDbKey}
                    onChange={e => setCsvDbKey(e.target.value)}
                    placeholder="csv_import"
                    className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">表名</label>
                  <input
                    type="text"
                    value={csvTableName}
                    onChange={e => setCsvTableName(e.target.value)}
                    placeholder="imported"
                    className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={resetCsvImport}
                  disabled={csvImporting}
                  className="flex-1 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  重新选择
                </button>
                <button
                  onClick={handleCsvImport}
                  disabled={csvImporting || isAnySyncing}
                  className="flex-1 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  确认导入
                </button>
              </div>
            </div>
          ) : (
            /* File picker button */
            <button
              onClick={() => csvFileInputRef.current?.click()}
              disabled={isAnySyncing}
              className="w-full border-2 border-dashed border-blue-200 rounded-xl py-6 flex flex-col items-center gap-2 text-blue-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
            >
              <Upload size={22} />
              <span className="text-sm">选择 CSV / Excel 文件</span>
              <span className="text-xs text-gray-400">支持 .csv / .xlsx / .xls，列名自动识别，取第一个 Sheet</span>
            </button>
          )}

          <input
            ref={csvFileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleCsvSelect(f)
            }}
          />
        </div>

        {/* ── 服务器同步区块 ──────────────────────────────────────────── */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">服务器同步</span>
          </div>

          {isOfflineMode ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-2 text-center">
              <WifiOff size={28} className="text-gray-300" />
              <p className="text-xs text-gray-400 leading-relaxed">
                离线模式下无法同步数据库。<br />
                请先连接服务器并登录后再操作。
              </p>
            </div>
          ) : (<>

          <p className="text-xs text-gray-400 leading-relaxed">
            将服务器业务数据库同步到手机本地，建议在 Wi-Fi 环境下操作。
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {progress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-1.5">
              <div className="flex justify-between text-xs text-blue-700 font-medium">
                <span>同步中: {progress.message}</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="text-xs text-blue-600">
                第 {progress.tableIndex} / {progress.totalTables} 张表 ·&nbsp;
                {progress.rowsDone.toLocaleString()} / {progress.rowsTotal.toLocaleString()} 行
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-4 text-gray-400 text-xs">加载中…</div>
          ) : databases.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-xs">
              <CloudOff size={24} className="mx-auto mb-1 opacity-40" />
              无法获取数据库列表（请确保已连接服务器）
            </div>
          ) : (
            databases.map(dbInfo => {
              const syncedAt = getSyncedAt(dbInfo.key)
              const totalRows = getTotalRows(dbInfo.key)
              const isSyncing = syncing === dbInfo.key
              return (
                <div key={dbInfo.key} className="border border-gray-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm">{dbInfo.name}</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {dbInfo.type}
                        </span>
                      </div>
                      {syncedAt ? (
                        <div className="flex items-center gap-1 mt-1">
                          <CheckCircle2 size={11} className="text-green-500" />
                          <span className="text-xs text-gray-500">
                            已同步 {totalRows.toLocaleString()} 行 · {formatSyncedAt(syncedAt)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 mt-1 block">尚未同步</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {syncedAt && (
                        <button
                          onClick={() => handleSync(dbInfo.key, true)}
                          disabled={isAnySyncing}
                          title="清空本地缓存并重新下载全部数据"
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          全量
                        </button>
                      )}
                      <button
                        onClick={() => handleSync(dbInfo.key, false)}
                        disabled={isAnySyncing}
                        className={[
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                          isAnySyncing
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : syncedAt
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-blue-600 text-white hover:bg-blue-700',
                        ].join(' ')}
                      >
                        <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? '同步中…' : syncedAt ? '增量更新' : '立即同步'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          </>)}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          数据加载完成后，离线模式下 AI 生成的 SQL 将自动在本地执行
        </p>
      </div>
    </div>
  )

  const overlay = (
    <div
      className={[
        'fixed inset-0 z-50',
        isMobile ? 'flex flex-col justify-end' : 'flex items-center justify-center',
        'bg-black/50',
      ].join(' ')}
      onClick={e => { if (e.target === e.currentTarget && !isAnySyncing) onClose() }}
    >
      {inner}
    </div>
  )

  return createPortal(overlay, document.body)
}
