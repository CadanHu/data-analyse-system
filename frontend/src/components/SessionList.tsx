import { useState, useRef, useEffect } from 'react'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Capacitor } from '@capacitor/core'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import { sessionApi } from '../api'
import type { Session } from '../types'
import SessionListSkeleton from './SessionListSkeleton'
import { useTranslation } from '../hooks/useTranslation'

import { Terminal, Monitor, XCircle, LogOut } from 'lucide-react'

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
  const { user, logout } = useAuthStore()
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

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String.split(',')[1]);
      };
      reader.onerror = (e) => reject(new Error('File conversion failed: ' + e));
      reader.readAsDataURL(blob);
    });
  };

  const handleExport = async (e: React.MouseEvent, sessionId: string, format: 'txt' | 'md' | 'pdf') => {
    e.preventDefault()
    e.stopPropagation()
    setShowExportMenu(null)
    setIsExporting(true)
    
    try {
      console.log(`[Export] Starting export for ${sessionId} as ${format}...`)
      const blob = await sessionApi.exportSession(sessionId, format)
      const session = sessions.find(s => s.id === sessionId)
      const title = session?.title || t('session.unnamed')
      const fileName = `${title.replace(/[\/\\?%*:|"<>]/g, '-')}.${format}`

      if (Capacitor.isNativePlatform()) {
        try {
          const base64Data = await blobToBase64(blob);
          const writeResult = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
            recursive: true
          });
          await Share.share({
            title: `Export: ${fileName}`,
            url: writeResult.uri,
            dialogTitle: t('session.shareTitle'),
          });
        } catch (innerError: any) {
          console.error('[Export] Native Error:', innerError);
          const errCode = innerError?.code || ''
          const errMsg = innerError?.message || JSON.stringify(innerError) || 'Unknown error'
          // UNIMPLEMENTED means the native plugin pod is missing — prompt rebuild
          if (errCode === 'UNIMPLEMENTED') {
            alert(`${t('alert.mobileProcessFailed')}: Native plugin not linked. Please rebuild the iOS app after running "pod install".`)
          } else {
            alert(`${t('alert.mobileProcessFailed')}: ${errMsg}`)
          }
        }
      } else {
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
      }
    } catch (error: any) {
      console.error('[Export] API Error:', error)
      alert(`${t('alert.fetchFileFailed')}: ${error.message || 'Check network'}`);
    } finally {
      setIsExporting(false)
    }
  }

  const handleCreateSession = async () => {
    try {
      const session = await sessionApi.createSession()
      await loadSessions()
      clearMessages()
      setCurrentSession(session)
      onSelectSession(session.id, session)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const loadSessions = async () => {
    try {
      console.log('📡 [SessionList] Fetching sessions...')
      const data = await sessionApi.getSessions()
      console.log('✅ [SessionList] Sessions loaded:', data)
      if (Array.isArray(data)) {
        setSessions(data)
        onSessionsUpdated?.()
      }
    } catch (error) {
      console.error('❌ [SessionList] Failed to load sessions:', error)
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const confirmed = window.confirm(t('session.deleteConfirm'))
    if (!confirmed) return
    
    try {
      await sessionApi.deleteSession(sessionId)
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
      await sessionApi.updateSessionTitle(sessionId, editingTitle)
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

      <div className="p-4 border-t border-white/30 bg-white/20 backdrop-blur-md data-[mobile=true]:data-[orientation=landscape]:p-1.5 data-[mobile=true]:data-[orientation=landscape]:px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#06d6a0] flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0 data-[mobile=true]:data-[orientation=landscape]:w-6 data-[mobile=true]:data-[orientation=landscape]:h-6 data-[mobile=true]:data-[orientation=landscape]:text-[10px]">
              {(user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate data-[mobile=true]:data-[orientation=landscape]:text-[10px]">{user?.username || t('session.syncing')}</p>
              <p className="text-[10px] text-gray-400 truncate data-[mobile=true]:data-[orientation=landscape]:hidden">{user?.email || t('session.wait')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
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
