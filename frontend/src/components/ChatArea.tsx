import { useEffect, useRef, useState } from 'react'
import MessageList from './MessageList'
import InputBar from './InputBar'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { databaseApi } from '../api'

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
  const { currentSession, messages } = useSessionStore()
  const { isLoading } = useChatStore()
  const listRef = useRef<HTMLDivElement>(null)
  const [databases, setDatabases] = useState<Database[]>([])
  const [currentDb, setCurrentDb] = useState<string>('business')
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
      setCurrentDb(sessionDbKey)
      switchDatabase(sessionDbKey, false)
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

  const switchDatabase = async (dbKey: string, updateSession: boolean = true) => {
    try {
      await databaseApi.switchDatabase(dbKey, updateSession && selectedSessionId ? selectedSessionId : undefined)
      setCurrentDb(dbKey)
      setShowDbSelector(false)
      await loadDatabases()
    } catch (error) {
      console.error('切换数据库失败:', error)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none p-4 border-b border-white/30" style={{ paddingTop: '1rem' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-700 truncate">
              {currentSession?.title || '未命名会话'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">智能数据分析助理</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowDbSelector(!showDbSelector)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] rounded-xl text-xs text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)]"
            >
              <span className="font-medium truncate max-w-[70px]">
                {databases.find(d => d.key === currentDb)?.name || '数据库'}
              </span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDbSelector && (
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
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
        <MessageList />
      </div>

      <div className="flex-none p-4 border-t border-white/30 bg-white/30 backdrop-blur-sm">
        <InputBar
          sessionId={selectedSessionId}
          onMessageSent={onMessageSent}
        />
      </div>
    </div>
  )
}
