export interface Session {
  id: string
  title?: string
  database_key?: string
  enable_data_science_agent?: boolean
  enable_thinking?: boolean
  enable_rag?: boolean
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  session_id: string
  parent_id?: string
  role: 'user' | 'assistant'
  content: string
  sql?: string
  chart_cfg?: string
  thinking?: string
  data?: string
  is_current?: number
  created_at: string
}

export interface User {
  id: number
  username: string
  email: string
  avatar_url?: string
  created_at: string
  last_login?: string
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface RegisterCredentials {
  username: string
  email: string
  password: string
  verification_code: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}
