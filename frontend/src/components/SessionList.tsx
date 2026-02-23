import { useState, useRef, useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import sessionApi from '../api/sessionApi'
import type { Session } from '../types'
import SessionListSkeleton from './SessionListSkeleton'

interface SessionListProps {
  selectedSessionId: string | null
  onSelectSession: (sessionId: string, session?: any) => void
  onSessionsUpdated?: () => void
}

export default function SessionList({ selectedSessionId, onSelectSession, onSessionsUpdated }: SessionListProps) {
  const { sessions, currentSession, setSessions, setCurrentSession, removeSession, loading, clearMessages } = useSessionStore()
  const [searchQuery, setSearchQuery] = useState('')
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
      
      removeSession(sessionId)
      console.log('从状态中移除会话')
      
      if (currentSession?.id === sessionId) {
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

  const handleClearContext = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (!confirm('确定要清空这个会话的上下文吗？')) return
    try {
      await sessionApi.clearSessionContext(sessionId)
      if (selectedSessionId === sessionId) {
        const session = await sessionApi.getSession(sessionId)
        setCurrentSession(session)
      }
      await loadSessions()
    } catch (error) {
      console.error('清空上下文失败:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === 'Enter') {
      handleFinishRename(sessionId)
    } else if (e.key === 'Escape') {
      setEditingSessionId(null)
    }
  }

  const filteredSessions = searchQuery.trim() === '' 
    ? sessions 
    : sessions.filter(session =>
        (session.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      )

  const groupedSessions = filteredSessions.reduce((acc, session) => {
    const group = getTimeGroup(session.updated_at)
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(session)
    return acc
  }, {} as Record<string, Session[]>)

  const groupOrder: Array<{ key: string; label: string }> = [
    { key: 'today', label: '今天' },
    { key: 'yesterday', label: '昨天' },
    { key: 'earlier', label: '更早' }
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/30">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">会话列表</h2>
          <button
            onClick={handleCreateSession}
            className="px-3 py-1.5 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:from-[#C0EFFF] rounded-xl text-sm font-medium text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)]"
          >
            + 新建
          </button>
        </div>
        
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索会话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#BFFFD9]/70 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <SessionListSkeleton />
        ) : filteredSessions.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p className="text-sm">{searchQuery ? '没有找到匹配的会话' : '暂无会话'}</p>
            {!searchQuery && (
              <p className="text-xs mt-1">点击"新建"创建第一个会话</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  if (!editingSessionId) {
                    setCurrentSession(session)
                    onSelectSession(session.id)
                  }
                }}
                className={`
                  group p-3 rounded-xl cursor-pointer transition-all
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
                        className="w-full bg-white/80 border border-[#BFFFD9]/70 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none"
                      />
                    ) : (
                      <>
                        <h3 
                          className="text-sm font-medium truncate text-gray-700"
                          onDoubleClick={(e) => handleStartRename(e, session)}
                        >
                          {session.title || '未命名会话'}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(session.updated_at)}
                        </p>
                      </>
                    )}
                  </div>
                  {!editingSessionId && (
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => handleClearContext(e, session.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#FFFACD]/40 rounded-lg transition-all"
                        title="清空上下文"
                      >
                        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 0 00-1-1h-4a1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#E6E6FA]/40 rounded-lg transition-all"
                        title="删除会话"
                      >
                        <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 0 00-1-1h-4a1 0 00-1 1v3M4 7h16" />
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
    </div>
  )
}

function getTimeGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return 'earlier'
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 7) return `${diffDays}天前`
  
  return date.toLocaleDateString('zh-CN')
}
