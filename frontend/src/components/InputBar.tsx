import { useState, useRef, useEffect } from 'react'
import { Sparkles, KeyRound, WifiOff } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useSSE } from '../hooks/useSSE'
import { useTranslation } from '../hooks/useTranslation'
import { uploadApi, messageApi, sessionApi, databaseApi, getBaseURL } from '@/api'
import { cacheFile } from '@/services/fileCache'
import ModelKeyModal from './ModelKeyModal'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { localUpdateSession } from '@/services/localStore'
import { Capacitor } from '@capacitor/core'
import { processDocument, loadKnowledgeGraph } from '@/services/mobileKnowledgeService'
import KnowledgeGraphModal from './KnowledgeGraphModal'

// 支持思考模式的模型（和后端 THINKING_SUPPORTED 保持一致）
const THINKING_SUPPORTED_MODELS = new Set([
  'deepseek-reasoner',
  // OpenAI o-series
  'o3', 'o3-mini', 'o4-mini',
  // Google
  'gemini-3.1-pro-preview',
  // Anthropic
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-20250219',
])

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
    orientation,
    showModelKeyModal,
    setShowModelKeyModal,
  } = useChatStore()
  const { messages, addMessage, currentSession, updateSession } = useSessionStore()
  const { offlineMode, localUserId } = useAuthStore()
  const { connectionStatus } = useSyncStore()
  const isOffline = connectionStatus === 'offline' || offlineMode
  const isMobileNative = Capacitor.isNativePlatform()
  // RAG 三档状态: off → session（当前会话文件）→ global（全用户文件）→ off
  type RagScope = 'off' | 'session' | 'global'
  const [ragScope, setRagScope] = useState<RagScope>('off')
  // 当前会话是否已上传过文件（用于决定点击 RAG 时进 session 还是 global）
  const [sessionHasFiles, setSessionHasFiles] = useState(false)
  const [currentModelProvider, setCurrentModelProvider] = useState<string | null>(null)
  const [currentModelNameLocal, setCurrentModelNameLocal] = useState<string | null>(null)

  // 思考模式是否被当前模型支持
  const thinkingSupported = !currentModelNameLocal || THINKING_SUPPORTED_MODELS.has(currentModelNameLocal)

  // 🚀 核心逻辑：从会话中恢复模式状态
  useEffect(() => {
    if (currentSession && sessionId === currentSession.id) {
      console.log('🔄 [InputBar] 正在从会话恢复模式状态:', currentSession.title);
      setThinkingMode(!!currentSession.enable_thinking)
      setDataScienceMode(!!currentSession.enable_data_science_agent)
      // 切换会话时 RAG 重置为 off，sessionHasFiles 也重置
      setRagScope('off')
      setSessionHasFiles(false)
      // 优先用会话自身保存的模型，否则回退全局默认（localStorage）
      const provider = currentSession.model_provider || localStorage.getItem('DEFAULT_PROVIDER') || null
      const model    = currentSession.model_name    || localStorage.getItem('DEFAULT_MODEL')    || null
      setCurrentModelProvider(provider)
      setCurrentModelNameLocal(model)
    }
  }, [currentSession?.id, sessionId])

  // 🚀 辅助函数：同步模式到后端 + 本地 SQLite
  const syncModes = async (updates: { enable_data_science_agent?: boolean, enable_thinking?: boolean, enable_rag?: boolean, rag_scope?: string }) => {
    if (!sessionId) return
    // 先更新内存 store（立即生效，避免 UI 闪烁）
    updateSession(sessionId, updates)
    // 原生端：同步写入本地 SQLite，确保切换会话后状态不丢失
    if (Capacitor.isNativePlatform()) {
      // 🚀 核心修复：LocalSession 使用 number (0/1) 而不是 boolean
      const localUpdates: any = { ...updates }
      if (typeof updates.enable_data_science_agent === 'boolean') localUpdates.enable_data_science_agent = updates.enable_data_science_agent ? 1 : 0
      if (typeof updates.enable_thinking === 'boolean') localUpdates.enable_thinking = updates.enable_thinking ? 1 : 0
      if (typeof updates.enable_rag === 'boolean') localUpdates.enable_rag = updates.enable_rag ? 1 : 0
      
      localUpdateSession(sessionId, localUpdates).catch(e => console.error('Failed to persist modes locally:', e))
    }
    // 后端同步（非原生或联网时）
    try {
      await sessionApi.updateSessionModes(sessionId, updates)
    } catch (e) {
      // 离线/原生场景下后端不可达，忽略
    }
  }
  const [isKnowledgeMode, setKnowledgeMode] = useState(false)
  const [useHighPrecision, setUseHighPrecision] = useState(false) // 🚀 高精度 OCR 开关
  const [ragEngine, setRagEngine] = useState<'light' | 'pro'>('light')
  const [showEngineSelect, setShowEngineSelect] = useState(false)
  const [knowledgeGraphDoc, setKnowledgeGraphDoc] = useState<string | null>(null)

  // 注册全局方法供 MessageItem 调用（避免 prop drilling）
  useEffect(() => {
    (window as any).__showKnowledgeGraph = (docName: string) => setKnowledgeGraphDoc(docName)
    return () => { delete (window as any).__showKnowledgeGraph }
  }, [])

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
    
    // 离线模式无需数据库，直接跳过选库逻辑
    if (!currentDb && !isOffline) {
      console.log('🎯 [InputBar] No DB selected, trying auto-select first one...')
      try {
        const { databases } = await databaseApi.getDatabases()
        if (databases && databases.length > 0) {
          const firstDb = databases[0].key
          await databaseApi.switchDatabase(firstDb, sessionId)
          updateSession(sessionId, { database_key: firstDb })
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
        enable_rag: ragScope !== 'off',
        rag_scope: ragScope === 'off' ? 'session' : ragScope,
        rag_engine: ragEngine,
        parent_id: parentId,
        enable_data_science_agent: isDataScienceMode,
        enable_thinking: isThinkingMode,
        model_provider: currentModelProvider || undefined,
        model_name: currentModelNameLocal || undefined,
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
    // 🚀 直接点击，不动态修改 accept
    // iOS UIDocumentPickerViewController 对 MIME 类型不敏感，直接用扩展名
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
      const isCsvOrExcel = /\.(csv|xlsx|xls)$/i.test(fileName)
      const isOtherDoc = /\.(txt|md|markdown)$/i.test(fileName)

      console.log('文件选择触发:', fileName, '是否PDF:', isPDF, '是否图片:', isImage, '是否其他文档:', isOtherDoc, '是否CSV/Excel:', isCsvOrExcel)

      // CSV/Excel 不适合 RAG 切片，引导用户走数据导入流程
      if (isCsvOrExcel) {
        alert(t('alert.csvUseImportInstead'))
        return
      }

      if (isKnowledgeMode) {
        if (isPDF || isOtherDoc || isImage) {
          if (isMobileNative || isOffline) {
            await handleMobileLocalProcess(file, 'knowledge')
          } else {
            startKnowledgeExtraction(file)
          }
        } else {
          alert(t('alert.fileTypeNotSupported'))
        }
      } else {
        // 普通模式逻辑：如果是 PDF、图片、文本或 MD，弹出引擎选择框以供深度分析
        if (isPDF || isImage || isOtherDoc) {
          console.log('Showing engine select modal for:', fileName)
          setPendingFile(file)
          setShowEngineSelect(true)
        } else {
          // 其他格式暂不支持深度引擎，仅限标准上传 (虽然目前 isOtherDoc 已覆盖 txt/md)
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
    setSessionHasFiles(true)
    setRagScope('session')
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

      // 🗂️ 立即把 PDF 缓存到设备本地，确保换 Wi-Fi 后仍可离线查看
      if (response.file_url) {
        const fullUrl = `${getBaseURL().replace('/api', '')}${response.file_url}`
        cacheFile(fullUrl).catch(e => console.warn('[FileCache] Pre-cache failed:', e))
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

  /** 手机端 / 离线：全本地知识处理流程 */
  const handleMobileLocalProcess = async (file: File, engine: 'light' | 'pro' | 'knowledge') => {
    const messageId = `local_kb_${Date.now()}`
    try {
      setIsLoading(true)
      setShowEngineSelect(false)

      const modeLabel = engine === 'light' ? '标准模式（本地解析）'
        : engine === 'pro' ? '深度模式（MinerU）'
        : '知识抽取（MinerU）'

      addMessage({
        id: messageId,
        session_id: sessionId!,
        role: 'user',
        content: `【${modeLabel}】正在处理：${file.name}...`,
        created_at: new Date().toISOString(),
      })

      const preview = await processDocument(file, {
        engine,
        userId: localUserId ?? -1,
        sessionId,
        onProgress: (msg) => {
          useSessionStore.getState().updateMessage(messageId, {
            content: `【${modeLabel}】${file.name}\n\n⏳ ${msg}`,
          })
        },
      })

      setSessionHasFiles(true)
      setRagScope('session')

      const hasGraph = engine === 'knowledge' && !!loadKnowledgeGraph(file.name, localUserId ?? -1)
      const graphHint = hasGraph ? '\n\n💡 点击下方「知识图谱」按钮可查看抽取的实体关系图' : ''

      addMessage({
        id: `resp_kb_${Date.now()}`,
        session_id: sessionId!,
        role: 'assistant',
        content: `✅ 已完成本地知识索引\n文件：《${file.name}》\n\n**内容预览：**\n> ${preview.slice(0, 200)}...${graphHint}\n\n文档已索引到本地知识库，后续对话将自动检索相关内容。`,
        data: hasGraph ? JSON.stringify({ is_knowledge_extraction: true, doc_name: file.name, has_graph: true }) : undefined,
        created_at: new Date().toISOString(),
      })

      useSessionStore.getState().updateMessage(messageId, {
        content: `【${modeLabel}】✅ ${file.name} 已完成索引`,
      })
    } catch (e: any) {
      useSessionStore.getState().updateMessage(messageId, {
        content: `❌ 处理失败：${e.message}`,
      })
      alert(e.message)
    } finally {
      setIsLoading(false)
      setPendingFile(null)
    }
  }

  const selectEngine = async (engine: 'light' | 'pro' | 'knowledge') => {
    const file = pendingFile
    if (!file) {
      setShowEngineSelect(false)
      return
    }

    // 手机端或离线模式：走本地知识处理，不依赖后端
    if (isMobileNative || isOffline) {
      await handleMobileLocalProcess(file, engine)
      setShowEngineSelect(false)
      setPendingFile(null)
      return
    }

    // 电脑端 + 在线：保持原有后端流程
    if (engine === 'knowledge') {
      startKnowledgeExtraction(file)
    } else {
      setRagEngine(engine as any)
      try {
        setIsLoading(true)
        await uploadApi.upload(file, sessionId!, engine)
        setSessionHasFiles(true)
        setRagScope('session')
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

  const handleModelChange = (provider: string, modelName: string) => {
    setCurrentModelProvider(provider)
    setCurrentModelNameLocal(modelName)
    // 如果切换到不支持思考的模型，自动关闭思考模式
    if (!THINKING_SUPPORTED_MODELS.has(modelName) && isThinkingMode) {
      setThinkingMode(false)
      syncModes({ enable_thinking: false })
    }
  }

  return (
    <div className="relative data-[mobile=true]:data-[orientation=landscape]:px-2 data-[mobile=true]:data-[orientation=landscape]:pb-1">
      {/* 思考模式不支持警告 */}
      {isThinkingMode && !thinkingSupported && (
        <div className="absolute bottom-full left-0 right-0 mb-2 mx-1 px-3 py-2 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-700 flex items-center gap-2 shadow-sm z-10">
          <span>⚠️</span>
          <span>当前模型 <strong>{currentModelNameLocal}</strong> 不支持思考模式，请切换到支持推理的模型。</span>
        </div>
      )}

      {/* Knowledge Graph Modal */}
      {knowledgeGraphDoc && (() => {
        const graph = loadKnowledgeGraph(knowledgeGraphDoc, localUserId ?? -1)
        return graph ? (
          <KnowledgeGraphModal graph={graph} onClose={() => setKnowledgeGraphDoc(null)} />
        ) : null
      })()}

      {/* Model Key Modal */}
      {showModelKeyModal && (
        <ModelKeyModal
          sessionId={sessionId}
          currentProvider={currentModelProvider}
          currentModelName={currentModelNameLocal}
          onClose={() => setShowModelKeyModal(false)}
          onModelChange={handleModelChange}
        />
      )}

      {showEngineSelect && (
        <div className="absolute bottom-full left-0 mb-2 p-3 bg-white/90 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl z-50 w-64 data-[mobile=true]:data-[orientation=landscape]:w-80 data-[mobile=true]:data-[orientation=landscape]:grid data-[mobile=true]:data-[orientation=landscape]:grid-cols-2 data-[mobile=true]:data-[orientation=landscape]:gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xl">📄</span>
            <h3 className="text-sm font-bold text-gray-800">{t('chat.pdfModeTitle')}</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">{t('chat.fileProcessingDesc') || t('chat.pdfModeDesc')}</p>
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

      {/* Offline mode indicator */}
      {isOffline && (
        <div className="mb-1.5 px-3 py-1.5 bg-amber-50/90 border border-amber-200/70 rounded-xl text-xs text-amber-700 flex items-center justify-between data-[mobile=true]:data-[orientation=landscape]:py-0.5 data-[mobile=true]:data-[orientation=landscape]:mb-1">
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
            <span>离线模式 · AI 直连{currentModelProvider ? ` · ${currentModelProvider}` : ''}</span>
          </div>
          <span className="text-amber-500 text-[10px]">数据本地存储</span>
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

          {/* 🔑 模型 & API Key 配置按钮 */}
          <button
            onClick={() => setShowModelKeyModal(true)}
            className={`flex-shrink-0 w-9 h-9 data-[mobile=true]:data-[orientation=landscape]:w-7 data-[mobile=true]:data-[orientation=landscape]:h-7 flex items-center justify-center rounded-xl transition-all border ${
              currentModelProvider
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                : 'bg-gray-100/50 border-gray-200/50 text-gray-400'
            }`}
            title={currentModelProvider ? `模型: ${currentModelNameLocal || currentModelProvider}` : '配置 API Key & 模型'}
          >
            <KeyRound size={16} />
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
            accept=".pdf,.txt,.md,.markdown,.jpg,.jpeg,.png,.gif,.webp,.bmp"
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
                : !currentDb && !isOffline
                  ? '⚠️ Please select a database in the top right'
                  : isKnowledgeMode
                    ? t('feature.file.title')
                    : t('chat.placeholder')
            }
            disabled={isLoading || !sessionId || (!currentDb && !isOffline)}
            className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed data-[mobile=true]:data-[orientation=landscape]:text-xs data-[mobile=true]:data-[orientation=landscape]:leading-tight"
            rows={1}
          />

          {/* 手机竖屏：发送按钮移到输入框右侧 */}
          {isMobilePortrait && (
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || !sessionId || isLoading || (!currentDb && !isOffline)}
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
                if (!isKnowledgeMode) {
                  setRagScope('off')
                  syncModes({ enable_rag: false })
                }
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
                  if (!isThinkingMode && !thinkingSupported) {
                    // 提示用户当前模型不支持思考模式
                    alert(`当前模型 ${currentModelNameLocal} 不支持思考模式。\n请先在「Key」按钮中切换到支持推理的模型。`)
                    return
                  }
                  const newVal = !isThinkingMode
                  setThinkingMode(newVal)
                  syncModes({ enable_thinking: newVal })
                }
              }}
              disabled={isLoading}
              className={`flex-shrink-0 px-2 h-7 data-[mobile=true]:data-[orientation=landscape]:h-6 flex items-center justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                isThinkingMode && thinkingSupported
                  ? 'bg-[#FFD700] text-gray-800 font-medium'
                  : isThinkingMode && !thinkingSupported
                  ? 'bg-red-100 text-red-600 border border-red-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={
                !thinkingSupported
                  ? `${currentModelNameLocal} 不支持思考模式`
                  : isThinkingMode
                  ? t('chat.thinkingMode') + ' ON'
                  : t('chat.thinkingMode') + ' OFF'
              }
            >
              <span className="text-[10px] data-[mobile=true]:data-[orientation=landscape]:text-[9px]">
                {!thinkingSupported && currentModelNameLocal ? '⚠️ ' : ''}{t('chat.thinkingMode')}
              </span>
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
            {/* RAG 三态按钮: off → session → global → off */}
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (isLoading) return
                setKnowledgeMode(false)
                if (ragScope === 'off') {
                  // 有文件则进 session，否则直接进 global
                  const next: RagScope = sessionHasFiles ? 'session' : 'global'
                  setRagScope(next)
                  syncModes({ enable_rag: true })
                } else if (ragScope === 'session') {
                  setRagScope('global')
                  syncModes({ enable_rag: true })
                } else {
                  setRagScope('off')
                  syncModes({ enable_rag: false })
                }
              }}
              disabled={isLoading}
              title={
                ragScope === 'off'
                  ? 'RAG 检索 OFF'
                  : ragScope === 'session'
                  ? '当前会话 RAG：仅检索本会话上传的文件\n再次点击切换为全局 RAG'
                  : '全局 RAG：检索您所有会话中上传的文件\n再次点击关闭'
              }
              className={`flex-shrink-0 px-2 h-7 data-[mobile=true]:data-[orientation=landscape]:h-6 flex items-center gap-1 justify-center rounded-lg transition-all shadow-sm ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                ragScope === 'off'
                  ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  : ragScope === 'session'
                  ? 'bg-[#00BFFF] text-white font-medium'
                  : 'bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium'
              }`}
            >
              <span className="text-[10px] data-[mobile=true]:data-[orientation=landscape]:text-[9px]">
                {ragScope === 'off' ? 'RAG' : ragScope === 'session' ? '会话RAG' : '全局RAG'}
              </span>
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
                disabled={!input.trim() || !sessionId || isLoading || (!currentDb && !isOffline)}
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
