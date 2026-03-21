import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import 'katex/dist/katex.min.css'
import { Capacitor } from '@capacitor/core'

// Platform isolation: rehypeRaw uses hast-util-from-html-isomorphic which
// can cause {} errors in Capacitor WKWebView. Disable on native platforms.
const isNativePlatform = Capacitor.isNativePlatform()
const rehypePluginsWeb = [rehypeKatex, rehypeRaw]
const rehypePluginsNative = [rehypeKatex]
import { 
  Terminal, 
  BarChart3, 
  ChevronRight, 
  ChevronLeft, 
  Maximize2, 
  X, 
  LayoutDashboard,
  Zap,
  Download,
  Loader2,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  AlertCircle
} from 'lucide-react'
import type { Message } from '../types/message'
import SqlBlock from './SqlBlock'
import EChartsRenderer from './EChartsRenderer'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import { sessionApi, getBaseURL, messageApi } from '@/api'
import { resolveUrl, isCached, cacheECharts, resolveEChartsInHtml } from '@/services/fileCache'
import { upsertMessage, updateMessageContent, executeLocalQuery } from '@/services/db'
import { useSSE } from '../hooks/useSSE'
import { useTranslation } from '../hooks/useTranslation'
import { generateLocalReport } from '@/services/localReportService'
import { exportReport } from '@/services/pdfExportService'
import { localGetApiKey } from '@/services/localStore'
import { useLanguageStore } from '../stores/languageStore'

interface MessageItemProps {
  message: Message
  onEditSubmit?: (content: string, parentId?: string) => void
}

