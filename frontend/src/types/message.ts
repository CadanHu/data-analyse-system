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
  addMessage: (message: Message) => void
  setIsLoading: (loading: boolean) => void
  setChartOption: (option: ChartOption | null, type: string) => void
  setSqlResult: (result: SQLResult | null) => void
  setThinkingContent: (content: string) => void
  setCurrentSql: (sql: string) => void
  clearMessages: () => void
}
