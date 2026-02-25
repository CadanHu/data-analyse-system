import { useEffect, useRef } from 'react'
import MessageItem from './MessageItem'
import ThinkingIndicator from './ThinkingIndicator'
import MessageSkeleton from './MessageSkeleton'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'

export default function MessageList() {
  const { messages: storeMessages } = useSessionStore()
  const { isLoading, thinkingContent } = useChatStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [storeMessages, thinkingContent])

  if (storeMessages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <svg className="w-20 h-20 mx-auto mb-6 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-xl font-medium text-gray-500">开始一段对话</p>
          <p className="text-sm mt-2 text-gray-400">在下方输入问题，让我帮你分析数据！</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {storeMessages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {isLoading && storeMessages.length === 0 && (
        <MessageSkeleton />
      )}
    </div>
  )
}
