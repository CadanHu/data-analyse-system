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
  onSqlGenerated?: (sql: string) => void
  onSqlResult?: (result: any) => void
  onChartReady?: (option: any, chartType: string) => void
  onSummary?: (content: string) => void
  onDone?: (data: any) => void
  onMessageSent?: () => void
  onError?: (message: string) => void
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
  const { addMessage, updateLastMessage } = useSessionStore()

  const connect = useCallback(
    async (sessionId: string, question: string, handlers?: SSEHandlers) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      setIsLoading(true)
      setThinkingContent('')
      setCurrentSql('')

      const controller = new AbortController()
      abortControllerRef.current = controller

      addMessage({
        id: generateId(),
        session_id: sessionId,
        role: 'user',
        content: question,
        created_at: new Date().toISOString()
      })

      let assistantContent = ''
      let assistantSql = ''
      let assistantChartCfg = ''
      let assistantThinking = ''
      let assistantModelThinking = ''
      let assistantChartConfig: any = null
      let assistantData: any = null
      let assistantMessageId = generateId()
      let assistantMessageAdded = false

      try {
        const response = await fetch('http://localhost:8000/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            session_id: sessionId,
            question: question,
            enable_thinking: isThinkingMode
          }),
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.trim()) continue

              try {
                const event = JSON.parse(line)
                const eventType = event.event
                const eventData = event.data || {}

                switch (eventType) {
                  case 'thinking':
                    assistantThinking = eventData.content || ''
                    setThinkingContent(assistantThinking)
                    handlers?.onThinking?.(eventData.content)
                    break
                  case 'model_thinking':
                    assistantModelThinking += eventData.content || ''
                    setThinkingContent(assistantModelThinking)
                    handlers?.onModelThinking?.(eventData.content)
                    break
                  case 'schema_loaded':
                    break
                  case 'sql_generated':
                    assistantSql = eventData.sql || ''
                    setCurrentSql(assistantSql)
                    handlers?.onSqlGenerated?.(eventData.sql)
                    break
                  case 'sql_executing':
                    setThinkingContent('正在查询数据库...')
                    break
                  case 'sql_result':
                    assistantData = eventData
                    setSqlResult(eventData)
                    handlers?.onSqlResult?.(eventData)
                    break
                  case 'chart_ready':
                    assistantChartConfig = eventData.option
                    assistantChartCfg = JSON.stringify(eventData.option)
                    setChartOption(eventData.option, eventData.chart_type || 'bar')
                    handlers?.onChartReady?.(eventData.option, eventData.chart_type)
                    break
                  case 'summary':
                    assistantContent += eventData.content || ''
                    setThinkingContent('')
                    if (!assistantMessageAdded) {
                      addMessage({
                        id: assistantMessageId,
                        session_id: sessionId,
                        role: 'assistant',
                        content: assistantContent,
                        sql: assistantSql,
                        chart_cfg: assistantChartCfg,
                        data: assistantData,
                        thinking: assistantModelThinking || assistantThinking,
                        created_at: new Date().toISOString()
                      })
                      assistantMessageAdded = true
                    } else {
                      updateLastMessage({
                        content: assistantContent,
                        sql: assistantSql,
                        chart_cfg: assistantChartCfg,
                        data: assistantData,
                        thinking: assistantModelThinking || assistantThinking
                      })
                    }
                    handlers?.onSummary?.(eventData.content)
                    break
                  case 'done':
                    setIsLoading(false)
                    handlers?.onDone?.(eventData)
                    handlers?.onMessageSent?.()
                    break
                  case 'error':
                    setIsLoading(false)
                    setThinkingContent('')
                    handlers?.onError?.(eventData.message || '发生错误')
                    break
                }
              } catch (e) {
                console.error('Failed to parse event:', e, line)
              }
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
    [setIsLoading, setThinkingContent, setCurrentSql, setChartOption, setSqlResult, addMessage, updateLastMessage]
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
