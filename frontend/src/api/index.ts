import axios from 'axios'
import type { Session, Message, User, LoginCredentials, RegisterCredentials, TokenResponse } from '@/types'
import { useAuthStore } from '@/stores/authStore'

// 动态获取 API 基础路径
const getBaseURL = () => {
  if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) {
    return '/api'
  }
  return 'http://127.0.0.1:8003/api'
}

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 10000,
  headers: {
    'X-Client-Platform': 'ios-simulator',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
})

// 请求拦截器：自动注入 Token
api.interceptors.request.use((config) => {
  // 直接从 localStorage 读取，确保拿到的是最实时的持久化数据
  const authData = localStorage.getItem('auth-storage')
  if (authData) {
    try {
      const parsed = JSON.parse(authData)
      const token = parsed.state?.token
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        console.log(`[API] Injecting Token: ${token.substring(0, 15)}...`)
      }
    } catch (e) {
      console.error('[API] Failed to parse auth-storage', e)
    }
  }
  return config
})

// 响应拦截器：处理 401 自动登出
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)

// 认证 API
export const authApi = {
  async login(credentials: LoginCredentials): Promise<TokenResponse> {
    const formData = new FormData()
    formData.append('username', credentials.username)
    formData.append('password', credentials.password)
    const response = await api.post('/auth/login', formData)
    return response.data
  },

  async register(credentials: RegisterCredentials & { verification_code: string }): Promise<User> {
    const response = await api.post('/auth/register', credentials)
    return response.data
  },

  async sendCode(email: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/auth/send-code?email=${encodeURIComponent(email)}`)
    return response.data
  },

  async getMe(): Promise<User> {
    const response = await api.get('/auth/me')
    return response.data
  }
}

// 数据库管理 API
export const databaseApi = {
  async getDatabases(): Promise<{ databases: any[] }> {
    const response = await api.get('/databases')
    return response.data
  },

  async switchDatabase(dbKey: string, sessionId?: string): Promise<any> {
    // 切换全局数据库
    await api.post('/database/switch', { database_key: dbKey })
    
    // 如果有会话 ID，同步更新会话绑定的数据库
    if (sessionId) {
      await api.post(`/sessions/${sessionId}/database`, { database_key: dbKey })
    }
  }
}

// 会话管理 API
export const sessionApi = {
  // 创建会话
  async createSession(title?: string): Promise<Session> {
    const response = await api.post('/sessions', title ? { title } : {})
    return response.data
  },

  // 获取会话列表
  async getSessions(): Promise<Session[]> {
    const response = await api.get('/sessions')
    return response.data
  },

  // 获取会话详情
  async getSession(sessionId: string): Promise<Session> {
    const response = await api.get(`/sessions/${sessionId}`)
    return response.data
  },

  // 获取会话消息
  async getMessages(sessionId: string): Promise<Message[]> {
    const response = await api.get(`/sessions/${sessionId}/messages`)
    return response.data
  },

  // 删除会话
  async deleteSession(sessionId: string): Promise<void> {
    await api.delete(`/sessions/${sessionId}`)
  },

  // 更新会话标题
  async updateSessionTitle(sessionId: string, title: string): Promise<Session> {
    const response = await api.patch(`/sessions/${sessionId}`, { title })
    return response.data
  },

  // 添加消息
  async createMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    sql?: string,
    chartCfg?: string,
    thinking?: string,
    data?: string
  ): Promise<Message> {
    const response = await api.post(`/sessions/${sessionId}/messages`, {
      session_id: sessionId,
      role,
      content,
      sql,
      chart_cfg: chartCfg,
      thinking,
      data
    })
    return response.data
  },
}
