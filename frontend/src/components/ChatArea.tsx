import { useEffect, useRef } from 'react'
import MessageList from './MessageList'
import InputBar from './InputBar'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'

interface ChatAreaProps {
  selectedSessionId: string | null
  onMessageSent?: () => void
}

export default function ChatArea({ selectedSessionId, onMessageSent }: ChatAreaProps) {
  const { currentSession, messages } = useSessionStore()
  const { isLoading } = useChatStore()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, isLoading])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none p-4 border-b border-white/30">
        <h2 className="text-xl font-bold text-gray-700">
          {currentSession?.title || '未命名会话'}
        </h2>
        <p className="text-xs text-gray-400 mt-1">智能数据分析助理</p>
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
