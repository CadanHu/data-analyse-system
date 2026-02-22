export interface Session {
  id: string
  title?: string
  database_key?: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  sql?: string
  chart_cfg?: string
  thinking?: string
  data?: string
  created_at: string
}
