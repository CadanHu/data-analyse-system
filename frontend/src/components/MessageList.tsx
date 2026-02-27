import { useEffect, useRef } from 'react'
import MessageItem from './MessageItem'
import ThinkingIndicator from './ThinkingIndicator'
import MessageSkeleton from './MessageSkeleton'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'

export default function MessageList() {
  const { isLoading, thinkingContent, setPendingMessage } = useChatStore()
  const { messages: storeMessages } = useSessionStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
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
            <h2 className="text-3xl font-black text-gray-800 tracking-tight">DataPulse 智能助理 v1.7.0</h2>
            <p className="text-gray-500 font-medium">我已经准备好为您深度分析数据，并自动适配 15+ 种进阶可视化方案。</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
            <div className="p-5 bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-all cursor-default">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">📊</span>
                <h3 className="font-bold text-gray-700">进阶可视化</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">自动适配雷达图、漏斗图、热力图等，让数据洞察更直观。</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">Radar</span>
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">Heatmap</span>
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">Sankey</span>
              </div>
            </div>

            <div className="p-5 bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-all cursor-default">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl">🧠</span>
                <h3 className="font-bold text-gray-700">深度推理模式</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">实时展示推理思维链，让 AI 的分析逻辑透明可见、专业可靠。</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">DeepSeek R1</span>
                <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-[10px] text-gray-400 font-bold uppercase">Chain of Thought</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">您可以试着这样问我：</p>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                "分析去年的销售额趋势并生成面积图",
                "对比核心产品的多维性能 (雷达图)",
                "分析用户从首页到下单的转化漏斗",
                "展示各地区销售密度的热力图"
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
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {Array.isArray(storeMessages) && storeMessages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {isLoading && storeMessages.length === 0 && (
        <MessageSkeleton />
      )}
    </div>
  )
}
