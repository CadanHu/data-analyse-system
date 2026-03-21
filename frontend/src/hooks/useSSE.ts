import { useRef, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useLanguageStore } from '../stores/languageStore'
import { useSessionStore } from '../stores/sessionStore'
import { useSyncStore } from '../stores/syncStore'
import { useAuthStore } from '../stores/authStore'
import { streamDirectAi } from '../services/directAiService'
import { searchKnowledge } from '../services/mobileKnowledgeService'
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
    isThinkingMode,
    setStreamingSessionId
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
      setStreamingSessionId(sessionId)

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
      let scientistSql = ''
      let scientistSqliteSQL = ''   // 带 biz 前缀的 SQLite 版本，用于报告重新执行
      let scientistQueryResults: any[] = []
      let scientistQueryColumns: string[] = []

      try {
        // 2a. Offline mode → direct AI
        // On Native: always use local AI for conversations regardless of Wi-Fi / backend reachability.
        //   Backend is only used for data sync, not for AI chat on mobile.
        // On Web: only offlineMode matters — transient ping failures must not bypass the
        //   backend (otherwise PLAN_GENERATION two-step flow breaks).
        const isNative = Capacitor.isNativePlatform()
        const isOffline = offlineMode || isNative
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
          let localTables: { tableName: string; fullTableName: string; columns: string[] }[] = []
          if (currentDb && Capacitor.isNativePlatform()) {
            try { localTables = await getLocalBizTables(currentDb) } catch { /* ignore */ }
          }
          if (options?.enable_data_science_agent) {
            // 科学家模式：两步调用
            // Step 1: 采集 schema + 样本 → AI 静默生成 SQL → 本地执行
            // Step 2: 把真实查询结果喂给 AI → 流式输出分析 + ECharts 图表

            // 1a. 采集每张表 5 行样本（用于给 AI 理解表结构）
            const tableSamples: { tableName: string; rows: any[] }[] = []
            if (currentDb && localTables.length > 0) {
              for (const table of localTables) {
                try {
                  const sampleRows = await executeLocalQuery(`SELECT * FROM "${table.fullTableName}" LIMIT 5`)
                  const cleanSample = (sampleRows as any[]).filter((r: any) => !('ios_columns' in r))
                  if (cleanSample.length > 0) {
                    tableSamples.push({ tableName: table.tableName, rows: cleanSample })
                  }
                } catch { /* ignore */ }
              }
            }

            const schemaInfo = tableSamples.length > 0
              ? tableSamples.map(t =>
                  `表：${t.tableName}\n列：${Object.keys(t.rows[0]).join(', ')}\n样本：${JSON.stringify(t.rows, null, 2)}`
                ).join('\n\n')
              : localTables.map(t => `${t.tableName}(${t.columns.join(', ')})`).join('\n')

            // 1b. AI 静默生成 SQL（非流式收集，不展示给用户）
            if (localTables.length > 0 && currentDb) {
              setThinkingContent('🔍 正在分析数据查询方案...')
              const sqlPrompt: { role: 'system' | 'user'; content: string }[] = [
                {
                  role: 'system',
                  content: `你是数据科学分析师，工作在 SQLite 数据库上。数据库结构及样本如下：\n${schemaInfo}\n\n请生成一条 SQLite 兼容的 SQL 查询来回答用户问题。\nSQLite 注意：用 strftime('%Y-%m', date_col) 代替 DATE_TRUNC，用 date('now','-1 year') 代替 DATE_SUB，不支持 INTERVAL 关键字。\n地理坐标注意：latitude/longitude 是每条记录（如客户）各自的精确坐标，不是城市/地区的代表坐标。当按城市、省份等地理区域分组时，必须用 AVG(latitude) 和 AVG(longitude) 计算区域中心点，绝不能将 latitude/longitude 放入 GROUP BY，否则每条记录会成为独立分组导致聚合失效。\n以 JSON 格式回复：{"sql":"SELECT ...","plan":"分析思路"}\n如不需要查询数据库则 sql 为空字符串。`,
                },
                { role: 'user', content: question },
              ]

              let sqlGenContent = ''
              await new Promise<void>((resolve) => {
                streamDirectAi({
                  provider, model, messages: sqlPrompt, apiKey,
                  signal: controller.signal,
                  onSummary: (chunk) => { sqlGenContent += chunk },
                  onDone: () => resolve(),
                  onError: () => resolve(),
                })
              })
              console.log('🔬 [Scientist-SQL] Gen response:', sqlGenContent)

              // 1c. 解析并执行 SQL
              try {
                const jsonMatch = sqlGenContent.match(/\{[\s\S]*\}/)
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0])
                  const rawSql: string = parsed.sql || ''
                  if (rawSql.trim()) {
                    const tableNames = localTables.map(t => t.tableName)
                    const sqliteSQL = convertMySQLToSQLite(rawSql, currentDb, tableNames)
                    console.log('🔬 [Scientist-SQL] MySQL:', rawSql)
                    console.log('🔬 [Scientist-SQL] SQLite:', sqliteSQL)
                    scientistSql = rawSql
                    scientistSqliteSQL = sqliteSQL
                    setCurrentSql(rawSql)
                    setThinkingContent('⚡ 正在执行查询...')
                    const rows = await executeLocalQuery(sqliteSQL)
                    scientistQueryResults = (rows as any[]).filter((r: any) => !('ios_columns' in r))
                    scientistQueryColumns = scientistQueryResults.length > 0 ? Object.keys(scientistQueryResults[0]) : []
                    console.log(`🔬 [Scientist-SQL] Result: ${scientistQueryResults.length} rows, cols: [${scientistQueryColumns.join(', ')}]`)
                  }
                }
              } catch (e) {
                console.log('🔬 [Scientist-SQL] Error:', e)
              }
            }

            // 1d. 构建给 Step 2 AI 的数据上下文
            let dataContext: string
            if (scientistQueryResults.length > 0) {
              dataContext = `SQL执行结果（共 ${scientistQueryResults.length} 行，列：${scientistQueryColumns.join(', ')}）：\n${JSON.stringify(scientistQueryResults.slice(0, 200), null, 2)}`
            } else {
              dataContext = `数据库结构（仅 Schema）：\n${schemaInfo}`
            }

            setThinkingContent('📊 正在生成分析报告...')

            // Step 2: AI 基于真实数据生成分析 + ECharts 图表（流式）
            aiMessages.unshift({
              role: 'system',
              content: `你是数据科学分析师。以下是用户问题对应的真实查询数据：\n${dataContext}\n\n请基于以上数据进行深度分析，生成 ECharts 图表配置。必须以严格的 JSON 格式回复（不能包含 JavaScript 函数，tooltip 中不要写 formatter 函数）：\n{"analysis":"详细分析文字...","chart_type":"bar|line|pie|area|scatter|table|none","chart_option":{"xAxis":{...},"yAxis":{...},"series":[...],"tooltip":{"trigger":"axis"}}}\n如无合适数据则 chart_type 为 "none"，chart_option 为 null。\nECharts 约束：visualMap 只允许 type 为 "continuous" 或 "piecewise"，禁止使用 type:"size"（该类型不存在）；如需按数值映射气泡大小，请用 type:"continuous" 并设置 inRange.symbolSize。`,
            })
          } else if (localTables.length > 0) {
            // Collect up to 3 sample rows per table so AI knows actual values (e.g. product names)
            const confirmSamples: { tableName: string; rows: any[] }[] = []
            if (currentDb && Capacitor.isNativePlatform()) {
              for (const table of localTables) {
                try {
                  const sr = await executeLocalQuery(`SELECT * FROM "${table.fullTableName}" LIMIT 3`)
                  const clean = (sr as any[]).filter((r: any) => !('ios_columns' in r))
                  if (clean.length > 0) confirmSamples.push({ tableName: table.tableName, rows: clean })
                } catch { /* ignore */ }
              }
            }
            const schemaLines = confirmSamples.length > 0
              ? confirmSamples.map(t =>
                  `${t.tableName}(${Object.keys(t.rows[0]).join(', ')}) -- 样本: ${JSON.stringify(t.rows[0])}`
                ).join('\n')
              : localTables.map(t => `${t.tableName}(${t.columns.join(', ')})`).join('\n')

            // Auto-detect FK relationships from column names present in the synced tables.
            // This allows the AI to write correct JOINs without guessing.
            const tableNameSet = new Set(localTables.map(t => t.tableName))
            const fkHints: string[] = []
            for (const table of localTables) {
              const cols = confirmSamples.find(s => s.tableName === table.tableName)
                ? Object.keys(confirmSamples.find(s => s.tableName === table.tableName)!.rows[0])
                : table.columns
              if (cols.includes('org_id') && tableNameSet.has('organizations') && table.tableName !== 'organizations') {
                fkHints.push(`${table.tableName}.org_id → organizations.org_id（地区/组织归属）`)
              }
              if (cols.includes('product_id') && tableNameSet.has('product_performance') && table.tableName !== 'product_performance') {
                fkHints.push(`${table.tableName}.product_id → product_performance.product_id（关联产品）`)
              }
            }
            const fkSection = fkHints.length > 0
              ? `\n\n【表关系（可直接 JOIN）】\n${fkHints.map(h => `- ${h}`).join('\n')}`
              : ''
            const schemaWithFk = schemaLines + fkSection

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
              systemPrompt = `你是数据分析助手。用户本地离线数据库"${currentDb}"的表结构如下：\n${schemaWithFk}\n\n用户已确认上一轮你提出的分析方案，现在请生成完整的 SQL 查询并执行。\n必须以 JSON 格式回复：\n{"sql":"SELECT ...","chart_type":"bar|line|pie|area|scatter|radar|map|table|none","reasoning":"执行说明"}\n\n【重要】chart_type 是给前端图表库的渲染提示，不需要你生成 ECharts 配置，只需如实填写最适合的图表类型名称即可。用户要求雷达图时填 "radar"，无需担心格式转换问题，前端会自动处理。只有真正无数据可展示时才填 "none"。\n\n【跨表关联规则】只能使用【表关系】中列出的字段做 JOIN，禁止对未列出的字段猜测关联：\n- ad_attribution.touchpoint_id 是自增整数行ID，禁止当日期处理\n- ad_attribution.user_id 是用户ID，不是 org_id / product_id\n- 没有列在【表关系】中的跨表 JOIN 一律禁止\n\nSQL 必须使用 SQLite 语法（禁止使用 MySQL 专有语法）：\n- 禁止 FROM dual，直接写 SELECT expr AS col\n- 日期函数用 strftime('%Y-%m-%d', col)、date('now')、datetime('now')\n- 字符串拼接用 || 而非 CONCAT()\n- 无 IFNULL，用 COALESCE()\n- 无 DATE_FORMAT/DATE_ADD/DATE_SUB，用 strftime()/date()\n- 无 LIMIT x, y 写法，用 LIMIT y OFFSET x\n- 禁止使用数学扩展函数：SQRT/POWER/POW/LOG/LN/EXP/SIN/COS/TAN（运行环境未编译此扩展）\n  - 需要开方时：改为展示方差（VAR）而非标准差，或用 CASE 分箱代替精确计算\n  - 需要相关性时：改为直接输出 (X, Y) 散点数据，由图表展示趋势，不在 SQL 层计算相关系数\nchart_type 根据数据特征和用户需求选择最合适的图表类型。\n【地图类型规则】地理地图选 map，SQL 必须只按 city 分组（GROUP BY c.city），用 AVG(c.latitude) 和 AVG(c.longitude) 取城市平均坐标（同一城市不同客户坐标略有差异，按 city+lat+lng 分组会产生重复点导致地图标签重叠），并 SELECT city, AVG(latitude) AS latitude, AVG(longitude) AS longitude 以及一个数值指标字段。\n状态过滤使用 IN ('Shipped','shipped') 枚举，禁止使用 LOWER(column) LIKE '%value%' 全表扫描写法。`
            } else {
              // Step 1: new question → propose plan, ask for confirmation, NO SQL yet
              systemPrompt = `你是专业的数据分析顾问。用户本地离线数据库"${currentDb}"的表结构如下：\n${schemaWithFk}\n\n用户提出了分析需求，请按以下格式提出分析方案供用户确认，不要生成 SQL：\n必须以 JSON 格式回复：\n{"sql":"","chart_type":"none","reasoning":"【分析方案】\\n1. 涉及的数据表及作用：...\\n2. 分析思路：...\\n3. 推荐图表类型：...\\n\\n这个分析方案是否可以？如果确认，我将为您生成数据并分析。"}\n\n注意：sql 字段必须为空字符串，等用户确认后再生成 SQL。确认后生成的 SQL 须使用 SQLite 语法。\n【跨表关联规则】只能使用【表关系】中列出的字段做 JOIN；ad_attribution.touchpoint_id 是整数ID非日期，ad_attribution.user_id 不等于 org_id/product_id，禁止对未列出字段猜测关联。`
            }
            aiMessages.unshift({ role: 'system', content: systemPrompt })
          }

          // RAG 模式：从本地 SQLite 知识库检索相关内容注入上下文
          // 优先语义向量搜索，无 embedding key 时降级 FTS5 关键词搜索
          if (!options?.enable_data_science_agent && options?.enable_rag) {
            try {
              const localKnowledge = await searchKnowledge(userId, sessionId, question)
              if (localKnowledge) {
                aiMessages.unshift({
                  role: 'system',
                  content: `你处于知识库模式，以下是从用户本地知识库检索到的相关内容，请优先参考：\n\n${localKnowledge}\n\n如以上内容不足以回答问题，请据实说明。`,
                })
              } else {
                aiMessages.unshift({
                  role: 'system',
                  content: '你处于知识库模式。请优先参考对话历史中已有的文档内容、文件摘要和知识信息来回答问题，如历史中无相关内容则据实说明。',
                })
              }
            } catch {
              aiMessages.unshift({
                role: 'system',
                content: '你处于知识库模式。请优先参考对话历史中已有的文档内容、文件摘要和知识信息来回答问题，如历史中无相关内容则据实说明。',
              })
            }
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
              let displayContent = assistantContent
              if (options?.enable_data_science_agent) {
                // 科学家模式：从部分 JSON 中渐进提取 analysis 字段实时显示
                // 避免把整个 JSON/代码块渲染成 markdown 造成闪烁
                const analysisMatch = assistantContent.match(/"analysis"\s*:\s*"((?:[^"\\]|\\.)*)"?/)
                if (analysisMatch) {
                  displayContent = analysisMatch[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                } else {
                  displayContent = ''
                }
              }
              if (!assistantMessageAdded) {
                addMessage({
                  id: assistantMessageId,
                  session_id: sessionId,
                  parent_id: userMessageId,
                  role: 'assistant',
                  content: displayContent,
                  thinking: assistantModelThinking,
                  created_at: new Date().toISOString()
                })
                assistantMessageAdded = true
              } else {
                updateLastMessage({ content: displayContent, thinking: assistantModelThinking })
              }
            },
            onDone: () => {
              console.log('📥 [Offline-AI] Full response:', assistantContent)
              if (assistantModelThinking) console.log('💭 [Offline-AI] Thinking:', assistantModelThinking)
              setStreamingSessionId(null)
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

          // After streaming: 科学家模式解析 analysis + chart_option
          if (options?.enable_data_science_agent && assistantContent) {
            const jsonMatch = assistantContent.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              try {
                // 剥离 AI 可能写入的 JS 函数字面量（不合法 JSON）
                // 支持单层和双层花括号嵌套的函数体，例如 formatter: function(p){ p.forEach(function(i){...}) }
                const cleanJson = jsonMatch[0].replace(
                  /:\s*function\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
                  ': null'
                )
                const parsed = JSON.parse(cleanJson)
                const analysisText: string = parsed.analysis || assistantContent
                const chartOption = parsed.chart_option || null
                const chartType: string = parsed.chart_type || 'none'
                if (chartOption && chartType !== 'none') {
                  const activeSessionId = useSessionStore.getState().currentSession?.id
                  if (activeSessionId === sessionId) {
                    setChartOption(chartOption, chartType)
                  }
                }
                // 若有执行过 SQL，也将结果挂到右侧面板
                if (scientistSql && scientistQueryResults.length > 0) {
                  const sqlResult = { columns: scientistQueryColumns, rows: scientistQueryResults, total_count: scientistQueryResults.length }
                  const activeSessionId = useSessionStore.getState().currentSession?.id
                  if (activeSessionId === sessionId) {
                    setCurrentAnalysis(scientistSql, sqlResult, chartType !== 'none' ? chartType : 'table', chartOption)
                  }
                }
                const sciData = JSON.stringify({
                  is_data_science: true,
                  can_generate_report: true,
                  ...(scientistQueryResults.length > 0 ? { total_count: scientistQueryResults.length } : {}),
                  ...(scientistSqliteSQL ? { sqlite_sql: scientistSqliteSQL } : {}),
                })
                updateLastMessage({
                  content: analysisText,
                  sql: scientistSql || undefined,
                  chart_cfg: chartOption ? JSON.stringify(chartOption) : undefined,
                  data: sciData,
                })
                await localUpdateMessage(assistantMessageId, {
                  content: analysisText,
                  sql: scientistSql || undefined,
                  chart_cfg: chartOption ? JSON.stringify(chartOption) : undefined,
                  data: sciData,
                }).catch(() => {})
              } catch { /* not valid JSON, keep plain text */ }
            }
          }

          // After streaming: parse SQL from response and execute locally
          if (!options?.enable_data_science_agent && currentDb && localTables.length > 0 && assistantContent) {
            const jsonMatch = assistantContent.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0])
                const rawSql: string = parsed.sql || ''
                const reasoning: string = parsed.reasoning || parsed.explanation || ''
                let chartType: string = parsed.chart_type || 'none'
                // Fallback: if model returned 'none' but user explicitly asked for a chart type,
                // infer it from the original question to avoid hiding the visualisation button.
                if (chartType === 'none') {
                  const q = question.toLowerCase()
                  if (q.includes('雷达') || q.includes('radar')) chartType = 'radar'
                  else if (q.includes('饼') || q.includes('pie')) chartType = 'pie'
                  else if (q.includes('折线') || q.includes('line')) chartType = 'line'
                  else if (q.includes('面积') || q.includes('area')) chartType = 'area'
                  else if (q.includes('散点') || q.includes('scatter')) chartType = 'scatter'
                  else if (q.includes('柱') || q.includes('bar')) chartType = 'bar'
                }
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
                      if (chartType === 'map') {
                        // Map type: build a bar chart ranked by the metric column (offline has no geo renderer)
                        const metricKey = columns.find((c: string) => !['city', 'latitude', 'longitude', 'province'].includes(c.toLowerCase())) || columns[columns.length - 1]
                        const cityKey = columns.find((c: string) => c.toLowerCase() === 'city') || columns[0]
                        const sorted = [...cleanRows].sort((a: any, b: any) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0)).slice(0, 30)
                        offlineChartOption = {
                          chart_type: 'map',
                          xAxis: { type: 'category', data: sorted.map((r: any) => r[cityKey]), axisLabel: { rotate: 45 } },
                          yAxis: { type: 'value' },
                          series: [{ data: sorted.map((r: any) => r[metricKey] ?? 0), type: 'bar' }],
                          tooltip: { trigger: 'axis' },
                        }
                      } else if (chartType === 'radar') {
                        // Radar chart: first column is the series name, rest are numeric dimensions
                        const nameKey = columns[0]
                        const dimKeys = columns.slice(1)
                        const maxVal = dimKeys.reduce((mx: number, k: string) => {
                          const colMax = Math.max(...cleanRows.map((r: any) => Number(r[k]) || 0))
                          return Math.max(mx, colMax)
                        }, 100)
                        offlineChartOption = {
                          chart_type: 'radar',
                          radar: {
                            indicator: dimKeys.map((k: string) => ({ name: k, max: maxVal })),
                            shape: 'polygon',
                          },
                          series: [{
                            type: 'radar',
                            data: cleanRows.map((r: any) => ({
                              name: String(r[nameKey]),
                              value: dimKeys.map((k: string) => Number(r[k]) || 0),
                            })),
                          }],
                          tooltip: { trigger: 'item' },
                          legend: { data: cleanRows.map((r: any) => String(r[nameKey])) },
                        }
                      } else {
                        const xKey = columns[0]
                        const yKeys = columns.slice(1).length > 0 ? columns.slice(1) : [columns[0]]
                        offlineChartOption = {
                          xAxis: { type: 'category', data: cleanRows.map((r: any) => r[xKey]) },
                          yAxis: { type: 'value' },
                          series: yKeys.map((yKey: string) => ({
                            name: yKey,
                            data: cleanRows.map((r: any) => r[yKey]),
                            type: chartType === 'area' ? 'line' : chartType,
                            ...(chartType === 'area' ? { areaStyle: {} } : {}),
                            smooth: true,
                          })),
                          legend: yKeys.length > 1 ? { data: yKeys } : undefined,
                          tooltip: { trigger: 'axis' },
                        }
                      }
                    }
                    // Open right panel — only if the user hasn't switched to a different session
                    // while the async SQL execution was running (prevents chart bleed).
                    const activeSessionId = useSessionStore.getState().currentSession?.id
                    if (activeSessionId === sessionId) {
                      setCurrentAnalysis(rawSql, sqlResult, effectiveChartType, offlineChartOption)
                    }
                    // 数据量 >= 3 行时显示"生成深度报告"按钮
                    const offlineData = {
                      ...sqlResult,
                      ...(cleanRows.length >= 3 ? { can_generate_report: true } : {})
                    }
                    updateLastMessage({
                      content: displayContent,
                      sql: rawSql,
                      sql_result: JSON.stringify(sqlResult),
                      chart_cfg: offlineChartOption ? JSON.stringify(offlineChartOption) : undefined,
                      data: offlineData,
                    })
                    await localUpdateMessage(assistantMessageId, {
                      content: displayContent,
                      sql: rawSql,
                      sql_result: JSON.stringify(sqlResult),
                      chart_cfg: offlineChartOption ? JSON.stringify(offlineChartOption) : undefined,
                      data: JSON.stringify(offlineData),
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
                case 'execution_result':
                  // 科学家模式专用：包含 plot_image_base64 / is_data_science / can_generate_report
                  assistantData = eventData
                  updateLastMessage({ data: JSON.stringify(eventData) })
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
        setStreamingSessionId(null)
      }
    },
    [setIsLoading, setThinkingContent, setCurrentSql, setChartOption, setSqlResult, addMessage, updateLastMessage, isThinkingMode, connectionStatus, offlineMode, localUserId, setStreamingSessionId]
  )

  const disconnect = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
    setStreamingSessionId(null)
  }, [setIsLoading, setStreamingSessionId])

  return { connect, disconnect }
}
