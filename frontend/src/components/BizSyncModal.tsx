/**
 * BizSyncModal.tsx — 业务数据库离线同步管理面板
 * 手机端: 底部弹出 sheet
 * PC 端: 固定居中弹窗
 */
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Database, RefreshCw, CheckCircle2, CloudOff, ChevronRight, WifiOff } from 'lucide-react'
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

interface Props {
  onClose: () => void
}

export default function BizSyncModal({ onClose }: Props) {
  const isMobile = Capacitor.isNativePlatform() || window.innerWidth < 768
  const { offlineMode, isAuthenticated } = useAuthStore()
  const isOfflineMode = offlineMode || !isAuthenticated

  const [databases, setDatabases] = useState<BizDbInfo[]>([])
  const [syncMeta, setSyncMeta] = useState<BizSyncMeta[]>([])
  const [syncing, setSyncing] = useState<string | null>(null) // db_key currently syncing
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Always load local sync status first (works offline)
    const meta = await getAllSyncStatus()
    setSyncMeta(meta)

    // Build database list: start from locally synced ones, supplement with server list
    const localDbKeys = [...new Set(meta.map(m => m.db_key))]
    const localDbs: BizDbInfo[] = localDbKeys.map(k => ({ key: k, name: k, type: 'local' }))
    if (localDbs.length > 0) setDatabases(localDbs)

    // Try to get full list from server (adds unsynced databases)
    try {
      const serverDbs = await listBizDatabases()
      // Merge: server list is authoritative for names/types, keep local ones if server unreachable
      setDatabases(serverDbs)
    } catch {
      // Server unreachable — keep locally known databases, clear error if we have local data
      if (localDbs.length === 0) setError('无法连接服务器，且本地暂无已同步数据库')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = useCallback(async (dbKey: string) => {
    setSyncing(dbKey)
    setError(null)
    setProgress(null)
    try {
      await syncBusinessDatabase(dbKey, (p) => setProgress(p))
      // Refresh meta after sync
      const meta = await getAllSyncStatus()
      setSyncMeta(meta)
    } catch (e) {
      setError(e instanceof Error ? e.message : '同步失败')
    } finally {
      setSyncing(null)
      setProgress(null)
    }
  }, [])

  function getSyncedAt(dbKey: string): string | null {
    const entries = syncMeta.filter(m => m.db_key === dbKey)
    if (entries.length === 0) return null
    // Return the oldest synced_at (all tables done)
    const times = entries.map(e => e.synced_at).filter(Boolean) as string[]
    if (times.length === 0) return null
    // Return the most recent sync time
    return times.sort().at(-1) ?? null
  }

  function getTotalRows(dbKey: string): number {
    return syncMeta.filter(m => m.db_key === dbKey).reduce((s, m) => s + (m.row_count || 0), 0)
  }

  function formatSyncedAt(iso: string): string {
    const d = new Date(iso)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  const isAnySyncing = syncing !== null

  // ---- Layout ----
  const inner = (
    <div
      className={isMobile
        ? 'bg-white rounded-t-2xl w-full max-h-[85vh] flex flex-col'
        : 'bg-white rounded-xl w-full max-w-lg mx-4 flex flex-col shadow-2xl'}
      style={{ overflowY: 'auto' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-blue-600" />
          <span className="text-base font-semibold text-gray-800">离线数据同步</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
          disabled={isAnySyncing}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Offline mode: cannot sync */}
        {isOfflineMode ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center">
            <WifiOff size={36} className="text-gray-300" />
            <p className="text-sm text-gray-500 leading-relaxed">
              离线模式下无法同步数据库。<br />
              请先连接服务器并登录后再操作。
            </p>
          </div>
        ) : (<>

        {/* Explain */}
        <p className="text-sm text-gray-500 leading-relaxed">
          将业务数据库同步到手机本地，离线时 AI 可直接查询本地数据。
          首次同步时间较长，建议在 Wi-Fi 环境下操作。
        </p>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Progress bar */}
        {progress && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-2">
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

        {/* Database list */}
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">加载中…</div>
        ) : databases.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <CloudOff size={32} className="mx-auto mb-2 opacity-40" />
            无法获取数据库列表（请确保已连接服务器）
          </div>
        ) : (
          databases.map(db => {
            const syncedAt = getSyncedAt(db.key)
            const totalRows = getTotalRows(db.key)
            const isSyncing = syncing === db.key
            return (
              <div
                key={db.key}
                className="border border-gray-200 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 text-sm">{db.name}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {db.type}
                      </span>
                    </div>
                    {syncedAt ? (
                      <div className="flex items-center gap-1 mt-1">
                        <CheckCircle2 size={12} className="text-green-500" />
                        <span className="text-xs text-gray-500">
                          已同步 {totalRows.toLocaleString()} 行 · {formatSyncedAt(syncedAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 mt-1 block">尚未同步</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleSync(db.key)}
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
                    <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing ? '同步中…' : syncedAt ? '重新同步' : '立即同步'}
                  </button>
                </div>
              </div>
            )
          })
        )}
        </>)}
      </div>

      {/* Footer notice */}
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          同步完成后，离线模式下 AI 生成的 SQL 将自动在本地执行
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
      onClick={(e) => { if (e.target === e.currentTarget && !isAnySyncing) onClose() }}
    >
      {inner}
    </div>
  )

  return createPortal(overlay, document.body)
}
