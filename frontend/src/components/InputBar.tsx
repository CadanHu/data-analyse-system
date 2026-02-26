import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSSE } from '../hooks/useSSE'

interface InputBarProps {
  sessionId: string | null
  onMessageSent?: () => void
}

export default function InputBar({ sessionId, onMessageSent }: InputBarProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isLoading, isThinkingMode, setThinkingMode } = useChatStore()
  const [isRAGMode, setRAGMode] = useState(false)
  const [ragEngine, setRagEngine] = useState<'light' | 'pro'>('light')
  const [showEngineSelect, setShowEngineSelect] = useState(false)
  const { connect } = useSSE()

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [input])

  const handleSubmit = async () => {
    console.log('🚀 [InputBar] 尝试发送消息...', { input: input.trim(), sessionId, isLoading })
    if (!input.trim() || !sessionId || isLoading) {
      console.warn('⚠️ [InputBar] 发送请求被拦截: ', { 
        inputEmpty: !input.trim(), 
        noSession: !sessionId, 
        isBusy: isLoading 
      })
      return
    }

    const question = input.trim()
    setInput('')
    // 将 RAG 配置传给后端
    console.log('📡 [InputBar] 正在调用 connect...')
    connect(
      sessionId, 
      question, 
      { enable_rag: isRAGMode, rag_engine: ragEngine },
      { onMessageSent }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      const isPDF = file.name.toLowerCase().endsWith('.pdf')
      
      if (isPDF) {
        setShowEngineSelect(true)
      } else {
        setRAGMode(true) // 自动开启 RAG
      }
      
      setInput(prev => prev + `\n[文件: ${file.name}]`)
    }
  }

  const selectEngine = (engine: 'light' | 'pro') => {
    setRagEngine(engine)
    setRAGMode(true)
    setShowEngineSelect(false)
  }

  return (
    <div className="relative">
      {/* 解析引擎选择弹窗 */}
      {showEngineSelect && (
        <div className="absolute bottom-full left-0 mb-4 p-4 bg-white/90 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl z-50 w-72 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h3 className="text-sm font-bold text-gray-800 mb-2">选择 PDF 解析模式</h3>
          <div className="space-y-2">
            <button 
              onClick={() => selectEngine('light')}
              className="w-full text-left p-2 rounded-xl hover:bg-[#BFFFD9]/30 transition-colors border border-transparent hover:border-[#BFFFD9]"
            >
              <div className="text-xs font-bold text-gray-700">⚡ 标准模式 (PyMuPDF)</div>
              <div className="text-[10px] text-gray-500">解析快速、免费、适合纯文字 PDF</div>
            </button>
            <button 
              onClick={() => selectEngine('pro')}
              className="w-full text-left p-2 rounded-xl hover:bg-[#E0FFFF]/30 transition-colors border border-transparent hover:border-[#E0FFFF]"
            >
              <div className="text-xs font-bold text-gray-700">🧠 深度模式 (MinerU)</div>
              <div className="text-[10px] text-gray-500">解析精准、支持公式图表、适合论文/报表</div>
            </button>
          </div>
        </div>
      )}

      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex items-start gap-2 px-4 pt-4">
          <button
            onClick={handleFileUpload}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)]"
            title="上传文件"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.txt,.csv,.xlsx,.xls"
            onChange={handleFileChange}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={!sessionId ? '请先选择一个会话' : '输入你的问题...'}
            disabled={isLoading || !sessionId}
            className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            rows={1}
          />
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setThinkingMode(!isThinkingMode)}
              className={`flex-shrink-0 px-2 h-7 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isThinkingMode 
                  ? 'bg-[#FFD700] text-gray-800 font-medium' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isThinkingMode ? '思考模式已开启' : '思考模式已关闭'}
            >
              <span className="text-[10px]">思考模式</span>
            </button>
            <button
              onClick={() => setRAGMode(!isRAGMode)}
              className={`flex-shrink-0 px-2 h-7 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isRAGMode 
                  ? 'bg-[#00BFFF] text-white font-medium' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isRAGMode ? `知识库模式: ${ragEngine === 'light' ? '标准' : '深度'}` : '知识库模式关闭'}
            >
              <span className="text-[10px]">知识库</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="text-xs text-gray-400">
            {isLoading ? '正在处理中...' : 'Enter 发送 | Shift+Enter 换行'}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || !sessionId || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] disabled:from-gray-200 disabled:to-gray-300 disabled:cursor-not-allowed rounded-xl text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)] disabled:shadow-none"
          >
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span className="text-sm font-medium">发送</span>
          </button>
        </div>
      </div>
    </div>
  )
}
