import { useEffect, useRef } from 'react'
import MessageItem from './MessageItem'
import ThinkingIndicator from './ThinkingIndicator'
import MessageSkeleton from './MessageSkeleton'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTranslation } from '../hooks/useTranslation'

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
        <div className="max-w-2xl w-full text-center space-y-10">
          <div className="space-y-4">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#BFFFD9] to-[#E0FFFF] rounded-3xl flex items-center justify-center shadow-lg shadow-[#BFFFD9]/30">
              <svg className="w-10 h-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-3xl font-black text-gray-800 tracking-tight">DataPulse {t('welcome.assistantTitle')} v1.7.0</h2>
            <p className="text-gray-500 font-medium">{t('chat.welcomeMessage')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
            <div className="p-5 bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-all cursor-default">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">📊</span>
                <h3 className="font-bold text-gray-700">{t('chat.featureViz')}</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">{t('chat.featureVizDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">Radar</span>
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">Heatmap</span>
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">Sankey</span>
              </div>
            </div>

            <div className="p-5 bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-all cursor-default">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">🧠</span>
                <h3 className="font-bold text-gray-700">{t('chat.featureThinking')}</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">{t('chat.featureThinkingDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">DeepSeek R1</span>
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">Chain of Thought</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{t('chat.tryAsking')}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                t('chat.example1'),
                t('chat.example2'),
                t('chat.example3'),
                t('chat.example4')
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
        <MessageItem 
          key={message.id} 
          message={message} 
          onEditSubmit={onEditMessage}
        />
      ))}
      {isLoading && storeMessages.length === 0 && (
        <MessageSkeleton />
      )}
    </div>
  )
}
