import { useRef, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSessionStore } from '../stores/sessionStore'

// 简单的 UUID 生成函数
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

interface SSEHandlers {
  onThinking?: (content: string) => void
  onModelThinking?: (content: string) => void
  onRagRetrieval?: (content: string) => void
  onSqlGenerated?: (sql: string) => void
  onSqlResult?: (result: any) => void
  onChartReady?: (option: any, chartType: string) => void
  onSummary?: (content: string) => void
  onDone?: (data: any) => void
  onMessageSent?: () => void
  onError?: (message: string) => void
}

interface ConnectOptions {
  enable_rag?: boolean
  rag_engine?: 'light' | 'pro'
  onMessageSent?: () => void
}

export function useSSE() {
  const abortControllerRef = useRef<AbortController | null>(null)
  const {
    setIsLoading,
    setThinkingContent,
    setCurrentSql,
    setChartOption,
    setSqlResult,
    isThinkingMode
  } = useChatStore()
  const { addMessage, updateLastMessage, updateSession } = useSessionStore()

  const connect = useCallback(
    async (sessionId: string, question: string, options?: ConnectOptions, handlers?: SSEHandlers) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // 1. 立即反馈 UI
      const userMessageId = generateId()
      addMessage({
        id: userMessageId,
        session_id: sessionId,
        role: 'user',
        content: question,
        created_at: new Date().toISOString()
      })
      
      console.log('✅ [SSE] 消息已提交至 Store:', userMessageId)

      // 关键：强制延迟启动 Loading，给 React 渲染用户消息的时间
      await new Promise(resolve => setTimeout(resolve, 50));
      setIsLoading(true);
      setThinkingContent('正在发起连接...');
      setCurrentSql('');

      const controller = new AbortController()
      abortControllerRef.current = controller

      let assistantContent = ''
      let assistantSql = ''
      let assistantChartCfg = ''
      let assistantModelThinking = ''
      let assistantData: any = null
      let assistantMessageId = generateId()
      let assistantMessageAdded = false

      try {
        // 2. 获取 Token
        let token = ''
        const authStore = localStorage.getItem('auth-storage')
        if (authStore) {
          try {
            token = JSON.parse(authStore).state?.token || ''
          } catch (e) {
            // ignore
          }
        }

        // 3. 构建 URL
        const { getBaseURL } = await import('../api')
        const baseURL = getBaseURL()
        const apiPath = baseURL.startsWith('http') ? `${baseURL}/chat/stream` : `${window.location.origin}${baseURL}/chat/stream`;
        const finalUrl = apiPath.replace(/([^:])\/\//g, '$1/')

        console.log(`📡 [SSE] 发起流式请求: ${finalUrl}`)

        const response = await fetch(finalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            session_id: sessionId,
            question: question,
            enable_thinking: isThinkingMode,
            enable_rag: options?.enable_rag || false,
            rag_engine: options?.rag_engine || 'light'
          }),
          signal: controller.signal
        })

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('无法创建流读取器');
        
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n') // 标准 SSE 分隔符
          buffer = lines.pop() || ''

          for (const line of lines) {
            let rawLine = line.trim()
            if (!rawLine) continue
            
            // 剥离 SSE data: 前缀
            if (rawLine.startsWith('data: ')) {
              rawLine = rawLine.substring(6)
            }

            if (!rawLine.startsWith('{')) continue

            try {
              const event = JSON.parse(rawLine)
              const eventType = event.event
              const eventData = event.data || {}

              switch (eventType) {
                case 'rag_retrieval':
                  setThinkingContent('正在检索知识库...')
                  handlers?.onRagRetrieval?.(eventData.content)
                  break
                case 'thinking':
                  setThinkingContent(eventData.content || '')
                  handlers?.onThinking?.(eventData.content)
                  break
                case 'model_thinking':
                  assistantModelThinking += eventData.content || ''
                  setThinkingContent(assistantModelThinking)
                  handlers?.onModelThinking?.(eventData.content)
                  
                  if (!assistantMessageAdded) {
                    addMessage({
                      id: assistantMessageId,
                      session_id: sessionId,
                      role: 'assistant',
                      content: '',
                      thinking: assistantModelThinking,
                      created_at: new Date().toISOString()
                    })
                    assistantMessageAdded = true
                  } else {
                    updateLastMessage({
                      thinking: assistantModelThinking
                    })
                  }
                  break
                case 'sql_generated':
                  assistantSql = eventData.sql || ''
                  setCurrentSql(assistantSql)
                  handlers?.onSqlGenerated?.(eventData.sql)
                  break
                case 'sql_result':
                  assistantData = eventData
                  setSqlResult(eventData)
                  handlers?.onSqlResult?.(eventData)
                  break
                case 'chart_ready':
                  assistantChartCfg = JSON.stringify(eventData.option)
                  setChartOption(eventData.option, eventData.chart_type || 'bar')
                  handlers?.onChartReady?.(eventData.option, eventData.chart_type)
                  break
                case 'summary':
                  assistantContent += eventData.content || ''
                  if (!assistantMessageAdded) {
                    addMessage({
                      id: assistantMessageId,
                      session_id: sessionId,
                      role: 'assistant',
                      content: assistantContent,
                      sql: assistantSql,
                      chart_cfg: assistantChartCfg,
                      data: assistantData,
                      thinking: assistantModelThinking,
                      created_at: new Date().toISOString()
                    })
                    assistantMessageAdded = true
                  } else {
                    updateLastMessage({
                      content: assistantContent,
                      sql: assistantSql,
                      chart_cfg: assistantChartCfg,
                      data: assistantData,
                      thinking: assistantModelThinking
                    })
                  }
                  handlers?.onSummary?.(eventData.content)
                  break
                                                  case 'done':
                                                    setIsLoading(false)
                                                    if (eventData.session_title) {
                                                      console.log('📝 [SSE] 收到新标题，正在更新 UI:', eventData.session_title);
                                                      updateSession(sessionId, { title: eventData.session_title });
                                                    }
                                                    handlers?.onDone?.(eventData)
                                  
                                    options?.onMessageSent?.()
                                    break
                
                case 'error':
                  setIsLoading(false)
                  setThinkingContent('')
                  handlers?.onError?.(eventData.message || '发生错误')
                  break
              }
            } catch (e) {
              console.error('Failed to parse event:', e, trimmedLine)
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Stream Error:', error)
          setIsLoading(false)
          setThinkingContent('')
          handlers?.onError?.('连接错误，请稍后重试')
        }
      }
    },
    [setIsLoading, setThinkingContent, setCurrentSql, setChartOption, setSqlResult, addMessage, updateLastMessage, isThinkingMode]
  )

  const disconnect = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
  }, [setIsLoading])

  return { connect, disconnect }
}
