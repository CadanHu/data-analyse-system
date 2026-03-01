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
