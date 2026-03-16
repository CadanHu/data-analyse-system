import { useEffect, useRef, Component, ReactNode } from 'react'
import MessageItem from './MessageItem'
import ThinkingIndicator from './ThinkingIndicator'
import MessageSkeleton from './MessageSkeleton'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTranslation } from '../hooks/useTranslation'

class MessageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: any, info: any) {
    console.error('[MessageErrorBoundary] Message render failed:', error)
    console.error('[MessageErrorBoundary] Error type:', typeof error, '| constructor:', error?.constructor?.name)
    console.error('[MessageErrorBoundary] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error || {})))
    console.error('[MessageErrorBoundary] Component stack:', info?.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-100 text-xs text-red-400">
          ⚠️ 此消息渲染失败，请刷新重试
        </div>
      )
    }
    return this.props.children
  }
}

interface MessageListProps {
  onEditMessage?: (content: string, parentId?: string) => void
}

export default function MessageList({ onEditMessage }: MessageListProps) {
  const { isLoading, thinkingContent, setPendingMessage } = useChatStore()
  const { messages: storeMessages } = useSessionStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAutoScrollEnabled = useRef(true)
  const { t } = useTranslation()

  // 监听滚动事件，判断用户是否手动向上滚动
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    // 如果距离底部超过 150px，则认为用户在手动阅读，停止自动滚动
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150
    isAutoScrollEnabled.current = isAtBottom
  }

  useEffect(() => {
    // 🚀 核心修复：仅当用户处于底部时才自动滚动，防止强制跳回底部
    if (scrollRef.current && isAutoScrollEnabled.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [storeMessages, thinkingContent])

  if (storeMessages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
        <div className="max-w-2xl w-full text-center space-y-6">
          <div className="space-y-4">
            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{t('chat.tryAsking')}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                t('chat.example1'),
                t('chat.example2'),
                t('chat.example3'),
                t('chat.example4'),
                t('chat.example5'),
                t('chat.example6'),
                t('chat.example7'),
                t('chat.example8'),
                t('chat.example9'),
                t('chat.example10'),
              ].map((query, i) => (
                <button
                  key={i}
                  onClick={() => setPendingMessage(query)}
                  className="px-5 py-2.5 bg-white/80 rounded-xl text-xs text-gray-600 border border-white hover:border-[#BFFFD9] hover:bg-white transition-all shadow-sm active:scale-95"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={scrollRef} 
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
    >
      {Array.isArray(storeMessages) && storeMessages.map((message) => (
        <MessageErrorBoundary key={message.id}>
          <MessageItem
            message={message}
            onEditSubmit={onEditMessage}
          />
        </MessageErrorBoundary>
      ))}
      {isLoading && storeMessages.length === 0 && (
        <MessageSkeleton />
      )}
    </div>
  )
}
