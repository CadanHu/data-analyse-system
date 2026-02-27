import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import type { Message } from '../types/message'
import SqlBlock from './SqlBlock'
import { useChatStore } from '../stores/chatStore'

interface MessageItemProps {
  message: Message
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  // 如果消息中有思考内容且内容还未完成（处于加载状态），默认展开
  const [thinkingCollapsed, setThinkingCollapsed] = useState(!(message.thinking && !message.content))
  const { setCurrentAnalysis, setActiveTab, isLoading } = useChatStore()

  // 监听思考内容变化，如果是在加载中且有新内容，保持展开
  useEffect(() => {
    if (isLoading && message.thinking && !message.content) {
      setThinkingCollapsed(false)
    }
  }, [message.thinking, isLoading, message.content])

  const handleShowChart = () => {
    let chartConfig = message.chartConfig
    if (!chartConfig && message.chart_cfg) {
      try {
        chartConfig = JSON.parse(message.chart_cfg)
      } catch (e) {
        console.error('解析图表配置失败:', e)
      }
    }

    let sqlData = message.data
    if (typeof sqlData === 'string') {
      try {
        sqlData = JSON.parse(sqlData)
      } catch (e) {
        console.error('解析 SQL 结果失败:', e)
      }
    }
    
    if (sqlData) {
      // 使用统一的 action 同步到右侧面板
      setCurrentAnalysis(
        message.sql || '',
        sqlData,
        (chartConfig as any)?.chart_type || 'table',
        chartConfig
      )
      setActiveTab('charts')
    }
  }

  // 预处理内容，将 \( \) 转换为 $，将 \[ \] 转换为 $$，以确保 remark-math 正确识别
  const preprocessContent = (content: string) => {
    if (!content) return ''
    return content
      .replace(/\\\[/g, '$$$$')
      .replace(/\\\]/g, '$$$$')
      .replace(/\\\(/g, '$$')
      .replace(/\\\)/g, '$$')
  }

  // 复制功能
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => alert('已复制到剪贴板'))
      .catch(err => console.error('复制失败:', err))
  }

  return (
    <div className={`flex py-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[92%] md:max-w-[85%] ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 backdrop-blur-sm shadow-[0_2px_12px_rgba(0,0,0,0.04)] ${
          isUser 
            ? 'bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] rounded-tr-sm text-gray-700 border border-white/40' 
            : 'bg-white/70 rounded-tl-sm text-gray-700 border border-white/40'
        }`}>
          {!isUser && message.thinking && message.thinking.trim().length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setThinkingCollapsed(!thinkingCollapsed)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${
                  thinkingCollapsed 
                    ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                <svg 
                  className={`w-3.5 h-3.5 transition-transform duration-300 ${thinkingCollapsed ? '' : 'rotate-180'}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {thinkingCollapsed ? '查看 AI 思考过程' : '收起思考过程'}
              </button>
              {!thinkingCollapsed && (
                <div className="mt-3 bg-amber-50/50 rounded-xl p-4 text-xs text-gray-600 italic border border-amber-100/50 markdown-body prose prose-sm max-w-none landscape:text-[10px]">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {preprocessContent(message.thinking)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
          
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed overflow-x-auto markdown-body landscape:text-[11px]">
            <ReactMarkdown 
              remarkPlugins={[remarkMath]} 
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ inline, className, children, ...props }: any) {
                  return (
                    <code className={`${className} bg-gray-100 px-1 py-0.5 rounded text-sm font-mono`} {...props}>
                      {children}
                    </code>
                  )
                },
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-4 rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        {children}
                      </table>
                    </div>
                  )
                }
              }}
            >
              {preprocessContent(message.content)}
            </ReactMarkdown>
          </div>
          
          {!isUser && message.sql && (
            <SqlBlock sql={message.sql} />
          )}
          
          {/* 优化后的操作栏：按钮更小且并排 */}
          {!isUser && (
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
              {(message.chartConfig || message.chart_cfg) && message.data && (
                <button
                  onClick={handleShowChart}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] rounded-lg text-[11px] font-bold text-gray-700 transition-all shadow-sm active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  可视看板
                </button>
              )}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-[11px] font-bold text-gray-500 transition-all active:scale-95 border border-gray-200"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                复制
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
