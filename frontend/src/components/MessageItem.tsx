import { useState } from 'react'
import type { Message } from '../types/message'
import SqlBlock from './SqlBlock'
import { useChatStore } from '../stores/chatStore'

interface MessageItemProps {
  message: Message
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true)
  const { setChartOption, setSqlResult, setCurrentSql, setRightPanelVisible } = useChatStore()

  const handleShowChart = () => {
    let chartConfig = message.chartConfig
    if (!chartConfig && message.chart_cfg) {
      try {
        chartConfig = JSON.parse(message.chart_cfg)
      } catch (e) {
        console.error('解析图表配置失败:', e)
        return
      }
    }
    
    if (chartConfig && message.data) {
      setChartOption(chartConfig, 'bar')
      setSqlResult(message.data)
      if (message.sql) {
        setCurrentSql(message.sql)
      }
      setRightPanelVisible(true)
    }
  }

  return (
    <div className={`flex gap-3 py-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.08)] ${
        isUser 
          ? 'bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF]' 
          : 'bg-gradient-to-r from-[#E6E6FA] to-[#FFFACD]'
      }`}>
        {isUser ? (
          <svg className="w-4.5 h-4.5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <svg className="w-4.5 h-4.5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )}
      </div>
      <div className={`flex-1 max-w-[80%] ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`rounded-2xl px-5 py-4 backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.06)] ${
          isUser 
            ? 'bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] rounded-tr-sm text-gray-700 border border-white/40' 
            : 'bg-white/70 rounded-tl-sm text-gray-700 border border-white/40'
        }`}>
          {!isUser && message.thinking && (
            <div className="mb-4">
              <button
                onClick={() => setThinkingCollapsed(!thinkingCollapsed)}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 mb-3 transition-colors"
              >
                <svg 
                  className={`w-4 h-4 transition-transform ${thinkingCollapsed ? '-rotate-90' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                思考过程
              </button>
              {!thinkingCollapsed && (
                <div className="bg-white/60 rounded-xl p-4 text-xs text-gray-500 italic border border-white/30">
                  {message.thinking}
                </div>
              )}
            </div>
          )}
          
          <p className="whitespace-pre-wrap leading-relaxed text-gray-700">{message.content}</p>
          
          {!isUser && message.sql && (
            <SqlBlock sql={message.sql} />
          )}
          
          {!isUser && (message.chartConfig || message.chart_cfg) && message.data && (
            <div className="mt-4">
              <button
                onClick={handleShowChart}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] rounded-xl text-sm text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)]"
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                查看可视化图表
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
