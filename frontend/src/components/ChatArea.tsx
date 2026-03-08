import { useEffect, useRef, useState } from 'react'
import MessageList from './MessageList'
import InputBar from './InputBar'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { databaseApi } from '../api'
import { useSSE } from '../hooks/useSSE'

interface ChatAreaProps {
  selectedSessionId: string | null
  onMessageSent?: () => void
}

interface Database {
  key: string
  name: string
  is_current: boolean
}

export default function ChatArea({ selectedSessionId, onMessageSent }: ChatAreaProps) {
  const { currentSession, messages, setMessages, updateSession } = useSessionStore()
  const { isLoading } = useChatStore()
  const { connect } = useSSE()
  const listRef = useRef<HTMLDivElement>(null)
  const [databases, setDatabases] = useState<Database[]>([])
  const [currentDb, setCurrentDb] = useState<string | null>(null)
  const [showDbSelector, setShowDbSelector] = useState(false)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, isLoading])

  useEffect(() => {
    loadDatabases()
  }, [])

  useEffect(() => {
    if (currentSession && (currentSession as any).database_key) {
      const sessionDbKey = (currentSession as any).database_key
      console.log(`🎯 [Session] 会话切换，同步数据库为: ${sessionDbKey}`)
      setCurrentDb(sessionDbKey)
      // 🚀 核心修复：会话切换时，必须强制后端同步切换到该会话绑定的库
      switchDatabase(sessionDbKey, false) 
    } else {
      // 🚀 优化：新建对话默认不选择数据库，强制用户手动触发
      setCurrentDb(null)
      setShowDbSelector(true) // 自动弹出选择器提示用户
    }
  }, [currentSession?.id])

  const loadDatabases = async () => {
    try {
      const data = await databaseApi.getDatabases()
      if (data && data.databases && Array.isArray(data.databases)) {
        setDatabases(data.databases)
      }
    } catch (error) {
      console.error('加载数据库列表失败:', error)
    }
  }

  const switchDatabase = async (dbKey: string, shouldUpdateSession: boolean = true) => {
    try {
      await databaseApi.switchDatabase(dbKey, shouldUpdateSession && selectedSessionId ? selectedSessionId : undefined)
      setCurrentDb(dbKey)
      setShowDbSelector(false)
      
      // 🚀 核心修复：如果是手动切换，立即更新本地 Store 里的会话信息，确保下次切回来时是对的
      if (shouldUpdateSession && selectedSessionId) {
        updateSession(selectedSessionId, { database_key: dbKey })
      }
      
      await loadDatabases()
    } catch (error) {
      console.error('切换数据库失败:', error)
    }
  }

  const handleEditMessage = (content: string, parentId?: string) => {
    if (!selectedSessionId || isLoading) return
    
    // 如果是编辑消息，我们准备开启新分支
    if (parentId) {
      const parentIndex = messages.findIndex(m => m.id === parentId)
      if (parentIndex !== -1) {
        setMessages(messages.slice(0, parentIndex + 1))
      }
    } else {
      // 编辑第一条消息
      setMessages([])
    }

    // 发起带 parent_id 的新分支请求
    connect(
      selectedSessionId,
      content,
      { parent_id: parentId },
      { 
        onMessageSent,
        onError: (err) => {
          console.error('SSE Error:', err)
          alert('分析失败: ' + err)
        }
      }
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none p-4 sm:p-4 border-b border-white/30 landscape:p-1.5 landscape:px-4" style={{ paddingTop: '1rem' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0 flex flex-col landscape:flex-row landscape:items-center landscape:gap-3">
            <h2 className="text-lg font-bold text-gray-700 truncate landscape:text-xs">
              {currentSession?.title || '未命名会话'}
            </h2>
            <p className="text-xs text-gray-400 mt-1 landscape:mt-0 landscape:text-[9px] truncate">智能数据分析助理</p>
          </div>
          
          {/* 🚀 仅在已选择会话时显示数据库切换按钮 */}
          {selectedSessionId && (
            <div className="flex-none relative">
              <button
                onClick={() => setShowDbSelector(!showDbSelector)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-gray-700 transition-all shadow-lg landscape:py-0.5 landscape:px-2 landscape:text-[10px] ${
                  !currentDb 
                    ? 'bg-gradient-to-r from-orange-400 to-red-400 text-white animate-pulse font-bold' 
                    : 'bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] shadow-[0_4px_12px_rgba(191,255,217,0.3)]'
                }`}
              >
                <span className="font-medium truncate max-w-[70px] landscape:max-w-[100px]">
                  {databases.find(d => d.key === currentDb)?.name || '⚠️ 请选择数据库'}
                </span>
                <svg className="w-3 h-3 landscape:w-2 landscape:h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showDbSelector && Array.isArray(databases) && (
                <div className="absolute right-0 top-full mt-2 bg-white/90 backdrop-blur-md rounded-xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 min-w-[150px]">
                  {databases.map((db) => (
                    <button
                      key={db.key}
                      onClick={() => switchDatabase(db.key, true)}
                      className={`w-full text-left px-4 py-2 text-sm transition-all first:rounded-t-xl last:rounded-b-xl hover:bg-[#BFFFD9]/30 ${
                        db.key === currentDb ? 'bg-[#BFFFD9]/50 text-gray-700 font-medium' : 'text-gray-600'
                      }`}
                    >
                      {db.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
        <MessageList onEditMessage={handleEditMessage} />
      </div>

      <div className="flex-none p-4 border-t border-white/30 bg-white/30 backdrop-blur-sm">
        <InputBar
          sessionId={selectedSessionId}
          onMessageSent={onMessageSent}
          currentDb={currentDb}
        />
      </div>
    </div>
  )
}
