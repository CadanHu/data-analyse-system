import { useState, useRef, useEffect } from 'react'
import { Sparkles } from 'lucide-react' // 🚀 引入新图标
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useSSE } from '../hooks/useSSE'
import { useTranslation } from '../hooks/useTranslation'
import { uploadApi, messageApi, sessionApi, databaseApi } from '@/api'

interface InputBarProps {
  sessionId: string | null
  onMessageSent?: () => void
  currentDb?: string | null
}

export default function InputBar({ sessionId, onMessageSent, currentDb }: InputBarProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { 
    isLoading, 
    isThinkingMode, 
    setThinkingMode, 
    isDataScienceMode, 
    setDataScienceMode, 
    pendingMessage, 
    setPendingMessage, 
    setIsLoading, 
    isMobile, 
    orientation 
  } = useChatStore()
  const { messages, addMessage, currentSession, updateSession } = useSessionStore()
  const [isRAGMode, setRAGMode] = useState(false)

  // 🚀 核心逻辑：从会话中恢复模式状态
  useEffect(() => {
    if (currentSession && sessionId === currentSession.id) {
      console.log('🔄 [InputBar] 正在从会话恢复模式状态:', currentSession.title);
      setThinkingMode(!!currentSession.enable_thinking)
      setDataScienceMode(!!currentSession.enable_data_science_agent)
      setRAGMode(!!currentSession.enable_rag)
    }
  }, [currentSession?.id, sessionId])

  // 🚀 辅助函数：同步模式到后端
  const syncModes = async (updates: { enable_data_science_agent?: boolean, enable_thinking?: boolean, enable_rag?: boolean }) => {
    if (!sessionId) return
    try {
      await sessionApi.updateSessionModes(sessionId, updates)
      updateSession(sessionId, updates) // 更新本地 store
    } catch (e) {
      console.error('Failed to sync modes:', e)
    }
  }
  const [isKnowledgeMode, setKnowledgeMode] = useState(false)
  const [useHighPrecision, setUseHighPrecision] = useState(false) // 🚀 高精度 OCR 开关
  const [ragEngine, setRagEngine] = useState<'light' | 'pro'>('light')
  const [showEngineSelect, setShowEngineSelect] = useState(false)
  const { connect, disconnect } = useSSE()
  const { t, language } = useTranslation()

  const [pendingFile, setPendingFile] = useState<File | null>(null)

  useEffect(() => {
    const processPending = async () => {
      if (pendingMessage && !isLoading) {
        // 🚀 核心修复：如果没选会话，先创建一个
        if (!sessionId) {
          console.log('🚀 [InputBar] No session, creating one for pending message...')
          try {
            const session = await sessionApi.createSession()
            // 更新 Store
            const { sessions, setSessions, setCurrentSession, clearMessages } = useSessionStore.getState()
            setSessions([session, ...sessions])
            clearMessages()
            setCurrentSession(session)
            // 注意：这里不需要手动 handleSubmit，因为 sessionId 改变后，
            // 下一次 useEffect (依赖 [pendingMessage, sessionId]) 会触发它
            if (onMessageSent) onMessageSent()
          } catch (e) {
            console.error('Failed to create session for pending message:', e)
            setPendingMessage(null)
          }
          return
        }

        // 如果已有 sessionId，直接发送
        console.log('🚀 [InputBar] Session exists, sending pending message...')
        setTimeout(() => {
          handleSubmit(pendingMessage)
          setPendingMessage(null)
        }, 100)
      }
    }
    processPending()
  }, [pendingMessage, sessionId, isLoading])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const isMobileLandscape = isMobile && orientation === 'landscape'
      const maxHeight = isMobileLandscape ? 60 : 150;
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
    }
  }, [input, isMobile, orientation])

  const handleSubmit = async (overrideInput?: string) => {
    const textToSubmit = overrideInput || input
    if (!textToSubmit.trim() || !sessionId || isLoading) return

    const question = textToSubmit.trim()
    
    // 🚀 核心修复：如果还没选库（比如刚通过 pending 自动创建的会话），自动帮他选第一个
    if (!currentDb) {
      console.log('🎯 [InputBar] No DB selected, trying auto-select first one...')
      try {
        const { databases } = await databaseApi.getDatabases()
        if (databases && databases.length > 0) {
          const firstDb = databases[0].key
          await databaseApi.switchDatabase(firstDb, sessionId)
          updateSession(sessionId, { database_key: firstDb })
          // 重新进入 handleSubmit（递归调用一次，此时 currentDb 还没刷新，但后端已经切换成功）
          // 或者通过 connect 注入 db 逻辑
        } else {
          alert(t('chat.selectDb'))
          return
        }
      } catch (e) {
        console.error('Auto select DB failed:', e)
        alert(t('chat.selectDb'))
        return
      }
    }

    setInput('')

    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
    const parentId = lastMessage?.id

    connect(
      sessionId,
      question,
      { 
        enable_rag: isRAGMode, 
        rag_engine: ragEngine,
        parent_id: parentId,
        enable_data_science_agent: isDataScienceMode,
        enable_thinking: isThinkingMode
      },
      { 
        onMessageSent,
        onError: (err) => {
          console.error('SSE Error:', err)
          alert(`${t('alert.analysisFailed')}: ${err}`)
        }
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 关键修复：如果是中文输入法正在输入确认，不触发发送
    if (e.nativeEvent.isComposing) return

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileUpload = () => {
    if (!sessionId) {
      alert(t('alert.selectSessionFirst'))
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
        alert(t('alert.processing'))
        return
      }

      const file = files[0]
      const fileName = file.name.trim()
      const isPDF = fileName.toLowerCase().endsWith('.pdf')
      const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName)
      const isOtherDoc = /\.(txt|md|csv|xlsx|xls)$/i.test(fileName)
      
      console.log('文件选择触发:', fileName, '是否PDF:', isPDF, '是否图片:', isImage, '是否其他文档:', isOtherDoc)

      if (isKnowledgeMode) {
        // 在“深度”模式下，所有支持的文档都直接进入抽取流程
        if (isPDF || isOtherDoc || isImage) {
          console.log('Entering startKnowledgeExtraction')
          startKnowledgeExtraction(file)
        } else {
          alert(t('alert.fileTypeNotSupported'))
        }
      } else {
        // 普通模式逻辑：如果是 PDF 或 图片，弹出引擎选择框
        if (isPDF || isImage) {
          console.log('Showing engine select modal for:', fileName)
          setPendingFile(file)
          setShowEngineSelect(true)
        } else if (isOtherDoc) {
          handleStandardUpload(file)
        }
      }
      
      // 关键：重置 input 以便可以连续选择同一个文件
      e.target.value = ''
    } else {
      console.log('Condition not met: files:', !!files, 'sessionId:', !!sessionId)
      if (!sessionId) {
        alert(t('alert.sessionIdMissing'))
      }
    }
  }
const handleStandardUpload = async (file: File) => {
  try {
    setIsLoading(true)
    // 🚀 传给后端高精度标志
    const response = await uploadApi.upload(file, sessionId!, 'light', useHighPrecision)
    setRAGMode(true)
    console.log('文件已索引:', file.name)

    // ✨ 在 UI 中给出明确的正面反馈
    addMessage({
      id: `sys_${Date.now()}`,
      session_id: sessionId!,
      role: 'assistant',
      content: `✅ **${t('common.success')}**\nFile: 《${file.name}》\n\n**Preview:**\n> ${response.text_preview}...\n\n`,
      created_at: new Date().toISOString()
    })
  } catch (error: any) {
      console.error('文件上传失败:', error)
      alert(`${t('alert.filePreprocessingFailed')}: ${error.response?.data?.detail || error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const startKnowledgeExtraction = async (file: File) => {
    const messageId = `local_${Date.now()}`
    let progressTimer: any = null
    const startTime = Date.now()
    
    try {
      setIsLoading(true)
      setKnowledgeMode(true)
      setShowEngineSelect(false)
      
      const statuses = language === 'zh' ? [
        `第 1 步：正在上传文件到 MinerU 云端...`,
        `第 2 步：正在进行 AI 布局 analysis (OCR/公式识别)...`,
        `第 3 步：正在调用 DeepSeek 进行知识建模...`,
        `第 4 步：正在将结构化知识点保存到数据库...`,
        `☕ 任务处理中，文件虽小但逻辑密集，请耐心等待最后一步完成...`
      ] : [
        `Step 1: Uploading file to MinerU Cloud...`,
        `Step 2: AI Layout Analysis (OCR/Formula recognition)...`,
        `Step 3: Calling DeepSeek for knowledge modeling...`,
        `Step 4: Saving structured knowledge to database...`,
        `☕ Processing... please wait for the final step to complete.`
      ]
      let statusIdx = 0

      addMessage({
        id: messageId,
        session_id: sessionId!,
        role: 'user',
        content: `【${t('chat.proMode')}】File: ${file.name}\nProgress: ${statuses[0]} (Elapsed: 0s)`,
        created_at: new Date().toISOString()
      })

      // 动态更新状态的计时器 (改为每 1 秒更新一次，以显示秒数)
      progressTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const seconds = elapsed % 60
        const minutes = Math.floor(elapsed / 60)
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
        
        // 每 10 秒切换一次文本状态
        if (elapsed % 10 === 0 && elapsed > 0) {
          statusIdx = Math.min(statusIdx + 1, statuses.length - 1)
        }

        useSessionStore.getState().updateMessage(messageId, {
          content: `【${t('chat.proMode')}】File: ${file.name}\nProgress: ${statuses[statusIdx]} (Elapsed: ${timeStr})`
        })
      }, 1000)

      const response = await uploadApi.extractKnowledge(file, sessionId!, useHighPrecision)
      
      // 如果后端返回正在处理（异步模式）
      if (response.status === 'processing') {
        clearInterval(progressTimer)
        useSessionStore.getState().updateMessage(messageId, {
          content: `⏳ **${t('alert.processing')}**\nFile: 《${file.name}》\nStatus: ${t('chat.proMode')} task submitted to background.`
        })
        
        // 开启一个轮询，每 10 秒刷新一次消息列表，直到看到完成消息
        const pollInterval = setInterval(async () => {
          if (onMessageSent) onMessageSent()
          // 检查最后一条消息是否包含“完成”字样（简单判断）
          const currentMessages = useSessionStore.getState().messages
          const lastMsg = currentMessages[currentMessages.length - 1]
          if (lastMsg?.content?.includes('完成') || lastMsg?.content?.includes('失败') || lastMsg?.content?.includes('Complete') || lastMsg?.content?.includes('Failed')) {
            clearInterval(pollInterval)
          }
        }, 10000)
        
        return
      }

      // 否则（同步模式，兼容旧代码）
      clearInterval(progressTimer)
      const totalElapsed = Math.floor((Date.now() - startTime) / 1000)
      const knowledgeCount = response.knowledge_count
      const summary = `✅ ${t('common.success')}! (Total: ${totalElapsed}s)\nExtracted ${knowledgeCount} structured points from 《${file.name}》.`
      
      const finalResponseData = {
        knowledge: response.data,
        markdown_full: response.markdown_preview,
        file_url: response.file_url,
        is_knowledge_extraction: true
      }

      const assistantMsg = {
        id: `resp_${Date.now()}`,
        session_id: sessionId!,
        role: 'assistant' as const,
        content: summary,
        data: JSON.stringify(finalResponseData)
      }
      
      addMessage({
        ...assistantMsg,
        created_at: new Date().toISOString()
      })
      
      // 持久化到数据库
      try {
        await messageApi.saveMessage(sessionId!, {
          session_id: sessionId!,
          role: 'assistant',
          content: summary,
          data: JSON.stringify(finalResponseData)
        })
      } catch (saveErr) {
        console.error('Failed to persist knowledge message:', saveErr)
      }
      
      if (onMessageSent) onMessageSent()
    } catch (error: any) {
      if (progressTimer) clearInterval(progressTimer)
      console.error('深度提取异常:', error)
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout')
      
      let errorMsg = error.response?.data?.detail || error.message
      if (isTimeout) {
        errorMsg = 'Timeout (but background task might continue). Check terminal for progress.'
      }
      
      useSessionStore.getState().updateMessage(messageId, {
        content: `⚠️ Error: ${file.name}\nStatus: ${errorMsg}`
      })
      
      if (!isTimeout) alert(`${t('alert.exception')}: ${errorMsg}`)
    } finally {
      setIsLoading(false)
      setKnowledgeMode(false)
    }
  }

  const selectEngine = async (engine: 'light' | 'pro' | 'knowledge') => {
    const file = pendingFile
    if (!file) {
      setShowEngineSelect(false)
      return
    }

    if (engine === 'knowledge') {
      startKnowledgeExtraction(file)
    } else {
      // 普通 PDF 模式：先上传解析
      setRagEngine(engine as any)
      try {
        setIsLoading(true)
        await uploadApi.upload(file, sessionId!, engine)
        setRAGMode(true)
        console.log('PDF已索引:', file.name)
      } catch (e: any) {
        alert(`${t('alert.parseFailed')}: ${e.message}`)
      } finally {
        setIsLoading(false)
      }
    }
    
    setShowEngineSelect(false)
    setPendingFile(null)
  }

  const isMobilePortrait = isMobile && orientation === 'portrait'

  return (
    <div className="relative data-[mobile=true]:data-[orientation=landscape]:px-2 data-[mobile=true]:data-[orientation=landscape]:pb-1">
      {showEngineSelect && (
        <div className="absolute bottom-full left-0 mb-2 p-3 bg-white/90 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl z-50 w-64 data-[mobile=true]:data-[orientation=landscape]:w-80 data-[mobile=true]:data-[orientation=landscape]:grid data-[mobile=true]:data-[orientation=landscape]:grid-cols-2 data-[mobile=true]:data-[orientation=landscape]:gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h3 className="text-sm font-bold text-gray-800 mb-2 data-[mobile=true]:data-[orientation=landscape]:col-span-2">{t('chat.pdfModeTitle')}</h3>

          <button
            onClick={() => selectEngine('light')}
            className="w-full text-left p-2 rounded-xl hover:bg-green-50 transition-colors border border-transparent hover:border-green-200"
          >
            <div className="text-xs font-bold text-gray-700">⚡ {t('chat.lightMode')}</div>
            <div className="text-[9px] text-gray-500">{t('chat.pdfModeDesc')}</div>
          </button>

          <button
            onClick={() => selectEngine('pro')}
            className="w-full text-left p-2 rounded-xl hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
          >
            <div className="text-xs font-bold text-gray-700">🧠 {t('chat.proMode')}</div>
            <div className="text-[9px] text-gray-500">Enhanced knowledge-based chat</div>
          </button>

          <button
            onClick={() => selectEngine('knowledge')}
            className="w-full text-left p-2 rounded-xl hover:bg-purple-50 transition-colors border border-transparent hover:border-purple-200 data-[mobile=true]:data-[orientation=landscape]:col-span-2 mt-1"
          >
            <div className="text-[11px] font-bold text-purple-700">💎 {t('feature.file.title')} (MinerU)</div>
            <div className="text-[9px] text-gray-500">{t('feature.file.desc')}</div>
          </button>
        </div>
      )}

      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)] data-[mobile=true]:data-[orientation=landscape]:rounded-xl">
        <div className="flex items-center gap-2 px-4 pt-4 data-[mobile=true]:data-[orientation=landscape]:px-2 data-[mobile=true]:data-[orientation=landscape]:pt-2">
          <button
            onClick={handleFileUpload}
            className="flex-shrink-0 w-9 h-9 data-[mobile=true]:data-[orientation=landscape]:w-7 data-[mobile=true]:data-[orientation=landscape]:h-7 flex items-center justify-center rounded-xl bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] data-[mobile=true]:data-[orientation=landscape]:shadow-none"
            title={t('chat.upload')}
          >
            <svg className="w-5 h-5 data-[mobile=true]:data-[orientation=landscape]:w-4 data-[mobile=true]:data-[orientation=landscape]:h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* 🚀 高精度 OCR 模式开关 */}
          <button
            onClick={() => {
              setUseHighPrecision(!useHighPrecision);
              if (!useHighPrecision) {
                console.log('✨ Enabled High Precision OCR');
              }
            }}
            className={`flex-shrink-0 w-9 h-9 data-[mobile=true]:data-[orientation=landscape]:w-7 data-[mobile=true]:data-[orientation=landscape]:h-7 flex items-center justify-center rounded-xl transition-all border ${
              useHighPrecision
                ? 'bg-purple-500/10 border-purple-500/40 text-purple-600 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                : 'bg-gray-100/50 border-gray-200/50 text-gray-400 grayscale'
            }`}
            title={useHighPrecision ? "✨ High Precision OCR ON" : "Enable High Precision OCR"}
          >
            <Sparkles size={18} className={useHighPrecision ? 'animate-pulse' : ''} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.txt,.csv,.xlsx,.xls,.md"
            onChange={handleFileChange}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !sessionId
                ? t('chat.noSession')
                : !currentDb
                  ? '⚠️ Please select a database in the top right'
                  : isKnowledgeMode
                    ? t('feature.file.title')
                    : t('chat.placeholder')
            }
            disabled={isLoading || !sessionId || !currentDb}
            className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed data-[mobile=true]:data-[orientation=landscape]:text-xs data-[mobile=true]:data-[orientation=landscape]:leading-tight"
            rows={1}
          />

          {/* 手机竖屏：发送按钮移到输入框右侧 */}
          {isMobilePortrait && (
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || !sessionId || isLoading || !currentDb}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] disabled:from-gray-200 disabled:to-gray-300 disabled:cursor-not-allowed shadow-sm transition-all"
              title={t('chat.send')}
            >
              <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center px-4 pb-3 data-[mobile=true]:data-[orientation=landscape]:px-2 data-[mobile=true]:data-[orientation=landscape]:pb-1 data-[mobile=true]:data-[orientation=landscape]:mt-1">
          {!isMobilePortrait && (
            <div className="text-xs text-gray-400 data-[mobile=true]:data-[orientation=landscape]:text-[9px]">
              {isLoading ? t('common.loading') : 'Enter to ' + t('chat.send')}
            </div>
          )}

          <div className={`flex items-center gap-1.5 ${isMobilePortrait ? 'flex-1 justify-around' : 'ml-auto mr-3'}`}>
            <button
              onClick={() => {
                if (isLoading) return
                setKnowledgeMode(!isKnowledgeMode)
                if (!isKnowledgeMode) setRAGMode(false)
              }}
              disabled={isLoading}
              className={`flex-shrink-0 px-2 h-7 data-[mobile=true]:data-[orientation=landscape]:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isKnowledgeMode
                  ? 'bg-purple-500 text-white font-medium shadow-purple-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="MinerU Deep Knowledge Extraction"
            >
              <span className="text-[10px] data-[mobile=true]:data-[orientation=landscape]:text-[9px]">{t('chat.proMode')}</span>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!isLoading) {
                  const newVal = !isThinkingMode
                  setThinkingMode(newVal)
                  syncModes({ enable_thinking: newVal })
                }
              }}
              disabled={isLoading}
              className={`flex-shrink-0 px-2 h-7 data-[mobile=true]:data-[orientation=landscape]:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isThinkingMode
                  ? 'bg-[#FFD700] text-gray-800 font-medium'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isThinkingMode ? t('chat.thinkingMode') + ' ON' : t('chat.thinkingMode') + ' OFF'}
            >
              <span className="text-[10px] data-[mobile=true]:data-[orientation=landscape]:text-[9px]">{t('chat.thinkingMode')}</span>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!isLoading) {
                  const newVal = !isDataScienceMode
                  setDataScienceMode(newVal)
                  syncModes({ enable_data_science_agent: newVal })
                }
              }}
              disabled={isLoading}
              className={`flex-shrink-0 px-2 h-7 data-[mobile=true]:data-[orientation=landscape]:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isDataScienceMode
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-indigo-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="Scientist Mode (Python Driven)"
            >
              <span className="text-[10px] data-[mobile=true]:data-[orientation=landscape]:text-[9px]">Scientist</span>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!isLoading) {
                  const newVal = !isRAGMode
                  setRAGMode(newVal)
                  if (newVal) setKnowledgeMode(false)
                  syncModes({ enable_rag: newVal })
                }
              }}
              disabled={isLoading}
              className={`flex-shrink-0 px-2 h-7 data-[mobile=true]:data-[orientation=landscape]:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isRAGMode
                  ? 'bg-[#00BFFF] text-white font-medium'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isRAGMode ? t('chat.ragMode') + `: ${ragEngine === 'light' ? t('chat.lightMode') : t('chat.proMode')}` : t('chat.ragMode') + ' OFF'}
            >
              <span className="text-[10px] data-[mobile=true]:data-[orientation=landscape]:text-[9px]">{t('chat.ragMode')}</span>
            </button>
          </div>

          {/* 手机竖屏：停止按钮（仅加载时显示） */}
          {isMobilePortrait ? (
            isLoading && (
              <button
                onClick={disconnect}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all active:scale-95 border border-red-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-xs font-medium">Stop</span>
              </button>
            )
          ) : (
            <div className="flex items-center gap-2">
              {isLoading && (
                <button
                  onClick={disconnect}
                  className="flex items-center gap-2 px-4 py-2 data-[mobile=true]:data-[orientation=landscape]:px-3 data-[mobile=true]:data-[orientation=landscape]:py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all active:scale-95 border border-red-100"
                >
                  <svg className="w-4 h-4 data-[mobile=true]:data-[orientation=landscape]:w-3 data-[mobile=true]:data-[orientation=landscape]:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-sm font-medium data-[mobile=true]:data-[orientation=landscape]:text-xs">Stop</span>
                </button>
              )}
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || !sessionId || isLoading || !currentDb}
                className="flex items-center gap-2 px-4 py-2 data-[mobile=true]:data-[orientation=landscape]:px-3 data-[mobile=true]:data-[orientation=landscape]:py-1 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] disabled:from-gray-200 disabled:to-gray-300 disabled:cursor-not-allowed rounded-xl text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] data-[mobile=true]:data-[orientation=landscape]:shadow-none"
              >
                <svg className="w-4.5 h-4.5 data-[mobile=true]:data-[orientation=landscape]:w-3 data-[mobile=true]:data-[orientation=landscape]:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span className="text-sm font-medium data-[mobile=true]:data-[orientation=landscape]:text-xs">{t('chat.send')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
