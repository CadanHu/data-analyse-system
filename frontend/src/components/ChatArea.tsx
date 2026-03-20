import { useEffect, useRef, useState } from 'react'
import MessageList from './MessageList'
import InputBar from './InputBar'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'
import { databaseApi } from '../api'
import { useSSE } from '../hooks/useSSE'
import { useTranslation } from '../hooks/useTranslation'
import { getAllBizSyncMeta } from '../services/db'
import { localUpdateSession } from '../services/localStore'
import { Capacitor } from '@capacitor/core'

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
  const { isLoading, isMobile, orientation, landscapeUiVisible } = useChatStore()
  const { offlineMode } = useAuthStore()
  const { connectionStatus } = useSyncStore()
  // On native: treat 'checking' as offline too — ping sets 'checking' before 'offline',
  // which would otherwise briefly flip isOffline to false and trigger remote API calls.
  const isNativePlatform = Capacitor.isNativePlatform()
  const isOffline = offlineMode || (isNativePlatform ? connectionStatus !== 'online' : connectionStatus === 'offline')
  const { connect } = useSSE()
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const [databases, setDatabases] = useState<Database[]>([])
  const [currentDb, setCurrentDb] = useState<string | null>(null)
  const [showDbSelector, setShowDbSelector] = useState(false)

  useEffect(() => {
    if (!isOffline) {
      loadDatabases()
    } else if (Capacitor.isNativePlatform()) {
      getAllBizSyncMeta().then(meta => {
        const seen = new Set<string>()
        const localDbs: Database[] = []
        for (const m of meta) {
          if (!seen.has(m.db_key)) {
            seen.add(m.db_key)
            localDbs.push({ key: m.db_key, name: m.db_key, is_current: false })
          }
        }
        setDatabases(localDbs)
        if (localDbs.length > 0 && !currentDb) setShowDbSelector(true)
      }).catch(() => {})
    }
  }, [isOffline])

  useEffect(() => {
    if (currentSession && (currentSession as any).database_key) {
      const sessionDbKey = (currentSession as any).database_key
      console.log(`🎯 [Session] 会话切换，同步数据库为: ${sessionDbKey}`)
      setCurrentDb(sessionDbKey)
      setShowDbSelector(false) // 已知数据库，关闭选择器
      // 🚀 核心修复：会话切换时，必须强制后端同步切换到该会话绑定的库
      if (!isOffline) switchDatabase(sessionDbKey, false)
    } else {
      // 🚀 优化：新建对话默认不选择数据库，强制用户手动触发
      setCurrentDb(null)
      setShowDbSelector(false) // 重置，避免上一个会话的选择器状态残留
      if (!isOffline) setShowDbSelector(true) // 仅在线模式下自动弹出
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
    if (isOffline) {
      setCurrentDb(dbKey)
      setShowDbSelector(false)
      if (shouldUpdateSession && selectedSessionId) {
        localUpdateSession(selectedSessionId, { database_key: dbKey }).catch(() => {})
        updateSession(selectedSessionId, { database_key: dbKey })
      }
      return
    }
    try {
      await databaseApi.switchDatabase(dbKey, shouldUpdateSession && selectedSessionId ? selectedSessionId : undefined)
      setCurrentDb(dbKey)
      setShowDbSelector(false)
      
      // 核心修复：如果是手动切换，立即更新本地 Store 和 SQLite，确保 App 重启后仍能记住选择
      if (shouldUpdateSession && selectedSessionId) {
        updateSession(selectedSessionId, { database_key: dbKey })
        localUpdateSession(selectedSessionId, { database_key: dbKey }).catch(() => {})
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
      <div className="flex-none p-4 sm:p-4 border-b border-white/30 data-[mobile=true]:data-[orientation=landscape]:p-1.5 data-[mobile=true]:data-[orientation=landscape]:px-4" style={{ paddingTop: '1rem' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0 flex flex-col data-[mobile=true]:data-[orientation=landscape]:flex-row data-[mobile=true]:data-[orientation=landscape]:items-center data-[mobile=true]:data-[orientation=landscape]:gap-3">
            <h2 className="text-lg font-bold text-gray-700 truncate data-[mobile=true]:data-[orientation=landscape]:text-xs">
              {currentSession?.title || t('session.unnamed')}
            </h2>
            <p className="text-xs text-gray-400 mt-1 data-[mobile=true]:data-[orientation=landscape]:mt-0 data-[mobile=true]:data-[orientation=landscape]:text-[9px] truncate">{t('welcome.assistantTitle')}</p>
          </div>
          
          {/* 🚀 仅在已选择会话且有可用数据库时显示数据库切换按钮 */}
          {selectedSessionId && databases.length > 0 && (
            <div className="flex-none relative">
              <button
                onClick={() => setShowDbSelector(!showDbSelector)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-gray-700 transition-all shadow-lg data-[mobile=true]:data-[orientation=landscape]:py-0.5 data-[mobile=true]:data-[orientation=landscape]:px-2 data-[mobile=true]:data-[orientation=landscape]:text-[10px] ${
                  !currentDb 
                    ? 'bg-gradient-to-r from-orange-400 to-red-400 text-white animate-pulse font-bold' 
                    : 'bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] shadow-[0_4px_12px_rgba(191,255,217,0.3)]'
                }`}
              >
                <span className="font-medium truncate max-w-[70px] data-[mobile=true]:data-[orientation=landscape]:max-w-[100px]">
                  {databases.find(d => d.key === currentDb)?.name || t('chat.selectDb')}
                </span>
                <svg className="w-3 h-3 data-[mobile=true]:data-[orientation=landscape]:w-2 data-[mobile=true]:data-[orientation=landscape]:h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* 离线模式提示横幅 */}
      {isOffline && selectedSessionId && (
        <div className="flex-none flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
          <span>☁️</span>
          <span>离线模式：AI 直连厂商，SQL 在本地执行</span>
        </div>
      )}

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
        <MessageList onEditMessage={handleEditMessage} />
      </div>

      <div
        className={`flex-none p-4 border-t border-white/30 bg-white/30 backdrop-blur-sm transition-all duration-200 ${isMobile && orientation === 'landscape' && !landscapeUiVisible ? 'hidden' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <InputBar
          sessionId={selectedSessionId}
          onMessageSent={onMessageSent}
          currentDb={currentDb}
        />
      </div>
    </div>
  )
}
