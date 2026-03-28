export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  sql?: string
  chart_cfg?: string
  chartConfig?: any
  data?: any
  thinking?: string
  parent_id?: string
  feedback?: number // 1: like, -1: dislike
  feedback_text?: string
  created_at: string
}

export interface SSEEvent {
  event: string
  data: any
}

export interface ChartOption {
  [key: string]: any
}

export interface SQLResult {
  columns: string[]
  rows: any[]
}

export interface ChatState {
  messages: Message[]
  isLoading: boolean
  currentChartOption: ChartOption | null
  currentChartType: string
  currentSqlResult: SQLResult | null
  thinkingContent: string
  currentSql: string
  isThinkingMode: boolean
  addMessage: (message: Message) => void
  setIsLoading: (loading: boolean) => void
  setChartOption: (option: ChartOption | null, type: string) => void
  setSqlResult: (result: SQLResult | null) => void
  setThinkingContent: (content: string) => void
  setCurrentSql: (sql: string) => void
  setThinkingMode: (enabled: boolean) => void
  clearMessages: () => void
  // 从历史消息同步分析结果到右侧面板（chatStore 已实现，此处补全声明）
  setCurrentAnalysis: (sql: string, result: SQLResult | null, chartType?: string, chartOption?: ChartOption | null) => void
}
