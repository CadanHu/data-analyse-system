import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import type { Message } from '../types/message'
import SqlBlock from './SqlBlock'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { sessionApi } from '@/api'

interface MessageItemProps {
  message: Message
  onEditSubmit?: (content: string, parentId?: string) => void
}

export default function MessageItem({ message, onEditSubmit }: MessageItemProps) {
  const isUser = message.role === 'user'
  const [thinkingCollapsed, setThinkingCollapsed] = useState(!(message.thinking && !message.content))
  const [sqlCollapsed, setSqlCollapsed] = useState(true)
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  
  const { setCurrentAnalysis, setActiveTab, isLoading } = useChatStore()
  const { allMessages, setMessages, currentSession } = useSessionStore()

  // 计算分支信息
  // 逻辑：寻找具有相同 parent_id (包括 null) 且 role 相同的消息
  const siblings = allMessages.filter(m => 
    m.parent_id === message.parent_id && 
    m.role === message.role
  ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  
  const currentIndex = siblings.findIndex(s => s.id === message.id)
  const totalVersions = siblings.length

  // 切换分支
  const handleSwitchBranch = async (direction: 'prev' | 'next') => {
    if (isLoading) return
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= totalVersions) return
    
    const targetMessage = siblings[newIndex]
    
    // 计算从根到该节点的路径
    const path: string[] = []
    let curr: Message | undefined = targetMessage
    while (curr) {
      path.unshift(curr.id)
      curr = allMessages.find(m => m.id === curr?.parent_id)
    }

    // 后端同步
    if (currentSession) {
      try {
        await sessionApi.activateBranch(currentSession.id, path)
        // 重新加载当前分支
        const updatedMessages = await sessionApi.getMessages(currentSession.id)
        setMessages(updatedMessages)
      } catch (e) {
        console.error('切换分支失败:', e)
      }
    }
  }

  const handleEditSubmit = () => {
    if (editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    if (onEditSubmit) {
      onEditSubmit(editContent, message.parent_id)
      setIsEditing(false)
    }
  }

  // 监听思考内容变化，如果是在加载中且有新内容，保持展开
  useEffect(() => {
    if (isLoading && message.thinking && !message.content) {
      setThinkingCollapsed(false)
    }
  }, [message.thinking, isLoading, message.content])

  const handleShowChart = () => {
    let chartConfig = (message as any).chartConfig
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
      setCurrentAnalysis(
        message.sql || '',
        sqlData,
        (chartConfig as any)?.chart_type || 'table',
        chartConfig
      )
      setActiveTab('charts')
    }
  }

  const preprocessContent = (content: string) => {
    if (!content) return ''
    return content
      .replace(/\\\[/g, '$$$$')
      .replace(/\\\]/g, '$$$$')
      .replace(/\\\(/g, '$$')
      .replace(/\\\)/g, '$$')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
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
            {isEditing ? (
              <div className="flex flex-col gap-2 min-w-[260px] max-w-full">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full p-3 text-sm bg-white/50 border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    className="px-4 py-1 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    保存并提交
                  </button>
                </div>
              </div>
            ) : (
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
            )}
          </div>
          
          {totalVersions > 1 && !isEditing && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400 font-medium">
              <button 
                onClick={() => handleSwitchBranch('prev')}
                disabled={currentIndex === 0}
                className="p-1 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-400"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span>{currentIndex + 1} / {totalVersions}</span>
              <button 
                onClick={() => handleSwitchBranch('next')}
                disabled={currentIndex === totalVersions - 1}
                className="p-1 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-400"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {!isUser && message.sql && (
            <SqlBlock sql={message.sql} collapsed={sqlCollapsed} />
          )}
          
          <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-gray-100 pt-3 transition-all">
            {isUser && !isEditing && (
              <div className="relative group/action">
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 bg-white/50 hover:bg-emerald-50 text-gray-400 hover:text-emerald-500 rounded-lg border border-gray-100/50 hover:border-emerald-100 transition-all active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5M16.243 3.757a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L16.243 3.757z" />
                  </svg>
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded pointer-events-none opacity-0 group-hover/action:opacity-100 transition-opacity whitespace-nowrap">
                  修改问题
                </span>
              </div>
            )}

            {!isUser && message.sql && (
              <div className="relative group/action">
                <button
                  onClick={() => setSqlCollapsed(!sqlCollapsed)}
                  className={`p-1.5 rounded-lg transition-all active:scale-95 border ${
                    !sqlCollapsed 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                      : 'bg-white text-gray-400 border-gray-100 hover:text-emerald-500 hover:bg-emerald-50 hover:border-emerald-100'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded pointer-events-none opacity-0 group-hover/action:opacity-100 transition-opacity whitespace-nowrap">
                  {sqlCollapsed ? '显示 SQL' : '隐藏 SQL'}
                </span>
              </div>
            )}

            {!isUser && (message.chart_cfg || (message as any).chartConfig) && message.data && (
              <div className="relative group/action">
                <button
                  onClick={handleShowChart}
                  className="p-1.5 bg-white hover:bg-blue-50 text-gray-400 hover:text-blue-500 rounded-lg border border-gray-100 hover:border-blue-100 transition-all active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded pointer-events-none opacity-0 group-hover/action:opacity-100 transition-opacity whitespace-nowrap">
                  可视看板
                </span>
              </div>
            )}

            <div className="relative group/action">
              <button
                onClick={handleCopy}
                className={`p-1.5 rounded-lg border transition-all active:scale-95 ${
                  copied 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                    : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50 hover:text-gray-600'
                }`}
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                )}
              </button>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded pointer-events-none opacity-0 group-hover/action:opacity-100 transition-opacity whitespace-nowrap">
                {copied ? '已复制' : '复制内容'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
