import { useState, useRef, useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import { sessionApi } from '../api'
import type { Session } from '../types'
import SessionListSkeleton from './SessionListSkeleton'
import { useTranslation } from '../hooks/useTranslation'

interface SessionListProps {
  selectedSessionId: string | null
  onSelectSession: (sessionId: string, session?: any) => void
  onSessionsUpdated?: () => void
}

export default function SessionList({ selectedSessionId, onSelectSession, onSessionsUpdated }: SessionListProps) {
  const { sessions, setSessions, setCurrentSession, removeSession, loading, clearMessages } = useSessionStore()
  const { user, logout } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const { t } = useTranslation()
// ... (中间代码省略，我将直接在 return 的最后添加 UI)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingSessionId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingSessionId])

  const handleCreateSession = async () => {
    try {
      const session = await sessionApi.createSession()
      await loadSessions()
      clearMessages()
      setCurrentSession(session)
      onSelectSession(session.id, session)
    } catch (error) {
      console.error('创建会话失败:', error)
    }
  }

  const loadSessions = async () => {
    try {
      const data = await sessionApi.getSessions()
      setSessions(data)
      onSessionsUpdated?.()
    } catch (error) {
      console.error('加载会话列表失败:', error)
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    console.log('点击了删除按钮，会话ID:', sessionId)
    
    const confirmed = window.confirm('确定要删除这个会话吗？')
    
    console.log('用户选择:', confirmed ? '确认删除' : '取消删除')
    
    if (!confirmed) {
      return
    }
    
    try {
      console.log('开始删除会话...')
      await sessionApi.deleteSession(sessionId)
      console.log('API调用成功')
      
      // 只有在后端删除成功后才从本地状态移除
      removeSession(sessionId)
      console.log('从状态中移除会话')
      
      if (selectedSessionId === sessionId) {
        clearMessages()
        setCurrentSession(null)
      }
    } catch (error) {
      console.error('删除会话失败:', error)
    }
  }

  const handleStartRename = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingTitle(session.title || '未命名会话')
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
      console.error('重命名会话失败:', error)
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
      <div className="p-4 border-b border-white/30 landscape:p-1.5 landscape:px-4" style={{ paddingTop: '1rem' }}>
        <div className="flex items-center justify-between mb-3 landscape:mb-1">
          <h2 className="text-lg font-semibold text-gray-700 landscape:text-xs">{t('session.listTitle')}</h2>
          <button
            onClick={handleCreateSession}
            className="px-3 py-1.5 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:from-[#C0EFFF] rounded-xl text-sm font-medium text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)] landscape:py-0.5 landscape:px-2 landscape:text-[10px]"
          >
            {t('session.new')}
          </button>
        </div>

        <div className="relative landscape:hidden">
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

      <div className="flex-1 overflow-y-auto p-2 landscape:p-1">
        {loading ? (
          <SessionListSkeleton />
        ) : filteredSessions.length === 0 ? (
          <div className="text-center text-gray-400 py-8 landscape:py-2">
            <p className="text-sm landscape:text-xs">{searchQuery ? t('session.notFound') : t('session.empty')}</p>
          </div>
        ) : (
          <div className="space-y-3 landscape:space-y-1">
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
                  group p-3 rounded-xl cursor-pointer transition-all landscape:p-1.5 landscape:rounded-lg
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
                        className="w-full bg-white/80 border border-[#BFFFD9]/70 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none landscape:text-xs landscape:py-0.5"
                      />
                    ) : (
                      <>
                        <h3
                          className="text-sm font-medium truncate text-gray-700 landscape:text-xs"
                          onDoubleClick={(e) => handleStartRename(e, session)}
                        >
                          {session.title || '未命名会话'}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1 landscape:mt-0 landscape:text-[9px]">
                          {formatDate(session.updated_at, t)}
                        </p>
                      </>
                    )}
                  </div>
                  {!editingSessionId && (
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-[#E6E6FA]/40 rounded-lg transition-all landscape:p-0.5"
                        title={t('session.delete')}
                      >
                        <svg className="w-4 h-4 text-purple-500 landscape:w-3 landscape:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* 用户信息与退出登录 */}
      <div className="p-4 border-t border-white/30 bg-white/20 backdrop-blur-md landscape:p-1.5 landscape:px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#06d6a0] flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0 landscape:w-6 landscape:h-6 landscape:text-[10px]">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate landscape:text-[10px]">{user?.username}</p>
              <p className="text-[10px] text-gray-400 truncate landscape:hidden">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (window.confirm(t('session.logoutConfirm'))) {
                logout()
              }
            }}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all landscape:p-1"
            title={t('session.logout')}
          >
            <svg className="w-5 h-5 landscape:w-4 landscape:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
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
