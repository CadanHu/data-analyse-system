import { useState, useRef, useEffect } from 'react'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Capacitor } from '@capacitor/core'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import { sessionApi } from '../api'
import type { Session } from '../types'
import SessionListSkeleton from './SessionListSkeleton'

interface SessionListProps {
  selectedSessionId: string | null
  onSelectSession: (sessionId: string, session?: any) => void
  onSessionsUpdated?: () => void
}

export default function SessionList({ selectedSessionId, onSelectSession, onSessionsUpdated }: SessionListProps) {
  const { sessions, setSessions, setCurrentSession, removeSession, loading, clearMessages } = useSessionStore()
  const { user, logout } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
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

  // 辅助函数：将 Blob 转换为 Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String.split(',')[1]);
      };
      reader.onerror = (e) => reject(new Error('文件转换失败: ' + e));
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
      const title = session?.title || '分析报告'
      const fileName = `${title.replace(/[\/\\?%*:|"<>]/g, '-')}.${format}`

      if (Capacitor.isNativePlatform()) {
        // --- 移动端原生处理逻辑 ---
        try {
          const base64Data = await blobToBase64(blob);
          
          // 使用 Documents 目录，因为它在某些系统上比 Cache 更有利于跨应用分享
          const writeResult = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache, // 内部仍写到 Cache，防止污染文档
            recursive: true
          });

          console.log(`[Export] File written to: ${writeResult.uri}`);

          // 调起分享，这是最关键的步骤
          await Share.share({
            title: `导出: ${fileName}`,
            url: writeResult.uri, // 传递文件真实路径
            dialogTitle: '请选择保存或分享方式',
          });
        } catch (innerError: any) {
          console.error('[Export] Native Error:', innerError);
          alert(`手机端处理失败: ${innerError.message || '未知错误'}`);
        }
      } else {
        // --- 网页端或手机浏览器处理逻辑 ---
        const url = window.URL.createObjectURL(blob)
        if (format === 'pdf' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          // 手机浏览器上，直接打开 PDF 预览往往比下载链接更有效
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
      alert('从服务器获取文件失败: ' + (error.message || '请检查网络'));
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
    const confirmed = window.confirm('确定要删除这个会话吗？')
    if (!confirmed) return
    
    try {
      await sessionApi.deleteSession(sessionId)
      removeSession(sessionId)
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
      {/* 导出中的覆盖层 */}
      {isExporting && (
        <div className="absolute inset-0 z-[100] bg-white/60 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[#BFFFD9] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-gray-600">正在准备文件...</p>
          </div>
        </div>
      )}

      <div className="p-4 border-b border-white/30 landscape:p-1.5 landscape:px-4" style={{ paddingTop: '1rem' }}>
        <div className="flex items-center justify-between mb-3 landscape:mb-1">
          <h2 className="text-lg font-semibold text-gray-700 landscape:text-xs">会话列表</h2>
          <button
            onClick={handleCreateSession}
            className="px-3 py-1.5 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:from-[#C0EFFF] rounded-xl text-sm font-medium text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)] landscape:py-0.5 landscape:px-2 landscape:text-[10px]"
          >
            + 新建
          </button>
        </div>
        
        <div className="relative landscape:hidden">
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

      <div className="flex-1 overflow-y-auto p-2 landscape:p-1">
        {loading ? (
          <SessionListSkeleton />
        ) : filteredSessions.length === 0 ? (
          <div className="text-center text-gray-400 py-8 landscape:py-2">
            <p className="text-sm landscape:text-xs">{searchQuery ? '没有找到匹配的会话' : '暂无会话'}</p>
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
                          {formatDate(session.updated_at)}
                        </p>
                      </>
                    )}
                  </div>
                  {!editingSessionId && (
                    <div className="flex gap-1 items-center relative">
                      {/* 导出按钮 */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowExportMenu(showExportMenu === session.id ? null : session.id);
                          }}
                          className="md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-[#E0FFFF]/40 rounded-lg transition-all landscape:p-0.5"
                          title="导出对话"
                        >
                          <svg className="w-4 h-4 text-cyan-600 landscape:w-3 landscape:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        
                        {showExportMenu === session.id && (
                          <div className="absolute right-0 top-full mt-1 w-24 bg-white/95 backdrop-blur-md border border-white/40 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <button
                              onClick={(e) => handleExport(e, session.id, 'txt')}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-[#BFFFD9]/30 transition-colors"
                            >
                              📄 TXT 文本
                            </button>
                            <button
                              onClick={(e) => handleExport(e, session.id, 'md')}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-[#BFFFD9]/30 transition-colors border-t border-gray-100/50"
                            >
                              📝 Markdown
                            </button>
                            <button
                              onClick={(e) => handleExport(e, session.id, 'pdf')}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-[#BFFFD9]/30 transition-colors border-t border-gray-100/50"
                            >
                              📕 高清 PDF
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-[#E6E6FA]/40 rounded-lg transition-all landscape:p-0.5"
                        title="删除会话"
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
              if (window.confirm('确定要退出登录吗？')) {
                logout()
              }
            }}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all landscape:p-1"
            title="退出登录"
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
