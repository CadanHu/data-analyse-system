import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useSSE } from '../hooks/useSSE'
import { useTranslation } from '../hooks/useTranslation'
import { uploadApi } from '@/api'

interface InputBarProps {
  sessionId: string | null
  onMessageSent?: () => void
}

export default function InputBar({ sessionId, onMessageSent }: InputBarProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isLoading, isThinkingMode, setThinkingMode, pendingMessage, setPendingMessage, setIsLoading } = useChatStore()
  const { messages, addMessage } = useSessionStore()
  const [isRAGMode, setRAGMode] = useState(false)
  const [isKnowledgeMode, setKnowledgeMode] = useState(false)
  const [ragEngine, setRagEngine] = useState<'light' | 'pro'>('light')
  const [showEngineSelect, setShowEngineSelect] = useState(false)
  const { connect } = useSSE()
  const { t } = useTranslation()

  const [pendingFile, setPendingFile] = useState<File | null>(null)

  useEffect(() => {
    if (pendingMessage && sessionId && !isLoading) {
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
    if (!textToSubmit.trim() || !sessionId || isLoading) return

    const question = textToSubmit.trim()
    setInput('')

    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
    const parentId = lastMessage?.id

    connect(
      sessionId,
      question,
      { 
        enable_rag: isRAGMode, 
        rag_engine: ragEngine,
        parent_id: parentId
      },
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
    if (!sessionId) {
      alert('请先选择或创建一个会话')
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    console.log('handleFileChange triggered, files:', files?.length, 'sessionId:', sessionId)
    
    if (files && files.length > 0 && sessionId) {
      if (isLoading) {
        console.log('isLoading is true, skipping file change')
        alert('正在处理中，请稍候再试')
        return
      }

      const file = files[0]
      const fileName = file.name.trim()
      const isPDF = fileName.toLowerCase().endsWith('.pdf')
      
      console.log('文件选择触发:', fileName, '是否PDF:', isPDF)
      alert(`已选择文件: ${fileName}, 模式: ${isKnowledgeMode ? '深度抽取' : '普通对话'}`)

      if (isPDF) {
        if (isKnowledgeMode) {
          console.log('Entering startKnowledgeExtraction')
          startKnowledgeExtraction(file)
        } else {
          console.log('Showing engine select modal')
          setPendingFile(file)
          setShowEngineSelect(true)
        }
      } else {
        setRAGMode(true)
        setInput(prev => prev + `\n[文件：${fileName}]`)
      }
      
      // 关键：重置 input 以便可以连续选择同一个文件
      e.target.value = ''
    } else {
      console.log('Condition not met: files:', !!files, 'sessionId:', !!sessionId)
      if (!sessionId) {
        alert('错误：会话 ID 丢失，请刷新页面或重新创建会话')
      }
    }
  }

  const startKnowledgeExtraction = async (file: File) => {
    const messageId = `local_${Date.now()}`
    let progressTimer: any = null
    
    try {
      setIsLoading(true)
      setKnowledgeMode(true)
      setShowEngineSelect(false)
      
      const statuses = [
        `第 1 步：正在上传文件到 MinerU 云端...`,
        `第 2 步：正在进行 AI 布局分析 (OCR/公式识别)...`,
        `第 3 步：正在调用 DeepSeek 进行知识建模...`,
        `第 4 步：正在将结构化知识点保存到数据库...`,
        `☕ 任务处理中，文件虽小但逻辑密集，请耐心等待最后一步完成...`
      ]
      let statusIdx = 0

      addMessage({
        id: messageId,
        session_id: sessionId!,
        role: 'user',
        content: `【深度知识抽取】文件：${file.name}\n当前进度：${statuses[0]}`
      })

      // 动态更新状态的计时器
      progressTimer = setInterval(() => {
        statusIdx = Math.min(statusIdx + 1, statuses.length - 1)
        // 使用新增加的 updateMessage 函数更新特定消息
        useSessionStore.getState().updateMessage(messageId, {
          content: `【深度知识抽取】文件：${file.name}\n当前进度：${statuses[statusIdx]}`
        })
      }, 10000) // 每 10 秒切换一次状态提示

      const response = await uploadApi.extractKnowledge(file)
      
      clearInterval(progressTimer)
      const knowledgeCount = response.knowledge_count
      const summary = `✅ 深度抽取完成！从《${file.name}》中提取了 ${knowledgeCount} 条结构化知识点并存入 PostgreSQL。\n\n**解析内容预览:**\n${response.markdown_preview.substring(0, 500)}...`
      
      addMessage({
        id: `resp_${Date.now()}`,
        session_id: sessionId!,
        role: 'assistant',
        content: summary,
        data: JSON.stringify(response.data)
      })
      
      if (onMessageSent) onMessageSent()
    } catch (error: any) {
      if (progressTimer) clearInterval(progressTimer)
      console.error('深度提取失败:', error)
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout')
      const errorMsg = isTimeout ? '处理超时（文件较大或云端解析缓慢），请稍后在“知识库”中查看结果' : (error.response?.data?.detail || error.message)
      
      useSessionStore.getState().updateMessage(messageId, {
        content: `❌ 深度处理失败: ${file.name}\n原因: ${errorMsg}`
      })
      
      alert('处理异常: ' + errorMsg)
    } finally {
      setIsLoading(false)
      setKnowledgeMode(false)
    }
  }

  const selectEngine = (engine: 'light' | 'pro' | 'knowledge') => {
    const file = pendingFile
    if (!file) {
      setShowEngineSelect(false)
      return
    }

    if (engine === 'knowledge') {
      startKnowledgeExtraction(file)
    } else {
      setRagEngine(engine as any)
      setRAGMode(true)
      setInput(prev => prev + `\n[文件：${file.name}]`)
    }
    
    setShowEngineSelect(false)
    setPendingFile(null)
  }

  return (
    <div className="relative landscape:px-2 landscape:pb-1">
      {showEngineSelect && (
        <div className="absolute bottom-full left-0 mb-2 p-3 bg-white/90 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl z-50 w-64 landscape:w-80 landscape:grid landscape:grid-cols-2 landscape:gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h3 className="text-sm font-bold text-gray-800 mb-2 landscape:col-span-2">选择处理方式</h3>
          
          <button
            onClick={() => selectEngine('light')}
            className="w-full text-left p-2 rounded-xl hover:bg-green-50 transition-colors border border-transparent hover:border-green-200"
          >
            <div className="text-xs font-bold text-gray-700">⚡ 快速摘要</div>
            <div className="text-[9px] text-gray-500">基础解析，速度极快</div>
          </button>

          <button
            onClick={() => selectEngine('pro')}
            className="w-full text-left p-2 rounded-xl hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
          >
            <div className="text-xs font-bold text-gray-700">🧠 智能对话</div>
            <div className="text-[9px] text-gray-500">结合知识库，精准问答</div>
          </button>

          <button
            onClick={() => selectEngine('knowledge')}
            className="w-full text-left p-2 rounded-xl hover:bg-purple-50 transition-colors border border-transparent hover:border-purple-200 landscape:col-span-2 mt-1"
          >
            <div className="text-[11px] font-bold text-purple-700">💎 深度知识抽取 (MinerU)</div>
            <div className="text-[9px] text-gray-500">识别表格/公式并结构化存入 PostgreSQL</div>
          </button>
        </div>
      )}

      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)] landscape:rounded-xl">
        <div className="flex items-start gap-2 px-4 pt-4 landscape:px-2 landscape:pt-2">
          <button
            onClick={handleFileUpload}
            className="flex-shrink-0 w-9 h-9 landscape:w-7 landscape:h-7 flex items-center justify-center rounded-xl bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] landscape:shadow-none"
            title={t('chat.upload')}
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
            placeholder={!sessionId ? t('chat.noSession') : (isKnowledgeMode ? '深度抽取模式：点击加号上传文档' : t('chat.placeholder'))}
            disabled={isLoading || !sessionId}
            className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed landscape:text-xs landscape:leading-tight"
            rows={1}
          />
          <div className="flex flex-col gap-1.5 landscape:flex-row landscape:gap-1">
            <button
              onClick={() => {
                if (isLoading) return
                setKnowledgeMode(!isKnowledgeMode)
                if (!isKnowledgeMode) setRAGMode(false)
              }}
              disabled={isLoading}
              className={`flex-shrink-0 px-2 h-7 landscape:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isKnowledgeMode
                  ? 'bg-purple-500 text-white font-medium shadow-purple-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="深度知识库处理（MinerU + LangExtract）"
            >
              <span className="text-[10px] landscape:text-[9px]">深度</span>
            </button>
            <button
              onClick={() => !isLoading && setThinkingMode(!isThinkingMode)}
              disabled={isLoading}
              className={`flex-shrink-0 px-2 h-7 landscape:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isThinkingMode
                  ? 'bg-[#FFD700] text-gray-800 font-medium'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isThinkingMode ? t('chat.thinkingMode') + ' ON' : t('chat.thinkingMode') + ' OFF'}
            >
              <span className="text-[10px] landscape:text-[9px]">{t('chat.thinkingMode')}</span>
            </button>
            <button
              onClick={() => {
                if (isLoading) return
                setRAGMode(!isRAGMode)
                if (!isRAGMode) setKnowledgeMode(false)
              }}
              disabled={isLoading}
              className={`flex-shrink-0 px-2 h-7 landscape:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isRAGMode
                  ? 'bg-[#00BFFF] text-white font-medium'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isRAGMode ? t('chat.ragMode') + `: ${ragEngine === 'light' ? t('chat.lightMode') : t('chat.proMode')}` : t('chat.ragMode') + ' OFF'}
            >
              <span className="text-[10px] landscape:text-[9px]">{t('chat.ragMode')}</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pb-3 landscape:px-2 landscape:pb-1 landscape:mt-1">
          <div className="text-xs text-gray-400 landscape:text-[9px]">
            {isLoading ? t('common.loading') : 'Enter ' + t('chat.send')}
          </div>
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || !sessionId || isLoading}
            className="flex items-center gap-2 px-4 py-2 landscape:px-3 landscape:py-1 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] disabled:from-gray-200 disabled:to-gray-300 disabled:cursor-not-allowed rounded-xl text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] landscape:shadow-none"
          >
            <svg className="w-4.5 h-4.5 landscape:w-3 landscape:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span className="text-sm font-medium landscape:text-xs">{t('chat.send')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
