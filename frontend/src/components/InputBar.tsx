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
  const { isLoading, isThinkingMode, setThinkingMode, pendingMessage, setPendingMessage } = useChatStore()
  const [isRAGMode, setRAGMode] = useState(false)
  const [ragEngine, setRagEngine] = useState<'light' | 'pro'>('light')
  const [showEngineSelect, setShowEngineSelect] = useState(false)
  const { connect } = useSSE()

  // 监听来自引导卡片的点击消息
  useEffect(() => {
    if (pendingMessage && sessionId && !isLoading) {
      // 使用 setTimeout 确保状态同步
      setTimeout(() => {
        handleSubmit(pendingMessage)
        setPendingMessage(null)
      }, 50)
    }
  }, [pendingMessage, sessionId, isLoading])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const isLandscape = window.innerWidth > window.innerHeight;
      const maxHeight = isLandscape ? 60 : 150;
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
    }
  }, [input])

  const handleSubmit = async (overrideInput?: string) => {
    const textToSubmit = overrideInput || input
    console.log('🚀 [InputBar] 尝试发送消息...', { input: textToSubmit.trim(), sessionId, isLoading })
    if (!textToSubmit.trim() || !sessionId || isLoading) {
      console.warn('⚠️ [InputBar] 发送请求被拦截: ', { 
        inputEmpty: !textToSubmit.trim(), 
        noSession: !sessionId, 
        isBusy: isLoading 
      })
      return
    }

    const question = textToSubmit.trim()
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
    <div className="relative landscape:px-2 landscape:pb-1">
      {/* 解析引擎选择弹窗 */}
      {showEngineSelect && (
        <div className="absolute bottom-full left-0 mb-2 p-3 bg-white/90 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl z-50 w-64 landscape:w-80 landscape:grid landscape:grid-cols-2 landscape:gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h3 className="text-sm font-bold text-gray-800 mb-2 landscape:col-span-2">选择 PDF 解析模式</h3>
          <button 
            onClick={() => selectEngine('light')}
            className="w-full text-left p-2 rounded-xl hover:bg-[#BFFFD9]/30 transition-colors border border-transparent hover:border-[#BFFFD9]"
          >
            <div className="text-xs font-bold text-gray-700">⚡ 标准模式</div>
            <div className="text-[9px] text-gray-500">快速、适合纯文字</div>
          </button>
          <button 
            onClick={() => selectEngine('pro')}
            className="w-full text-left p-2 rounded-xl hover:bg-[#E0FFFF]/30 transition-colors border border-transparent hover:border-[#E0FFFF]"
          >
            <div className="text-xs font-bold text-gray-700">🧠 深度模式</div>
            <div className="text-[9px] text-gray-500">表格、公式精准识别</div>
          </button>
        </div>
      )}

      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)] landscape:rounded-xl">
        <div className="flex items-start gap-2 px-4 pt-4 landscape:px-2 landscape:pt-2">
          <button
            onClick={handleFileUpload}
            className="flex-shrink-0 w-9 h-9 landscape:w-7 landscape:h-7 flex items-center justify-center rounded-xl bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] landscape:shadow-none"
            title="上传文件"
          >
            <svg className="w-5 h-5 landscape:w-4 landscape:h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed landscape:text-xs landscape:leading-tight"
            rows={1}
          />
          <div className="flex flex-col gap-1.5 landscape:flex-row landscape:gap-1">
            <button
              onClick={() => setThinkingMode(!isThinkingMode)}
              className={`flex-shrink-0 px-2 h-7 landscape:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isThinkingMode 
                  ? 'bg-[#FFD700] text-gray-800 font-medium' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isThinkingMode ? '思考模式已开启' : '思考模式已关闭'}
            >
              <span className="text-[10px] landscape:text-[9px]">思考模式</span>
            </button>
            <button
              onClick={() => setRAGMode(!isRAGMode)}
              className={`flex-shrink-0 px-2 h-7 landscape:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isRAGMode 
                  ? 'bg-[#00BFFF] text-white font-medium' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isRAGMode ? `知识库模式: ${ragEngine === 'light' ? '标准' : '深度'}` : '知识库模式关闭'}
            >
              <span className="text-[10px] landscape:text-[9px]">知识库</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pb-3 landscape:px-2 landscape:pb-1 landscape:mt-1">
          <div className="text-xs text-gray-400 landscape:text-[9px]">
            {isLoading ? '正在处理中...' : 'Enter 发送'}
          </div>
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || !sessionId || isLoading}
            className="flex items-center gap-2 px-4 py-2 landscape:px-3 landscape:py-1 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] disabled:from-gray-200 disabled:to-gray-300 disabled:cursor-not-allowed rounded-xl text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] landscape:shadow-none"
          >
            <svg className="w-4.5 h-4.5 landscape:w-3 landscape:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span className="text-sm font-medium landscape:text-xs">发送</span>
          </button>
        </div>
      </div>
    </div>
  )
}
