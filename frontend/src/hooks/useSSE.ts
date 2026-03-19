import { useRef, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useLanguageStore } from '../stores/languageStore'
import { useSessionStore } from '../stores/sessionStore'
import { useSyncStore } from '../stores/syncStore'
import { useAuthStore } from '../stores/authStore'
import { streamDirectAi } from '../services/directAiService'
import { localGetApiKey, localSaveMessage, localUpdateMessage, localUpdateSession } from '../services/localStore'
import { getLocalBizTables, executeLocalQuery } from '../services/db'
import { convertMySQLToSQLite } from '../services/sqlDialectConverter'
import { Capacitor } from '@capacitor/core'

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
  rag_scope?: 'session' | 'global'
  rag_engine?: 'light' | 'pro'
  enable_data_science_agent?: boolean
  enable_thinking?: boolean
  model_provider?: string
  model_name?: string
  parent_id?: string
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
    setCurrentAnalysis,
    isThinkingMode
  } = useChatStore()
  const { language } = useLanguageStore()
  const { addMessage, updateLastMessage, updateSession, updateMessageId, messages } = useSessionStore()
  const { connectionStatus } = useSyncStore()
  const { localUserId, offlineMode } = useAuthStore()

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
        parent_id: options?.parent_id,
        role: 'user',
        content: question,
        created_at: new Date().toISOString()
      })

      // Persist user message locally
      await localSaveMessage({
        id: userMessageId,
        session_id: sessionId,
        parent_id: options?.parent_id ?? null,
        role: 'user',
        content: question,
        created_at: new Date().toISOString(),
        _sync_dirty: 1,
        _deleted: 0,
      }).catch(() => {})
      
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
        // 2a. Offline mode → direct AI
        // On Native: treat 'checking' as offline too — server must be confirmed online.
        //   This prevents the ping cycle (checking→offline) from causing race conditions.
        // On Web: only offlineMode matters — transient ping failures must not bypass the
        //   backend (otherwise PLAN_GENERATION two-step flow breaks).
        const isNative = Capacitor.isNativePlatform()
        const isOffline = offlineMode || (isNative && connectionStatus !== 'online')
        if (isOffline) {
          const provider = options?.model_provider || 'openai'
          const model = options?.model_name || ''
          const userId = localUserId ?? -1
          const apiKey = await localGetApiKey(userId, provider).catch(() => null)

          if (!apiKey) {
            handlers?.onError?.('离线模式需要先在「模型配置」中保存 API Key')
            return
          }

          // Build messages with full conversation history for context.
          // Use getState() to avoid stale closure — messages is not in useCallback deps.
          const currentMessages = useSessionStore.getState().messages
          const historyMessages = currentMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .filter(m => m.id !== userMessageId) // exclude the just-added user msg
            .slice(-20) // keep last 20 messages to avoid token overflow
            .map(m => {
              let content = m.content || ''
              // Include previously generated SQL so the model knows what was accomplished
              if (m.sql) content += `\n\n已生成并执行SQL：\n\`\`\`sql\n${m.sql}\n\`\`\``
              return { role: m.role as 'user' | 'assistant', content }
            })
          const aiMessages: { role: string; content: string }[] = [
            ...historyMessages,
            { role: 'user', content: question },
          ]

          // Get local database schema for offline SQL generation
          const currentDb = useSessionStore.getState().sessions.find(s => s.id === sessionId)?.database_key ?? null
          let localTables: { tableName: string; columns: string[] }[] = []
          if (currentDb && Capacitor.isNativePlatform()) {
            try { localTables = await getLocalBizTables(currentDb) } catch { /* ignore */ }
          }
          if (localTables.length > 0) {
            const schemaLines = localTables.map(t => `${t.tableName}(${t.columns.join(', ')})`).join('\n')

            // Detect whether we're in "waiting for confirmation" state:
            // last assistant message proposed a plan (no SQL) and asked for confirmation.
            const recentMsgs = currentMessages.filter(m => m.role === 'user' || m.role === 'assistant')
            const lastAssistant = [...recentMsgs].reverse().find(m => m.role === 'assistant')
            const planKeywords = ['这个分析方案是否可以', '是否可以', '分析方案', 'Is this plan OK', 'shall I proceed']
            const lastMsgIsProposal = lastAssistant && !lastAssistant.sql &&
              planKeywords.some(kw => (lastAssistant.content || '').includes(kw))
            const confirmWords = /^(可以|好的|行|ok|确认|执行|开始|是|yes|继续|同意|没问题|好|对|嗯)[\s\S]{0,10}$/i
            const isConfirmation = lastMsgIsProposal && confirmWords.test(question.trim())

            let systemPrompt: string
            if (isConfirmation) {
              // Step 2: user confirmed the plan → generate SQL
              systemPrompt = `你是数据分析助手。用户本地离线数据库"${currentDb}"的表结构如下：\n${schemaLines}\n\n用户已确认上一轮你提出的分析方案，现在请生成完整的 SQL 查询并执行。\n必须以 JSON 格式回复：\n{"sql":"SELECT ...","chart_type":"bar|line|pie|area|scatter|table|none","reasoning":"执行说明"}\nSQL 使用 MySQL 语法，chart_type 根据数据特征选择最合适的图表类型。`
            } else {
              // Step 1: new question → propose plan, ask for confirmation, NO SQL yet
              systemPrompt = `你是专业的数据分析顾问。用户本地离线数据库"${currentDb}"的表结构如下：\n${schemaLines}\n\n用户提出了分析需求，请按以下格式提出分析方案供用户确认，不要生成 SQL：\n必须以 JSON 格式回复：\n{"sql":"","chart_type":"none","reasoning":"【分析方案】\\n1. 涉及的数据表及作用：...\\n2. 分析思路：...\\n3. 推荐图表类型：...\\n\\n这个分析方案是否可以？如果确认，我将为您生成数据并分析。"}\n\n注意：sql 字段必须为空字符串，等用户确认后再生成 SQL。`
            }
            aiMessages.unshift({ role: 'system', content: systemPrompt })
          }

          console.log(`🤖 [Offline-AI] provider=${provider} model=${model}`)
          console.log('📤 [Offline-AI] Prompt messages:', JSON.stringify(aiMessages, null, 2))

          await streamDirectAi({
            provider,
            model,
            messages: aiMessages,
            enableThinking: options?.enable_thinking ?? isThinkingMode,
            apiKey,
            signal: controller.signal,
            onModelThinking: (chunk) => {
              assistantModelThinking += chunk
              setThinkingContent(assistantModelThinking)
              handlers?.onModelThinking?.(chunk)
              if (!assistantMessageAdded) {
                addMessage({
                  id: assistantMessageId,
                  session_id: sessionId,
                  parent_id: userMessageId,
                  role: 'assistant',
                  content: '',
                  thinking: assistantModelThinking,
                  created_at: new Date().toISOString()
                })
                assistantMessageAdded = true
              } else {
                updateLastMessage({ thinking: assistantModelThinking })
              }
            },
            onSummary: (chunk) => {
              assistantContent += chunk
              handlers?.onSummary?.(chunk)
              if (!assistantMessageAdded) {
                addMessage({
                  id: assistantMessageId,
                  session_id: sessionId,
                  parent_id: userMessageId,
                  role: 'assistant',
                  content: assistantContent,
                  thinking: assistantModelThinking,
                  created_at: new Date().toISOString()
                })
                assistantMessageAdded = true
              } else {
                updateLastMessage({ content: assistantContent, thinking: assistantModelThinking })
              }
            },
            onDone: () => {
              console.log('📥 [Offline-AI] Full response:', assistantContent)
              if (assistantModelThinking) console.log('💭 [Offline-AI] Thinking:', assistantModelThinking)
              // Persist assistant message locally
              localSaveMessage({
                id: assistantMessageId,
                session_id: sessionId,
                parent_id: userMessageId,
                role: 'assistant',
                content: assistantContent,
                thinking: assistantModelThinking || null,
                created_at: new Date().toISOString(),
                _sync_dirty: 1,
                _deleted: 0,
              }).catch(() => {})

              // Auto-rename session if it has no title yet (offline equivalent of backend session_title)
              const currentSessions = useSessionStore.getState().sessions
              const sess = currentSessions.find(s => s.id === sessionId)
              if (!sess?.title) {
                const autoTitle = question.trim().slice(0, 24) + (question.trim().length > 24 ? '…' : '')
                localUpdateSession(sessionId, { title: autoTitle }).catch(() => {})
                updateSession(sessionId, { title: autoTitle })
              }

              handlers?.onDone?.({})
              options?.onMessageSent?.()
            },
            onError: (msg) => {
              handlers?.onError?.(msg)
            },
          })

          // After streaming: parse SQL from response and execute locally
          if (currentDb && localTables.length > 0 && assistantContent) {
            const jsonMatch = assistantContent.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0])
                const rawSql: string = parsed.sql || ''
                const reasoning: string = parsed.reasoning || parsed.explanation || ''
                const chartType: string = parsed.chart_type || 'none'
                if (!rawSql.trim()) {
                  // Plan proposal (step 1): show reasoning text only, not raw JSON
                  if (reasoning) {
                    updateLastMessage({ content: reasoning })
                    await localUpdateMessage(assistantMessageId, { content: reasoning }).catch(() => {})
                  }
                } else if (rawSql.trim()) {
                  const displayContent = reasoning || assistantContent
                  const tableNames = localTables.map(t => t.tableName)
                  const sqliteSQL = convertMySQLToSQLite(rawSql, currentDb, tableNames)
                  console.log('🔄 [Offline-SQL] MySQL SQL:', rawSql)
                  console.log('🔄 [Offline-SQL] SQLite SQL:', sqliteSQL)
                  setCurrentSql(rawSql)
                  try {
                    const rows = await executeLocalQuery(sqliteSQL)
                    const cleanRows = (rows as any[]).filter((r: any) => !('ios_columns' in r))
                    const columns = cleanRows.length > 0 ? Object.keys(cleanRows[0]) : []
                    console.log(`📊 [Offline-SQL] Result: ${cleanRows.length} rows, columns: [${columns.join(', ')}]`)
                    console.log('📊 [Offline-SQL] First 3 rows:', JSON.stringify(cleanRows.slice(0, 3)))
                    const sqlResult = { columns, rows: cleanRows, total_count: cleanRows.length }
                    // Build chart option if data exists
                    let offlineChartOption = null
                    const effectiveChartType = cleanRows.length > 0 && chartType !== 'none' ? chartType : 'table'
                    if (cleanRows.length > 0 && chartType !== 'none') {
                      const xKey = columns[0]
                      const yKey = columns[1] || columns[0]
                      offlineChartOption = {
                        xAxis: { type: 'category', data: cleanRows.map((r: any) => r[xKey]) },
                        yAxis: { type: 'value' },
                        series: [{
                          data: cleanRows.map((r: any) => r[yKey]),
                          type: chartType === 'area' ? 'line' : chartType,
                          ...(chartType === 'area' ? { areaStyle: {} } : {}),
                          smooth: true,
                        }],
                        tooltip: { trigger: 'axis' },
                      }
                    }
                    // Open right panel — only if the user hasn't switched to a different session
                    // while the async SQL execution was running (prevents chart bleed).
                    const activeSessionId = useSessionStore.getState().currentSession?.id
                    if (activeSessionId === sessionId) {
                      setCurrentAnalysis(rawSql, sqlResult, effectiveChartType, offlineChartOption)
                    }
                    updateLastMessage({
                      content: displayContent,
                      sql: rawSql,
                      sql_result: JSON.stringify(sqlResult),
                      // Required for visualization button: message.chart_cfg && message.data
                      chart_cfg: offlineChartOption ? JSON.stringify(offlineChartOption) : undefined,
                      data: sqlResult,
                    })
                    await localUpdateMessage(assistantMessageId, {
                      content: displayContent,
                      sql: rawSql,
                      sql_result: JSON.stringify(sqlResult),
                      chart_cfg: offlineChartOption ? JSON.stringify(offlineChartOption) : undefined,
                      data: JSON.stringify(sqlResult),
                    }).catch(() => {})
                  } catch (execErr) {
                    const errMsg = execErr instanceof Error ? execErr.message : 'SQL执行失败'
                    console.error('❌ [Offline-SQL] Execution error:', errMsg)
                    updateLastMessage({ content: `${reasoning}\n\n❌ ${errMsg}\n\`\`\`sql\n${rawSql}\n\`\`\`` })
                  }
                }
              } catch { /* not valid JSON, keep as plain text */ }
            }
          }

          return
        }

        // 2b. 获取 Token
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

        const onlineBody = {
          session_id: sessionId,
          question: question,
          parent_id: options?.parent_id,
          enable_thinking: options?.enable_thinking ?? isThinkingMode,
          enable_rag: options?.enable_rag || false,
          rag_scope: options?.rag_scope || 'session',
          rag_engine: options?.rag_engine || 'light',
          enable_data_science_agent: options?.enable_data_science_agent || false,
          model_provider: options?.model_provider,
          model_name: options?.model_name,
          language: language
        }
        console.log(`📡 [SSE] 发起流式请求: ${finalUrl}`)
        console.log('📤 [SSE] Request body:', JSON.stringify(onlineBody, null, 2))

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
            parent_id: options?.parent_id,
            enable_thinking: options?.enable_thinking ?? isThinkingMode,
            enable_rag: options?.enable_rag || false,
            rag_scope: options?.rag_scope || 'session',
            rag_engine: options?.rag_engine || 'light',
            enable_data_science_agent: options?.enable_data_science_agent || false,
            model_provider: options?.model_provider,
            model_name: options?.model_name,
            language: language // 🚀 传回当前语言
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
                      parent_id: userMessageId,
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
                      parent_id: userMessageId,
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
                  console.log('📥 [SSE] Full assistant response:', assistantContent)
                  if (assistantModelThinking) console.log('💭 [SSE] Model thinking:', assistantModelThinking)
                  if (assistantSql) console.log('🗄️ [SSE] SQL:', assistantSql)
                  setIsLoading(false)
                  if (eventData.session_title) {
                    console.log('📝 [SSE] 收到新标题，正在更新 UI:', eventData.session_title);
                    updateSession(sessionId, { title: eventData.session_title });
                  }
                  
                  // 🚀 核心修复 1：同步消息 ID 到数据库真实 ID (用户 + 助手)
                  if (eventData.user_message_id && userMessageId) {
                    console.log(`🔗 [SSE] 同步用户消息 ID: ${userMessageId} -> ${eventData.user_message_id}`);
                    updateMessageId(userMessageId, eventData.user_message_id);
                  }

                  if (eventData.message_id && assistantMessageId) {
                    console.log(`🔗 [SSE] 同步助手消息 ID: ${assistantMessageId} -> ${eventData.message_id}`);
                    updateMessageId(assistantMessageId, eventData.message_id);
                    assistantMessageId = eventData.message_id; // 同步闭包变量
                  }

                  // 🚀 核心修复 2：同步所有最终标记
                  const finalData = {
                    ...assistantData,
                    ...(eventData.html_report ? { html_report: eventData.html_report } : {}),
                    ...(eventData.can_generate_report ? { can_generate_report: true } : {})
                  }

                  if (Object.keys(finalData).length > 0) {
                    console.log('✨ [SSE] 流结束，同步最终数据至 UI');
                    updateLastMessage({
                      data: JSON.stringify(finalData)
                    })
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
              console.error('Failed to parse event:', e, rawLine)
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Stream Error:', error)
          setThinkingContent('')
          handlers?.onError?.('连接错误，请稍后重试')
        }
      } finally {
        // 🛡️ 防御性兜底：无论如何都确保 loading 状态被清除
        // （防止 done 事件未被正常接收时 loading 永久卡死）
        setIsLoading(false)
      }
    },
    [setIsLoading, setThinkingContent, setCurrentSql, setChartOption, setSqlResult, addMessage, updateLastMessage, isThinkingMode, connectionStatus, offlineMode, localUserId]
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
