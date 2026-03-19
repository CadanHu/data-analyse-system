/**
 * StorageModal.tsx — 本地存储管理面板
 * 显示 SQLite 各表行数、业务数据占用，并支持清理业务缓存
 */
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Database, Trash2, RefreshCw, HardDrive, MessageSquare, FolderOpen } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { executeLocalQuery, getAllBizSyncMeta, clearBizSyncMeta } from '@/services/db'

interface TableStat {
  name: string
  rows: number
  label: string
  icon: React.ReactNode
  clearable?: boolean
  dbKey?: string
}

interface Props {
  onClose: () => void
  localUserId: number
}

export default function StorageModal({ onClose, localUserId }: Props) {
  const isMobile = Capacitor.isNativePlatform() || window.innerWidth < 768
  const [stats, setStats] = useState<TableStat[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      // Core table counts
      const [sessionsRes, messagesRes, keysRes, accountsRes] = await Promise.all([
        executeLocalQuery(`SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ${localUserId} AND _deleted = 0`),
        executeLocalQuery(`SELECT COUNT(*) as cnt FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ${localUserId} AND _deleted = 0)`),
        executeLocalQuery(`SELECT COUNT(*) as cnt FROM user_api_keys WHERE user_id = ${localUserId} AND _deleted = 0`),
        executeLocalQuery(`SELECT COUNT(*) as cnt FROM local_accounts`),
      ])

      const coreStats: TableStat[] = [
        { name: 'sessions',   label: '对话会话',    rows: (sessionsRes[0] as any)?.cnt ?? 0,  icon: <MessageSquare size={14} /> },
        { name: 'messages',   label: '聊天消息',    rows: (messagesRes[0] as any)?.cnt ?? 0,  icon: <MessageSquare size={14} /> },
        { name: 'api_keys',   label: 'API Keys',   rows: (keysRes[0] as any)?.cnt ?? 0,      icon: <Database size={14} /> },
        { name: 'accounts',   label: '本地账号',   rows: (accountsRes[0] as any)?.cnt ?? 0,  icon: <Database size={14} /> },
      ]

      // Biz sync databases
      const bizMeta = await getAllBizSyncMeta()
      const bizByDb: Record<string, { rows: number; synced_at: string | null }> = {}
      for (const m of bizMeta) {
        if (!bizByDb[m.db_key]) bizByDb[m.db_key] = { rows: 0, synced_at: m.synced_at }
        bizByDb[m.db_key].rows += m.row_count || 0
        if (m.synced_at && (!bizByDb[m.db_key].synced_at || m.synced_at > bizByDb[m.db_key].synced_at!)) {
          bizByDb[m.db_key].synced_at = m.synced_at
        }
      }

      const bizStats: TableStat[] = Object.entries(bizByDb).map(([key, val]) => ({
        name: `biz_${key}`,
        label: `业务库: ${key}`,
        rows: val.rows,
        icon: <FolderOpen size={14} />,
        clearable: true,
        dbKey: key,
      }))

      setStats([...coreStats, ...bizStats])
    } catch (e) {
      console.error('[StorageModal] Failed to load stats:', e)
    } finally {
      setLoading(false)
    }
  }, [localUserId])

  useEffect(() => { loadStats() }, [loadStats])

  const handleClear = async (stat: TableStat) => {
    if (!stat.clearable || !stat.dbKey) return
    if (!confirm(`确认清除业务库「${stat.dbKey}」的本地缓存数据？\n下次需要时可重新同步。`)) return

    setClearing(stat.name)
    try {
      // Drop the actual biz tables
      const tablesRes = await executeLocalQuery(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'biz_${stat.dbKey.replace(/[^a-zA-Z0-9]/g, '_')}__%'`
      )
      for (const t of tablesRes) {
        await executeLocalQuery(`DROP TABLE IF EXISTS "${(t as any).name}"`)
      }
      // Clear metadata
      await clearBizSyncMeta(stat.dbKey)
      await loadStats()
    } catch (e) {
      console.error('[StorageModal] Clear failed:', e)
      alert('清除失败，请重试')
    } finally {
      setClearing(null)
    }
  }

  const totalBizRows = stats.filter(s => s.clearable).reduce((sum, s) => sum + s.rows, 0)

  const inner = (
    <div
      className={isMobile
        ? 'bg-white rounded-t-2xl w-full max-h-[80vh] flex flex-col'
        : 'bg-white rounded-xl w-full max-w-md mx-4 flex flex-col shadow-2xl'}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <HardDrive size={18} className="text-purple-600" />
          <span className="text-base font-semibold text-gray-800">本地存储管理</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">加载中…</div>
        ) : (
          <>
            {/* Core tables */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">核心数据</p>
              <div className="space-y-1.5">
                {stats.filter(s => !s.clearable).map(s => (
                  <div key={s.name} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2 text-gray-600">
                      {s.icon}
                      <span className="text-sm">{s.label}</span>
                    </div>
                    <span className="text-sm font-mono font-medium text-gray-800">
                      {s.rows.toLocaleString()} 条
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Biz sync tables */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">离线业务数据</p>
                {totalBizRows > 0 && (
                  <span className="text-xs text-gray-400">{totalBizRows.toLocaleString()} 行合计</span>
                )}
              </div>
              {stats.filter(s => s.clearable).length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">
                  暂无已同步的业务数据库
                </div>
              ) : (
                <div className="space-y-2">
                  {stats.filter(s => s.clearable).map(s => (
                    <div key={s.name} className="border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {s.icon}
                        <div>
                          <div className="text-sm font-medium text-gray-800">{s.dbKey}</div>
                          <div className="text-xs text-gray-400">{s.rows.toLocaleString()} 行数据</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleClear(s)}
                        disabled={clearing === s.name}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 border border-red-200 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {clearing === s.name
                          ? <RefreshCw size={12} className="animate-spin" />
                          : <Trash2 size={12} />
                        }
                        清除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          清除业务数据不影响对话记录，可随时重新同步
        </p>
      </div>
    </div>
  )

  return createPortal(
    <div
      className={[
        'fixed inset-0 z-50 bg-black/50',
        isMobile ? 'flex flex-col justify-end' : 'flex items-center justify-center',
      ].join(' ')}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {inner}
    </div>,
    document.body
  )
}
