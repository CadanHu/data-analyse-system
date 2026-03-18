/**
 * SyncStatusBadge.tsx — 同步状态指示徽章
 * 四态：离线(灰云) / 同步中(旋转) / 已同步(绿√+时间) / 失败(橙⚠)
 */

import { useSyncStore } from '../stores/syncStore'

function formatSyncTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function SyncStatusBadge() {
  const { connectionStatus, isSyncing, lastSyncAt, syncError } = useSyncStore()

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1 text-xs text-blue-500" title="同步中...">
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
        </svg>
        <span>同步中</span>
      </div>
    )
  }

  if (syncError) {
    return (
      <div className="flex items-center gap-1 text-xs text-orange-500" title={syncError}>
        <span>⚠</span>
        <span>同步失败</span>
      </div>
    )
  }

  if (connectionStatus === 'offline') {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-400" title="离线模式">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
        <span>离线</span>
      </div>
    )
  }

  if (connectionStatus === 'online' && lastSyncAt) {
    return (
      <div className="flex items-center gap-1 text-xs text-emerald-500" title={`上次同步: ${lastSyncAt}`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="hidden sm:inline">{formatSyncTime(lastSyncAt)}</span>
      </div>
    )
  }

  // Checking
  return (
    <div className="flex items-center gap-1 text-xs text-gray-400" title="检查连接中...">
      <svg className="w-3.5 h-3.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
      </svg>
    </div>
  )
}
