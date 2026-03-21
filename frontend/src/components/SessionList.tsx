import { useState, useRef, useEffect } from 'react'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Capacitor } from '@capacitor/core'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'
import { sessionApi } from '../api'
import type { Session } from '../types'
import SessionListSkeleton from './SessionListSkeleton'
import { useTranslation } from '../hooks/useTranslation'
import UserSettingsModal from './UserSettingsModal'
import SyncStatusBadge from './SyncStatusBadge'
import {
  localGetSessions,
  localCreateSession,
  localUpdateSession,
  localDeleteSession,
  localGetMessages,
} from '../services/localStore'
import { exportReport } from '../services/pdfExportService'
import type { LocalMessage } from '../services/db'

import { Terminal, Monitor, XCircle, LogOut, Database, HardDrive } from 'lucide-react'
import BizSyncModal from './BizSyncModal'
import StorageModal from './StorageModal'

function esc(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fixChartOptionForPdf(optionJson: string): string {
  try {
    const option = JSON.parse(optionJson)
    const vms = Array.isArray(option.visualMap) ? option.visualMap : (option.visualMap ? [option.visualMap] : [])
    vms.forEach((vm: any) => {
      // Move horizontal bottom visualMaps to the right side (vertical) to avoid covering x-axis labels
      if (!vm.orient || vm.orient === 'horizontal') {
        vm.orient = 'vertical'
        vm.right = 10
        vm.top = 'center'
        delete vm.bottom
        delete vm.left
        vm.itemHeight = 100
      }
    })
    return JSON.stringify(option)
  } catch {
    return optionJson
  }
}

function buildSessionHtml(messages: LocalMessage[], title: string): string {
  let chartIdx = 0
  const scripts: string[] = []

  const blocks = messages.map(msg => {
    if (msg.role === 'user') {
      return `<div class="user-msg"><span class="lbl">User</span><p>${esc(msg.content).replace(/\n/g, '<br>')}</p></div>`
    }
    let block = `<div class="ai-msg"><span class="lbl">Assistant</span><div class="content">${esc(msg.content).replace(/\n/g, '<br>')}</div>`
    if (msg.chart_cfg) {
      const id = `chart-${chartIdx++}`
      const fixedCfg = fixChartOptionForPdf(msg.chart_cfg)
      block += `<div id="${id}" style="width:100%;height:460px;margin:16px 0;"></div>`
      scripts.push(`try{var _c=echarts.init(document.getElementById('${id}'));_c.setOption(${fixedCfg});}catch(e){}`)
    }
    if (msg.sql) {
      block += `<pre class="sql">${esc(msg.sql)}</pre>`
    }
    return block + '</div>'
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"><\/script>
<style>
body{font-family:-apple-system,sans-serif;max-width:900px;margin:0 auto;padding:20px;background:#f9f9f9;color:#333}
h1{font-size:22px;border-bottom:2px solid #1a5f7a;padding-bottom:8px;color:#1a5f7a;margin-bottom:20px}
.user-msg{background:#e8f4f8;border-radius:8px;padding:12px 16px;margin:10px 0}
.ai-msg{background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:12px 16px;margin:10px 0}
.lbl{font-size:11px;font-weight:bold;color:#888;display:block;margin-bottom:4px;text-transform:uppercase}
.content{font-size:14px;line-height:1.6}
.sql{background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap}
p{margin:4px 0}
</style></head><body>
<h1>${esc(title)}</h1>${blocks}
<script>${scripts.join('\n')}<\/script></body></html>`
}

function buildSessionTxt(messages: LocalMessage[], title: string): string {
  const now = new Date().toISOString()
  let content = `会话标题: ${title}\n导出时间: ${now}\n` + "=".repeat(30) + "\n\n"
  for (const msg of messages) {
    const role = msg.role === "user" ? "用户" : "助手"
    content += `[${role}]: ${msg.content}\n`
    if (msg.sql) {
      content += `[SQL]: ${msg.sql}\n`
    }
    content += "-".repeat(10) + "\n"
  }
  return content
}

function buildSessionMd(messages: LocalMessage[], title: string): string {
  const now = new Date().toISOString()
  let content = `# ${title}\n\n*导出时间: ${now}*\n\n---\n\n`
  for (const msg of messages) {
    const role = msg.role === "user" ? "### 👤 用户" : "### 🤖 助手"
    content += `${role}\n\n${msg.content}\n\n`
    if (msg.sql) {
      content += `\`\`\`sql\n${msg.sql}\n\`\`\`\n\n`
    }
    if (msg.thinking) {
      content += `> **思考过程**:\n> ${msg.thinking}\n\n`
    }
    content += "---\n\n"
  }
  return content
}

interface SessionListProps {
  selectedSessionId: string | null
  onSelectSession: (sessionId: string, session?: any) => void
  onSessionsUpdated?: () => void
  showLogs?: boolean;
  onToggleLogs?: () => void;
}

export default function SessionList({ 
  selectedSessionId, 
  onSelectSession, 
  onSessionsUpdated,
  showLogs,
  onToggleLogs
}: SessionListProps) {
  const { sessions, setSessions, setCurrentSession, removeSession, loading, clearMessages } = useSessionStore()
  const { user, logout, offlineMode, localUserId } = useAuthStore()
  const { connectionStatus, lastSyncAt } = useSyncStore()
  // Native platform always uses local SQLite for session management (AI conversations
  // are also local-only on native). This prevents server/local mismatch that causes
  // rename failures and ghost sessions when connected to the same Wi-Fi as the PC.
  const isOffline = connectionStatus === 'offline' || offlineMode || Capacitor.isNativePlatform()
  const [showUserSettings, setShowUserSettings] = useState(false)
  const [showBizSync, setShowBizSync] = useState(false)
  const [showStorage, setShowStorage] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { t } = useTranslation()
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [showExportMenu, setShowExportMenu] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingSessionId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingSessionId])

  useEffect(() => {
    if (user) {
      console.log('🔄 [SessionList] User changed:', {
        username: user?.username,
        email: user?.email,
        isAuthenticated: !!user
      })
      loadSessions()
    }
  }, [user])

  // Reload sessions after each sync completes
  // - Web (online): reload from server to get latest
  // - Native: always reload from local SQLite (sync merges server data into SQLite first)
  useEffect(() => {
    if (lastSyncAt) {
      loadSessions()
    }
  }, [lastSyncAt])

  // When connection is confirmed offline, load sessions from local SQLite
  useEffect(() => {
    if (connectionStatus === 'offline' && user) {
      loadSessions()
    }
  }, [connectionStatus])


  const handleExport = async (e: React.MouseEvent, sessionId: string, format: 'txt' | 'md' | 'pdf') => {
    e.preventDefault()
    e.stopPropagation()
    setShowExportMenu(null)
    setIsExporting(true)

    // Native platform: always generate locally from SQLite messages
    // This avoids "Session fetch failed" errors on mobile and allows offline export
    if (Capacitor.isNativePlatform()) {
      try {
        const session = sessions.find(s => s.id === sessionId)
        const title = session?.title || t('session.unnamed')
        const msgs = await localGetMessages(sessionId)
        // 清理文件名中的非法字符
        const safeName = title.replace(/[\/\\?%*:|"<>]/g, '-').slice(0, 80)
        const fileName = `${safeName}.${format}`

        if (format === 'pdf') {
          const html = buildSessionHtml(msgs, title)
          await exportReport(html, title)
          setIsExporting(false)
          return
        }

        const data = format === 'txt'
          ? buildSessionTxt(msgs, title)
          : buildSessionMd(msgs, title)

        // 🚀 iOS 修复：
        //   1. 直接写入 UTF-8 字符串，Filesystem 插件自动处理编码
        //   2. 使用 Cache 目录（Documents 目录在部分 iOS 版本 share 有权限限制）
        //   3. 不再使用 text/markdown MIME（iOS 不识别，导致"无法打开"）
        const writeResult = await Filesystem.writeFile({
          path: fileName,
          data: data,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          recursive: true,
        })

        await Share.share({
          title: `Export: ${fileName}`,
          url: writeResult.uri,
          dialogTitle: t('session.shareTitle'),
        })
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('dismiss')) {
          console.error('[Export] Native Local Error:', err)
          alert(`${t('alert.fetchFileFailed')}: ${msg}`)
        }
      } finally {
        setIsExporting(false)
      }
      return
    }

    try {
      console.log(`[Export] Starting export for ${sessionId} as ${format}...`)
      const blob = await sessionApi.exportSession(sessionId, format)
      const session = sessions.find(s => s.id === sessionId)
      const title = session?.title || t('session.unnamed')
      const fileName = `${title.replace(/[\/\\?%*:|"<>]/g, '-')}.${format}`

      const url = window.URL.createObjectURL(blob)
      if (format === 'pdf' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('[Export] API Error:', error)
      alert(`${t('alert.fetchFileFailed')}: ${error.message || 'Check network'}`);
    } finally {
      setIsExporting(false)
    }
  }

  const handleCreateSession = async () => {
    try {
      if (isOffline) {
        const userId = localUserId ?? -1
        const local = await localCreateSession(userId)
        const session: Session = {
          id: local.id,
          title: local.title ?? undefined,
          created_at: local.created_at ?? new Date().toISOString(),
          updated_at: local.updated_at ?? new Date().toISOString(),
        }
        await loadSessions()
        clearMessages()
        setCurrentSession(session)
        onSelectSession(session.id, session)
        return
      }
      const session = await sessionApi.createSession()
      await loadSessions()
      clearMessages()
      setCurrentSession(session)
      onSelectSession(session.id, session)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const mapLocalSessions = (localData: any[]) => localData.map(s => ({
    id: s.id,
    title: s.title ?? undefined,
    database_key: s.database_key ?? undefined,
    status: s.status ?? undefined,
    enable_data_science_agent: !!s.enable_data_science_agent,
    enable_thinking: !!s.enable_thinking,
    enable_rag: !!s.enable_rag,
    model_provider: s.model_provider ?? undefined,
    model_name: s.model_name ?? undefined,
    created_at: s.created_at ?? new Date().toISOString(),
    updated_at: s.updated_at ?? new Date().toISOString(),
  })) as Session[]

  const loadSessions = async () => {
    try {
      if (isOffline) {
        const userId = localUserId ?? -1
        const localData = await localGetSessions(userId)
        setSessions(mapLocalSessions(localData))
        onSessionsUpdated?.()
        return
      }

      // Native: pre-load from local SQLite immediately so the list isn't blank
      // during the server request (which may take 3-10s to timeout if offline)
      if (Capacitor.isNativePlatform()) {
        const userId = localUserId ?? -1
        const localData = await localGetSessions(userId)
        if (localData.length > 0) {
          setSessions(mapLocalSessions(localData))
          onSessionsUpdated?.()
        }
      }

      console.log('📡 [SessionList] Fetching sessions...')
      const data = await sessionApi.getSessions()
      console.log('✅ [SessionList] Sessions loaded:', data)
      if (Array.isArray(data)) {
        setSessions(data)
        onSessionsUpdated?.()
      }
    } catch (error) {
      console.error('❌ [SessionList] Failed to load sessions:', error)
      // Server unreachable and no pre-load was done → fall back to local SQLite
      if (Capacitor.isNativePlatform()) {
        try {
          const userId = localUserId ?? -1
          const localData = await localGetSessions(userId)
          setSessions(mapLocalSessions(localData))
          onSessionsUpdated?.()
        } catch { /* ignore */ }
      }
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const confirmed = window.confirm(t('session.deleteConfirm'))
    if (!confirmed) return

    try {
      if (isOffline) {
        await localDeleteSession(sessionId)
      } else {
        await sessionApi.deleteSession(sessionId)
      }
      removeSession(sessionId)
      if (selectedSessionId === sessionId) {
        clearMessages()
        setCurrentSession(null)
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const handleStartRename = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingTitle(session.title || t('session.unnamed'))
  }

  const handleFinishRename = async (sessionId: string) => {
    if (!editingTitle.trim()) {
      setEditingSessionId(null)
      return
    }
    try {
      if (isOffline) {
        await localUpdateSession(sessionId, { title: editingTitle })
      } else {
        await sessionApi.updateSessionTitle(sessionId, editingTitle)
      }
      await loadSessions()
    } catch (error) {
      console.error('Failed to rename session:', error)
    } finally {
      setEditingSessionId(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === 'Enter') {
      handleFinishRename(sessionId)
    } else if (e.key === 'Escape') {
      setEditingSessionId(null)
    }
  }

  const filteredSessions = (Array.isArray(sessions) ? (searchQuery.trim() === '' 
    ? sessions 
    : sessions.filter(session =>
        (session.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      )) : [])

  return (
    <div className="flex flex-col h-full bg-white/40 backdrop-blur-md">
      {isExporting && (
        <div className="absolute inset-0 z-[100] bg-white/60 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[#BFFFD9] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-gray-600">{t('session.preparingFile')}</p>
          </div>
        </div>
      )}

      <div className="p-4 border-b border-white/30 data-[mobile=true]:data-[orientation=landscape]:p-1.5 data-[mobile=true]:data-[orientation=landscape]:px-4" style={{ paddingTop: '1rem' }}>
        <div className="flex items-center justify-between mb-3 data-[mobile=true]:data-[orientation=landscape]:mb-1">
          <h2 className="text-lg font-semibold text-gray-700 data-[mobile=true]:data-[orientation=landscape]:text-xs">{t('session.listTitle')}</h2>
          <button
            onClick={handleCreateSession}
            className="px-3 py-1.5 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] rounded-xl text-sm font-medium text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)] data-[mobile=true]:data-[orientation=landscape]:py-0.5 data-[mobile=true]:data-[orientation=landscape]:px-2 data-[mobile=true]:data-[orientation=landscape]:text-[10px]"
          >
            {t('session.new')}
          </button>
        </div>

        <div className="relative data-[mobile=true]:data-[orientation=landscape]:hidden">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('session.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#BFFFD9]/70 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 data-[mobile=true]:data-[orientation=landscape]:p-1">
        {loading ? (
          <SessionListSkeleton />
        ) : filteredSessions.length === 0 ? (
          <div className="text-center text-gray-400 py-8 data-[mobile=true]:data-[orientation=landscape]:py-2">
            <p className="text-sm data-[mobile=true]:data-[orientation=landscape]:text-xs">{searchQuery ? t('session.notFound') : t('session.empty')}</p>
          </div>
        ) : (
          <div className="space-y-3 data-[mobile=true]:data-[orientation=landscape]:space-y-1">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  if (!editingSessionId) {
                    setCurrentSession(session)
                    onSelectSession(session.id, session)
                  }
                }}
                className={`
                  group p-3 rounded-xl cursor-pointer transition-all data-[mobile=true]:data-[orientation=landscape]:p-1.5 data-[mobile=true]:data-[orientation=landscape]:rounded-lg
                  ${selectedSessionId === session.id
                    ? 'bg-[#BFFFD9]/30 border border-[#BFFFD9]/50 shadow-[0_4px_12px_rgba(191,255,217,0.2)]'
                    : 'hover:bg-white/40 border border-transparent'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {editingSessionId === session.id ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => handleFinishRename(session.id)}
                        onKeyDown={(e) => handleKeyDown(e, session.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-white/80 border border-[#BFFFD9]/70 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none data-[mobile=true]:data-[orientation=landscape]:text-xs data-[mobile=true]:data-[orientation=landscape]:py-0.5"
                      />
                    ) : (
                      <>
                        <h3
                          className="text-sm font-medium truncate text-gray-700 data-[mobile=true]:data-[orientation=landscape]:text-xs"
                          onDoubleClick={(e) => handleStartRename(e, session)}
                        >
                          {session.title || t('session.unnamed')}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1 data-[mobile=true]:data-[orientation=landscape]:mt-0 data-[mobile=true]:data-[orientation=landscape]:text-[9px]">
                          {formatDate(session.updated_at, t)}
                        </p>
                      </>
                    )}
                  </div>
                  {!editingSessionId && (
                    <div className="flex gap-1 items-center relative">
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowExportMenu(showExportMenu === session.id ? null : session.id);
                          }}
                          className="md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-[#E0FFFF]/40 rounded-lg transition-all data-[mobile=true]:data-[orientation=landscape]:p-0.5"
                          title={t('session.export')}
                        >
                          <svg className="w-4 h-4 text-cyan-600 data-[mobile=true]:data-[orientation=landscape]:w-3 data-[mobile=true]:data-[orientation=landscape]:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        
                        {showExportMenu === session.id && (
                          <div className="absolute right-0 top-full mt-1 w-24 bg-white/95 backdrop-blur-md border border-white/40 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <button
                              onClick={(e) => handleExport(e, session.id, 'txt')}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-[#BFFFD9]/30 transition-colors"
                            >
                              {t('session.exportTxt')}
                            </button>
                            <button
                              onClick={(e) => handleExport(e, session.id, 'md')}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-[#BFFFD9]/30 transition-colors border-t border-gray-100/50"
                            >
                              {t('session.exportMd')}
                            </button>
                            <button
                              onClick={(e) => handleExport(e, session.id, 'pdf')}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-[#BFFFD9]/30 transition-colors border-t border-gray-100/50"
                            >
                              {t('session.exportPdf')}
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-[#E6E6FA]/40 rounded-lg transition-all data-[mobile=true]:data-[orientation=landscape]:p-0.5"
                        title={t('session.delete')}
                      >
                        <svg className="w-4 h-4 text-purple-500 data-[mobile=true]:data-[orientation=landscape]:w-3 data-[mobile=true]:data-[orientation=landscape]:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUserSettings && (
        <UserSettingsModal onClose={() => setShowUserSettings(false)} />
      )}
      {showBizSync && (
        <BizSyncModal onClose={() => setShowBizSync(false)} />
      )}
      {showStorage && (
        <StorageModal onClose={() => setShowStorage(false)} localUserId={localUserId ?? -1} />
      )}

      <div className="p-4 border-t border-white/30 bg-white/20 backdrop-blur-md data-[mobile=true]:data-[orientation=landscape]:p-1.5 data-[mobile=true]:data-[orientation=landscape]:px-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowUserSettings(true)}
            className="flex items-center gap-2 min-w-0 flex-1 rounded-xl hover:bg-white/40 px-1 py-1 -mx-1 transition-colors text-left"
            title="点击进入用户设置"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#06d6a0] flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0 data-[mobile=true]:data-[orientation=landscape]:w-6 data-[mobile=true]:data-[orientation=landscape]:h-6 data-[mobile=true]:data-[orientation=landscape]:text-[10px]">
              {(user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate data-[mobile=true]:data-[orientation=landscape]:text-[10px]">{user?.username || t('session.syncing')}</p>
              <p className="text-[10px] text-gray-400 truncate data-[mobile=true]:data-[orientation=landscape]:hidden">{user?.email || t('session.wait')}</p>
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <SyncStatusBadge />
            {Capacitor.isNativePlatform() && (
              <>
                <button
                  onClick={() => setShowBizSync(true)}
                  className="flex items-center gap-1 px-2 py-1.5 text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all data-[mobile=true]:data-[orientation=landscape]:p-1 data-[mobile=true]:data-[orientation=landscape]:px-1.5"
                  title="同步业务数据库到本地，离线时 AI 可查询本地数据"
                >
                  <Database className="w-4 h-4 data-[mobile=true]:data-[orientation=landscape]:w-3.5 data-[mobile=true]:data-[orientation=landscape]:h-3.5" />
                  <span className="text-[11px] font-medium data-[mobile=true]:data-[orientation=landscape]:hidden">离线数据</span>
                </button>
                <button
                  onClick={() => setShowStorage(true)}
                  className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-xl transition-all data-[mobile=true]:data-[orientation=landscape]:p-1"
                  title="本地存储管理"
                >
                  <HardDrive className="w-4 h-4 data-[mobile=true]:data-[orientation=landscape]:w-3.5 data-[mobile=true]:data-[orientation=landscape]:h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLogs?.();
              }}
              className={`p-2 rounded-xl transition-all data-[mobile=true]:data-[orientation=landscape]:p-1 ${
                showLogs 
                  ? 'bg-black text-white shadow-inner' 
                  : 'text-gray-400 hover:text-black hover:bg-gray-100'
              }`}
              title={t('session.viewLogs')}
            >
              <Terminal className="w-5 h-5 data-[mobile=true]:data-[orientation=landscape]:w-4 data-[mobile=true]:data-[orientation=landscape]:h-4" />
            </button>

            <button
              onClick={() => {
                if (window.confirm(t('session.logoutConfirm'))) {
                  logout()
                }
              }}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all data-[mobile=true]:data-[orientation=landscape]:p-1"
              title={t('session.logout')}
            >
              <svg className="w-5 h-5 data-[mobile=true]:data-[orientation=landscape]:w-4 data-[mobile=true]:data-[orientation=landscape]:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDate(dateStr: string, t: (key: any) => string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return t('session.justNow')
  if (diffMinutes < 60) return `${diffMinutes}${t('session.minutesAgo')}`
  if (diffHours < 24) return `${diffHours}${t('session.hoursAgo')}`
  if (diffDays < 7) return `${diffDays}${t('session.daysAgo')}`

  return date.toLocaleDateString()
}
