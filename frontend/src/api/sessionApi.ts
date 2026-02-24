import axios from 'axios'
import type { Session, Message } from '../types'

// 动态获取 API 基础路径
// 在 Web 开发环境中继续使用 '/api' 走 Vite 代理
// 在 iOS/Android 真机环境中，由于没有代理服务器，需要直接指向后端局域网 IP
const getBaseURL = () => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (origin.startsWith('http')) {
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

// 会话管理 API
const sessionApi = {
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

export default sessionApi
export { sessionApi }