// 🆕 深度分析看板预览组件
const DashboardPreview = ({ report, token }: { report: { title?: string, summary?: string, html?: string }, token: string | null }) => {
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [resolvedHtml, setResolvedHtml] = useState(report.html || '')
  const { t } = useTranslation()

  // 🚀 安全处理：防止 summary 为空导致 split 崩溃
  const summaries = (report.summary || '').split('\n').filter(s => s.trim())

  // Cache ECharts and patch HTML for offline rendering
  useEffect(() => {
    const html = report.html || ''
    setResolvedHtml(html)
    // Trigger cache (no-op if already cached or not native)
    cacheECharts().then(() => {
      return resolveEChartsInHtml(html)
    }).then(patched => {
      setResolvedHtml(patched)
    }).catch(() => {/* CDN fallback */})
  }, [report.html])

  const handleExportPDF = async () => {
    try {
      setIsExporting(true)

      if (isNativePlatform) {
        // Native: 直接本地导出，无需后端
        await exportReport(resolvedHtml, report.title || 'Report')
        return
      }

      // Web: 调用后端生成 PDF
      const response = await fetch(`${getBaseURL()}/chat/export/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(report)
      })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const fileName = `DataPulse_${report.title || 'Report'}.pdf`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      // 用户取消系统分享面板不是真正的错误，静默忽略
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismissed')) return
      console.error('PDF export error:', err)
      alert(t('report.exportPdfFailed'))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="mt-4 border border-white/20 rounded-2xl overflow-hidden bg-black/40 backdrop-blur-md shadow-2xl">
      <div className="px-4 py-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={18} className="text-blue-400" />
          <span className="text-sm font-bold text-white tracking-tight">{report.title || t('report.deepInsight')}</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-emerald-500/20 rounded-full text-[11px] text-white/60 hover:text-emerald-400 transition-all border border-white/5 active:scale-95 disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {isExporting ? t('report.generating') : 'PDF'}
          </button>
          <button 
            onClick={() => setIsFullScreen(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-[11px] text-white/80 transition-all border border-white/10 active:scale-95"
          >
            <Maximize2 size={12} />
            {t('report.fullScreen')}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {summaries.map((s, i) => (
            <div key={i} className="px-2.5 py-1 bg-white/5 rounded-lg border border-white/10 text-[11px] text-white/70 flex items-center gap-1.5">
              <Zap size={10} className="text-yellow-400" />
              {s}
            </div>
          ))}
        </div>
      </div>

      {isFullScreen && createPortal(
        <div className="fixed inset-0 z-[10001] bg-black flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-4 bg-white/5 border-b border-white/10"
            style={{ paddingTop: 'calc(var(--safe-top) + 0.5rem)', paddingBottom: '0.5rem' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 size={16} className="text-blue-400 shrink-0" />
              <h3 className="text-white font-bold text-sm truncate">{report.title}</h3>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-xs whitespace-nowrap transition-all active:scale-95 border border-emerald-500/30 disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                {isExporting ? t('report.generating') : t('report.offline')}
              </button>
              <button
                onClick={() => setIsFullScreen(false)}
                className="p-1.5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <iframe
            srcDoc={resolvedHtml}
            className="flex-1 w-full border-none bg-white"
            title="Dashboard"
          />
        </div>,
        document.body
      )}
    </div>
  )
}

export default function MessageItem({ message, onEditSubmit }: MessageItemProps) {
  const isUser = message.role === 'user'
  const [thinkingCollapsed, setThinkingCollapsed] = useState(!(message.thinking && !message.content))
  const [sqlCollapsed, setSqlCollapsed] = useState(true)
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [showPreview, setShowPreview] = useState(false)
  const [isFullTextExpanded, setIsFullTextExpanded] = useState(false)
  
  const [localFeedback, setLocalFeedback] = useState<number>(message.feedback || 0)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackText, setFeedbackText] = useState(message.feedback_text || '')
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  // Native: in-app image viewer (window.open is blocked in Capacitor WKWebView)
  const [imageModal, setImageModal] = useState<string | null>(null)
  // Native: in-app ECharts fullscreen viewer
  const [chartModal, setChartModal] = useState<object | null>(null)

  const { setCurrentAnalysis, setActiveTab, isLoading } = useChatStore()
  const { allMessages, setMessages, currentSession, updateMessage } = useSessionStore()
  const { token, localUserId } = useAuthStore()
  const { connect } = useSSE()
  const { t } = useTranslation()
  const { language } = useLanguageStore()

  const handleOpenImage = (base64: string) => {
    // On native (iOS/Android), window.open is blocked — show in-app modal instead
    if (isNativePlatform) {
      setImageModal(base64)
      return
    }
    try {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      console.error('Failed to open image:', e);
      window.open(`data:image/png;base64,${base64}`, '_blank');
    }
  }

  const handleManualGenerateReport = async () => {
    if (!currentSession || isGeneratingReport) return

    try {
      setIsGeneratingReport(true)

      if (isNativePlatform) {
        // Native: 本地直接生成，无需后端
        const provider = currentSession.model_provider || localStorage.getItem('DEFAULT_PROVIDER') || 'openai'
        const modelName = currentSession.model_name || localStorage.getItem('DEFAULT_MODEL') || ''
        const userId = localUserId ?? -1
        const apiKey = await localGetApiKey(userId, provider).catch(() => null)

        if (!apiKey) {
          alert(t('report.failed'))
          return
        }

        // 找父消息（用户提问）
        const parentMsg = allMessages.find(m => m.id === message.parent_id)
        const userQuery = parentMsg?.content || message.content

        // 从 parsedData 取 SQL 结果，若不存在则重新执行 SQL（sciData 不再存储行数据）
        let sqlColumns: string[] = (parsedData?.columns as string[]) || []
        let sqlRows: any[] = (parsedData?.rows as any[]) || []
        // sqlite_sql 是带 biz 前缀的实际可执行 SQL，message.sql 是原始 MySQL SQL（无前缀，无法直接执行）
        const execSql = parsedData?.sqlite_sql || null
        if (sqlRows.length === 0 && execSql) {
          try {
            const reRows = await executeLocalQuery(execSql)
            if (reRows.length > 0) {
              sqlColumns = Object.keys(reRows[0])
              sqlRows = reRows
            }
          } catch (e) {
            console.warn('[Report] Re-execute SQL failed:', e)
          }
        }
        const sqlResult = { columns: sqlColumns, rows: sqlRows }

        const result = await generateLocalReport({
          userQuery,
          sqlResult,
          sql: message.sql || '',
          language: (language as 'zh' | 'en') || 'zh',
          provider,
          model: modelName,
          apiKey,
          onProgress: () => {},
        })

        const updatedData = {
          ...(parsedData || {}),
          html_report: result,
          can_generate_report: false,
        }
        updateMessage(message.id, { data: JSON.stringify(updatedData) })
        // 持久化到本地 SQLite（只更新 data，不覆盖 content/chart_cfg 等字段）
        await updateMessageContent(message.id, { data: JSON.stringify(updatedData) }).catch(() => {})
        return
      }

      // Web: 调用后端异步生成
      const response = await fetch(`${getBaseURL()}/chat/generate_report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message_id: message.id,
          content: message.content,
          session_id: currentSession.id
        })
      })

      if (!response.ok) throw new Error('Generation failed')

      const currentData = parsedData || {}
      const updatedData = {
        ...currentData,
        report_status: 'processing',
        can_generate_report: false
      }
      updateMessage(message.id, { data: JSON.stringify(updatedData) })
      alert(t('report.started'))
    } catch (err) {
      console.error('Report generation error:', err)
      alert(t('report.failed'))
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const handleRegenerate = () => {
    if (!currentSession || isLoading) return
    
    const parentMessage = allMessages.find(m => m.id === message.parent_id)
    if (!parentMessage) {
      console.warn('Parent message not found, cannot regenerate')
      return
    }

    const parentIndex = allMessages.findIndex(m => m.id === parentMessage.id)
    if (parentIndex !== -1) {
      setMessages(allMessages.slice(0, parentIndex + 1))
    }

    connect(
      currentSession.id,
      parentMessage.content,
      { parent_id: parentMessage.parent_id }, 
      { 
        onError: (err) => alert(`${t('report.regenerateFailed')}: ${err}`)
      }
    )
  }

  const handleFeedback = async (score: number) => {
    if (!currentSession) return
    const newScore = localFeedback === score ? 0 : score
    setLocalFeedback(newScore)
    
    try {
      await messageApi.updateFeedback(currentSession.id, message.id, newScore)
      updateMessage(message.id, { feedback: newScore })
    } catch (err) {
      console.error('Feedback submission failed:', err)
    }
  }

  const handleReportIssue = async () => {
    if (!currentSession) return
    try {
      await messageApi.updateFeedback(currentSession.id, message.id, -1, feedbackText)
      updateMessage(message.id, { feedback: -1, feedback_text: feedbackText })
      setLocalFeedback(-1)
      setShowFeedbackModal(false)
      alert(t('feedback.thanks'))
    } catch (err) {
      alert(t('feedback.failed'))
    }
  }

  let parsedData: any = null
  if (message.data) {
    try {
      parsedData = typeof message.data === 'string' ? JSON.parse(message.data) : message.data
    } catch (e) {
      console.error('Parsing message data failed:', e)
    }
  }

  const isKnowledgeExtraction = parsedData?.is_knowledge_extraction
  const htmlReport = parsedData?.html_report
  const pdfServerUrl = parsedData?.file_url ? `${getBaseURL().replace('/api', '')}${parsedData.file_url}` : null
  const pdfUrl = pdfServerUrl ? resolveUrl(pdfServerUrl) : null
  const pdfIsLocal = pdfServerUrl ? isCached(pdfServerUrl) : false
  const plotImageBase64 = parsedData?.plot_image_base64

  const displayContent = (isFullTextExpanded && parsedData?.markdown_full) 
    ? parsedData.markdown_full 
    : message.content

  const finalDisplayContent = displayContent

  const siblings = allMessages.filter(m => 
    m.parent_id === message.parent_id && 
    m.role === message.role
  ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  
  const currentIndex = siblings.findIndex(s => s.id === message.id)
  const totalVersions = siblings.length

  const handleSwitchBranch = async (direction: 'prev' | 'next') => {
    if (isLoading) return
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= totalVersions) return
    
    const targetMessage = siblings[newIndex]
    
    const path: string[] = []
    let curr: Message | undefined = targetMessage
    while (curr) {
      path.unshift(curr.id)
      curr = allMessages.find(m => m.id === curr?.parent_id)
    }

    if (currentSession) {
      try {
        await sessionApi.activateBranch(currentSession.id, path)
        const updatedMessages = await sessionApi.getMessages(currentSession.id)
        setMessages(updatedMessages)
      } catch (e) {
        console.error('Switching branch failed:', e)
      }
    }
  }

  const handleEditSubmitLocal = () => {
    if (editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    if (onEditSubmit) {
      onEditSubmit(editContent, message.parent_id)
      setIsEditing(false)
    }
  }

  useEffect(() => {
    if (isLoading && message.thinking && !message.content) {
      setThinkingCollapsed(false)
    }
  }, [message.thinking, isLoading, message.content])

  useEffect(() => {
    let pollInterval: any = null;

    // Native 上报告本地同步生成，无需轮询
    if (isNativePlatform) return

    // 如果消息状态是 processing，启动轮询
    if (parsedData?.report_status === 'processing' && currentSession) {
      console.log(`📡 [Poll] Starting poll for message ${message.id}`);
      pollInterval = setInterval(async () => {
        try {
          const updatedMessage = await messageApi.getMessage(currentSession.id, message.id);
          if (updatedMessage) {
            let newData = updatedMessage.data;
            if (typeof newData === 'string') {
              try { newData = JSON.parse(newData); } catch (e) { console.error('Parse failed in poll', e); }
            }
            
            console.log(`📡 [Poll] Current status for ${message.id}: ${newData?.report_status}`);
            
            if (newData && newData.report_status !== 'processing') {
              console.log(`✅ [Poll] Analysis finished: ${newData.report_status}`);
              const dataStr = (typeof updatedMessage.data === 'string') ? updatedMessage.data : JSON.stringify(updatedMessage.data)
              updateMessage(message.id, { data: dataStr });
              // Persist html_report to local SQLite so it's available cross-WiFi
              if (isNativePlatform) {
                upsertMessage({
                  id: message.id,
                  session_id: message.session_id || (currentSession?.id ?? ''),
                  data: dataStr,
                  _sync_dirty: 0,
                  _deleted: 0,
                }).catch(e => console.warn('[Poll] SQLite persist failed:', e))
              }
              if (pollInterval) clearInterval(pollInterval);
            }
          }
        } catch (e) {
          console.error('Polling for report failed:', e);
        }
      }, 3000);
    }

    return () => {
      if (pollInterval) {
        console.log(`🛑 [Poll] Cleaning up poll for ${message.id}`);
        clearInterval(pollInterval);
      }
    };
  }, [parsedData?.report_status, currentSession?.id, message.id, updateMessage]);

  const handleShowChart = () => {
    let chartConfig = (message as any).chartConfig
    if (!chartConfig && message.chart_cfg) {
      try {
        chartConfig = JSON.parse(message.chart_cfg)
      } catch (e) {
        console.error('Parsing chart config failed:', e)
      }
    }

    let sqlData = message.data
    if (typeof sqlData === 'string') {
      try {
        sqlData = JSON.parse(sqlData)
      } catch (e) {
        console.error('Parsing SQL result failed:', e)
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
    
    let processed = content
      .replace(/\\\[/g, '$$$$')
      .replace(/\\\]/g, '$$$$')
      .replace(/\\\(/g, '$$')
      .replace(/\\\)/g, '$$')

    if (parsedData?.is_data_science) {
      processed = processed.replace(/!\[.*?\]\(.*?\)/g, '')
    }
    
    return processed
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(err => console.error('Copy failed:', err))
  }

  return (
    <div className={`flex py-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[92%] md:max-w-[85%] ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
          isUser 
            ? 'bg-gradient-to-r from-[#A0FCD0] to-[#D0F0FF] rounded-tr-sm text-gray-900 border border-white/60' 
            : 'bg-white rounded-tl-sm text-gray-900 border border-gray-100'
        }`}>
          {!isUser && message.thinking && message.thinking.trim().length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setThinkingCollapsed(!thinkingCollapsed)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  thinkingCollapsed 
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200' 
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300 border border-gray-300'
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
                {thinkingCollapsed ? t('chat.thinkingView') : t('chat.thinkingHide')}
              </button>
              {!thinkingCollapsed && (
                <div className="mt-3 bg-amber-50 rounded-xl p-4 text-xs text-gray-800 border border-amber-200/60 markdown-body prose prose-sm max-w-none data-[mobile=true]:data-[orientation=landscape]:text-[10px]">
                  <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                    {preprocessContent(message.thinking)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
          
          <div className="prose prose-sm max-w-none text-gray-900 font-medium leading-relaxed overflow-x-auto markdown-body data-[mobile=true]:data-[orientation=landscape]:text-[11px] select-text">
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
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleEditSubmitLocal}
                    className="px-4 py-1 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={isNativePlatform ? rehypePluginsNative : rehypePluginsWeb}
                  components={{
                    img({ src, alt, ...props }: any) {
                      if (parsedData?.is_data_science && (alt?.includes('图表') || !src)) {
                        return null
                      }
                      return <img src={src} alt={alt} {...props} className="max-w-full h-auto rounded-lg shadow-sm my-2" />
                    },
                    code({ node, inline, className, children, ...props }: any) {
                      const [isExpanded, setIsExpanded] = useState(false)
                      const isInline = inline || !String(children).includes('\n')

                      if (isInline) {
                        return (
                          <code className="bg-gray-200/80 text-pink-600 px-1.5 py-0.5 rounded font-bold text-[0.9em]" {...props}>
                            {children}
                          </code>
                        )
                      }

                      const match = /language-(\w+)/.exec(className || '')
                      const lang = match ? match[1] : 'python'
                      const content = String(children).replace(/\n$/, '')
                      const lineCount = content.split('\n').length
                      const shouldShowToggle = lineCount > 10

                      return (
                        <div className="my-4 rounded-xl overflow-hidden border border-white/10 shadow-2xl transition-all duration-300">
                          <div className="flex items-center justify-between px-4 py-2 bg-gray-800/90 border-b border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                              </div>
                              <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{lang}</span>
                            </div>
                            
                            {shouldShowToggle && (
                              <button 
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-gray-300 transition-colors border border-white/10"
                              >
                                {isExpanded ? t('chat.codeCollapse') : `${t('chat.codeExpand')} (${lineCount} lines)`}
                              </button>
                            )}
                          </div>
                          <pre 
                            className={`p-4 bg-[#1e1e1e] overflow-x-auto custom-scrollbar transition-all duration-500 ease-in-out ${
                              isExpanded ? 'max-h-[2000px]' : 'max-h-[240px]'
                            }`}
                          >
                            <code className="text-[#e0e0e0] font-mono text-xs leading-relaxed select-text" {...props}>
                              {children}
                            </code>
                          </pre>
                          {!isExpanded && shouldShowToggle && (
                            <div 
                              className="h-8 bg-gradient-to-t from-[#1e1e1e] to-transparent cursor-pointer flex items-center justify-center -mt-8 relative z-10"
                              onClick={() => setIsExpanded(true)}
                            >
                              <div className="bg-gray-800/80 px-3 py-1 rounded-full text-[10px] text-gray-400 border border-white/10 flex items-center gap-1 hover:text-white transition-colors">
                                <ChevronRight size={10} className="rotate-90" />
                                {t('chat.codeClickExpand')}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    },
                    table({ children }) {
                      return (
                        <div className="overflow-x-auto my-4 rounded-lg border border-gray-200 shadow-sm">
                          <table className="min-w-full divide-y divide-gray-200">
                            {children}
                          </table>
                        </div>
                      )
                    }
                  }}
                >
                  {preprocessContent(finalDisplayContent)}
                </ReactMarkdown>
                
                {isKnowledgeExtraction && parsedData?.markdown_full && (
                  <button
                    onClick={() => setIsFullTextExpanded(!isFullTextExpanded)}
                    className="mt-3 text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 group transition-all"
                  >
                    <span>{isFullTextExpanded ? t('chat.fullTextHide') : t('chat.fullTextView')}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${isFullTextExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}

                {plotImageBase64 && (
                  <div className="mt-4 space-y-3">
                    <button
                      onClick={() => handleOpenImage(plotImageBase64)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-200 hover:shadow-indigo-300 active:scale-95 transition-all group"
                    >
                      <BarChart3 size={14} className="group-hover:rotate-12 transition-transform" />
                      {t('chat.scientistModeChartBtn')}
                    </button>

                    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-xl bg-white p-3 group/plot relative">
                      <div className="text-[10px] text-gray-400 mb-2 font-bold flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <BarChart3 size={12} className="text-indigo-500" />
                          <span className="tracking-tight">{t('chat.dataInsightThumb')}</span>
                        </div>
                      </div>
                      <img
                        src={`data:image/png;base64,${plotImageBase64}`}
                        alt="Data Insight Plot"
                        className="w-full h-auto rounded-lg object-contain cursor-zoom-in hover:brightness-95 transition-all"
                        onClick={() => handleOpenImage(plotImageBase64)}
                        loading="lazy"
                      />
                    </div>
                  </div>
                )}

                {/* 手机科学模式：内联渲染 ECharts 图表（PC 版用 matplotlib 图片，手机版用 ECharts） */}
                {!plotImageBase64 && parsedData?.is_data_science && message.chart_cfg && (() => {
                  try {
                    const chartOption = JSON.parse(message.chart_cfg)
                    return (
                      <div
                        className="mt-4 rounded-2xl overflow-hidden border border-gray-100 shadow-xl bg-white p-3 cursor-zoom-in active:brightness-95 transition-all"
                        onClick={() => setChartModal(chartOption)}
                      >
                        <div className="text-[10px] text-gray-400 mb-2 font-bold flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <BarChart3 size={12} className="text-indigo-500" />
                            <span className="tracking-tight">{t('chat.dataInsightThumb')}</span>
                          </div>
                          <div className="flex items-center gap-1 text-indigo-400">
                            <Maximize2 size={10} />
                            <span className="text-[9px]">{t('chat.tapToEnlarge') || '点击放大'}</span>
                          </div>
                        </div>
                        <div style={{ height: 280 }} className="pointer-events-none">
                          <EChartsRenderer option={chartOption} style={{ height: '100%' }} />
                        </div>
                      </div>
                    )
                  } catch { return null }
                })()}
              </>
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

          {!isUser && (
            <div className="mt-3 flex items-center gap-1">
              <button
                onClick={() => handleFeedback(1)}
                className={`p-1.5 rounded-lg transition-colors ${localFeedback === 1 ? 'bg-blue-50 text-blue-500' : 'hover:bg-gray-100 text-gray-400'}`}
                title="Helpful"
              >
                <ThumbsUp size={14} fill={localFeedback === 1 ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => {
                  if (localFeedback === -1) {
                    setLocalFeedback(0)
                    handleFeedback(0)
                  } else {
                    setShowFeedbackModal(true)
                  }
                }}
                className={`p-1.5 rounded-lg transition-colors ${localFeedback === -1 ? 'bg-red-50 text-red-500' : 'hover:bg-gray-100 text-gray-400'}`}
                title="Not Helpful"
              >
                <ThumbsDown size={14} fill={localFeedback === -1 ? 'currentColor' : 'none'} />
              </button>
              <div className="w-px h-3 bg-gray-200 mx-1" />
              <button
                onClick={handleRegenerate}
                disabled={isLoading}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30"
                title="Regenerate"
              >
                <RotateCcw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {showFeedbackModal && (
            <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-100">
                <div className="flex items-center gap-3 mb-4 text-red-500">
                  <AlertCircle size={20} />
                  <h3 className="font-bold text-gray-800">Feedback</h3>
                </div>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Describe the issue or suggest improvements..."
                  className="w-full h-32 p-3 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none border border-transparent focus:border-red-200"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setShowFeedbackModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">{t('common.cancel')}</button>
                  <button 
                    onClick={handleReportIssue}
                    className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 shadow-lg shadow-red-200 transition-all active:scale-95"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
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
                  {t('chat.editQuestion')}
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
                  {sqlCollapsed ? t('chat.showSQL') : t('chat.hideSQL')}
                </span>
              </div>
            )}

            {!isUser && (message.chart_cfg || (message as any).chartConfig) && message.data && (
              <div className="relative group/action">
                <button
                  onClick={handleShowChart}
                  className="p-1.5 rounded-lg border transition-all active:scale-95 bg-white hover:bg-blue-50 text-gray-400 hover:text-blue-500 border-gray-100 hover:border-blue-100"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded pointer-events-none opacity-0 group-hover/action:opacity-100 transition-opacity whitespace-nowrap">
                  {t('chat.vizBoard')}
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
                {copied ? t('common.copySuccess') : t('chat.copyContent')}
              </span>
            </div>

            {isKnowledgeExtraction && pdfUrl && (
              <div className="relative group/action">
                <button
                  onClick={() => setShowPreview(true)}
                  className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg border border-purple-100 transition-all active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded pointer-events-none opacity-0 group-hover/action:opacity-100 transition-opacity whitespace-nowrap">
                  {t('chat.sideBySideView')}
                </span>
              </div>
            )}

            {/* 知识图谱按钮（本地知识抽取模式） */}
            {isKnowledgeExtraction && parsedData?.has_graph && (
              <div className="relative group/action">
                <button
                  onClick={() => {
                    const docName = parsedData?.doc_name
                    if (docName && (window as any).__showKnowledgeGraph) {
                      (window as any).__showKnowledgeGraph(docName)
                    }
                  }}
                  className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg border border-indigo-100 transition-all active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded pointer-events-none opacity-0 group-hover/action:opacity-100 transition-opacity whitespace-nowrap">
                  知识图谱
                </span>
              </div>
            )}
          </div>

          {parsedData?.is_data_science && (parsedData?.can_generate_report || isGeneratingReport || parsedData?.report_status === 'processing') && !htmlReport && (
            <div className="mt-4">
              <button
                onClick={handleManualGenerateReport}
                disabled={isGeneratingReport || parsedData?.report_status === 'processing'}
                className={`w-full group relative flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border transition-all duration-300 active:scale-[0.98] ${
                  (isGeneratingReport || parsedData?.report_status === 'processing')
                    ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-wait' 
                    : 'bg-gradient-to-r from-blue-50 to-purple-50 border-blue-100 text-blue-600 hover:shadow-lg hover:shadow-blue-500/10 hover:border-blue-200'
                }`}
              >
                {(isGeneratingReport || parsedData?.report_status === 'processing') ? (
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                ) : (
                  <Zap size={16} className="text-yellow-500 group-hover:animate-pulse" />
                )}
                <span className="text-sm font-bold tracking-tight">
                  {(isGeneratingReport || parsedData?.report_status === 'processing') ? t('report.deepAnalyzing') : t('report.genBtn')}
                </span>
                
                {(isGeneratingReport || parsedData?.report_status === 'processing') && (
                  <div className="absolute bottom-0 left-0 h-0.5 bg-blue-500 animate-[loading_60s_linear_infinite]" style={{ width: '100%' }} />
                )}
              </button>
              <p className="mt-1.5 text-[10px] text-gray-400 text-center italic">
                {(isGeneratingReport || parsedData?.report_status === 'processing')
                  ? t('report.processingHint') 
                  : t('report.deepInsightHint')}
              </p>
            </div>
          )}

          {htmlReport && (
            <DashboardPreview report={htmlReport} token={token} />
          )}
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-800 text-lg">{t('preview.sideBySide')}</h3>
              </div>
              <button 
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 flex overflow-hidden divide-x divide-gray-200">
              <div className="w-1/2 h-full flex flex-col">
                <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  {t('preview.original')}
                  {pdfIsLocal && (
                    <span className="text-[9px] font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                      📱 本机缓存
                    </span>
                  )}
                </div>
                <iframe
                  src={`${pdfUrl}#toolbar=0`}
                  className="flex-1 w-full border-none"
                  title="PDF Original"
                />
              </div>
              
              <div className="w-1/2 h-full flex flex-col bg-white">
                <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">{t('preview.markdown')}</div>
                <div className="flex-1 overflow-y-auto p-8 markdown-body prose prose-sm max-w-none select-text">
                  <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={isNativePlatform ? rehypePluginsNative : rehypePluginsWeb}>
                    {preprocessContent(parsedData?.markdown_full || message.content.split('**解析内容预览:**\n')[1] || message.content)}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                {t('common.close')}
              </button>
              <button
                onClick={() => {
                  const content = parsedData?.markdown_full || message.content.split('**解析内容预览:**\n')[1] || message.content;
                  navigator.clipboard.writeText(content);
                  alert(t('common.copySuccess'));
                }}
                className="px-6 py-2 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 transition-shadow shadow-lg shadow-purple-200"
              >
                {t('preview.copyResult')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ECharts fullscreen modal — tap to enlarge ECharts on native */}
      {chartModal && createPortal(
        <div className="fixed inset-0 z-[10002] bg-white flex flex-col animate-in fade-in duration-200">
          <div
            className="flex items-center justify-between px-4 shrink-0 border-b border-gray-100"
            style={{ paddingTop: 'calc(var(--safe-top) + 0.5rem)', paddingBottom: '0.75rem' }}
          >
            <div className="flex items-center gap-2 text-gray-600">
              <BarChart3 size={16} className="text-indigo-500" />
              <span className="text-sm font-semibold">{t('chat.dataInsightThumb')}</span>
            </div>
            <button
              onClick={() => setChartModal(null)}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors active:scale-95"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 p-2">
            <EChartsRenderer option={chartModal} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>,
        document.body
      )}

      {/* Native image viewer modal — replaces window.open on iOS/Android */}
      {imageModal && createPortal(
        <div
          className="fixed inset-0 z-[10002] bg-black flex flex-col animate-in fade-in duration-200"
          onClick={() => setImageModal(null)}
        >
          <div
            className="flex items-center justify-end px-4 shrink-0"
            style={{ paddingTop: 'calc(var(--safe-top) + 0.5rem)', paddingBottom: '0.5rem' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setImageModal(null)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors active:scale-95"
            >
              <X size={22} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img
              src={`data:image/png;base64,${imageModal}`}
              alt="Data Insight"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
