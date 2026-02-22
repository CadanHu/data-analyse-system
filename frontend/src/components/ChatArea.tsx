import { useEffect, useRef, useState } from 'react'
import MessageList from './MessageList'
import InputBar from './InputBar'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'

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
      const response = await fetch('http://localhost:8000/api/databases')
      const data = await response.json()
      if (data && data.databases && Array.isArray(data.databases)) {
        setDatabases(data.databases)
      } else {
        console.error('数据库列表数据格式错误:', data)
      }
    } catch (error) {
      console.error('加载数据库列表失败:', error)
    }
  }

  const switchDatabase = async (dbKey: string, updateSession: boolean = true) => {
    try {
      await fetch('http://localhost:8000/api/database/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database_key: dbKey })
      })
      
      if (updateSession && selectedSessionId) {
        await fetch(`http://localhost:8000/api/sessions/${selectedSessionId}/database`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ database_key: dbKey })
        })
      }
      
      setCurrentDb(dbKey)
      setShowDbSelector(false)
      await loadDatabases()
    } catch (error) {
      console.error('切换数据库失败:', error)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none p-4 border-b border-white/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-700">
              {currentSession?.title || '未命名会话'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">智能数据分析助理</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowDbSelector(!showDbSelector)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] rounded-xl text-sm text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4V7M4 7c0-2.21 1.79-4 4-4h8c2.21 0 4 1.79 4 4M9 17l-3-3m0 0l-3 3" />
              </svg>
              <span className="font-medium">{databases.find(d => d.key === currentDb)?.name || '数据库'}</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDbSelector && (
              <div className="absolute right-0 top-full mt-2 bg-white/90 backdrop-blur-md rounded-xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 min-w-[200px]">
                {databases.map((db) => (
                  <button
                    key={db.key}
                    onClick={() => switchDatabase(db.key, true)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-all first:rounded-t-xl last:rounded-b-xl hover:bg-[#BFFFD9]/30 ${
                      db.key === currentDb ? 'bg-[#BFFFD9]/50 text-gray-700 font-medium' : 'text-gray-600'
                    }`}
                  >
                    {db.name}
                    {db.key === currentDb && (
                      <span className="ml-2 text-xs text-[#BFFFD9]">✓</span>
                    )}
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
