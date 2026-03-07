// 本地测试专用 API 配置（端口 8000）
// 此文件不会被提交到 Git

import axios from 'axios'
import type { Session, Message, User, UserLogin, RegisterCredentials, TokenResponse } from '@/types'
import { useAuthStore } from '@/stores/authStore'

import { Capacitor } from '@capacitor/core'

/**
 * 动态获取 API 基础路径
 * 
 * 重要提示：
 * 1. 网页端开发：默认指向 localhost:8000，无需额外配置。
 * 2. 手机端/原生开发：由于手机无法直接访问 localhost，必须使用电脑局域网 IP。
 *    请在 frontend/ 目录下创建 `.env.development.local` 文件并添加：
 *    VITE_API_BASE_URL=http://<你的电脑局域网IP>:8000/api
 */
export const getBaseURL = () => {
  // 1. 如果是网页端，优先使用当前页面的域名和协议
  if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
    const { hostname, protocol } = window.location;
    // 如果是开发环境且没指定端口，默认指向 8000
    return `${protocol}//${hostname}:8000/api`;
  }

  // 2. 只有在移动端原生环境下，才尝试自动探测的 IP
  try {
    const autoUrl = (window as any).__DEV_API_URL__;
    if (autoUrl) return autoUrl;
  } catch (e) {}

  // 3. 兜底逻辑
  return 'http://localhost:8000/api';
}


const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 10000,
  headers: {
    'X-Client-Platform': 'ios-simulator',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

// 请求拦截器：注入 Token
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log(`🔑 [API] ${config.method?.toUpperCase()} ${config.url} (Token injected)`)
  }
  return config;
});

// 响应拦截器：处理 401
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

// ==================== API 方法 ====================

export const authApi = {
  login: async (credentials: UserLogin) => {
    console.log('📡 [API] 发送登录请求...')
    const response = await api.post<TokenResponse>('/auth/login', credentials)
    return response.data
  },
  register: (credentials: RegisterCredentials) =>
    api.post('/auth/register', credentials).then(res => res.data),
  sendCode: (email: string) =>
    api.post('/auth/send-code', { email }).then(res => res.data),
  getMe: () =>
    api.get<User>('/auth/me').then(res => res.data),
};

export const sessionApi = {
  getSessions: () =>
    api.get<Session[]>('/sessions').then(res => res.data),
  createSession: () =>
    api.post<Session>('/sessions').then(res => res.data),
  deleteSession: (id: string) =>
    api.delete(`/sessions/${id}`).then(res => res.data),
  updateSessionTitle: (id: string, title: string) =>
    api.patch(`/sessions/${id}`, { title }).then(res => res.data),
  getMessages: (sessionId: string, all: boolean = false) =>
    api.get<Message[]>(`/sessions/${sessionId}/messages`, { params: { all } }).then(res => res.data),
  activateBranch: (sessionId: string, messageIds: string[]) =>
    api.post(`/sessions/${sessionId}/activate_branch`, { message_ids: messageIds }).then(res => res.data),
  // 导出对话内容 (新功能)
  exportSession: (sessionId: string, format: 'txt' | 'md' | 'pdf') =>
    api.get(`/sessions/${sessionId}/export`, {
      params: { format },
      responseType: 'blob'
    }).then(res => res.data),
};

export const databaseApi = {
  getDatabases: () =>
    api.get('/databases').then(res => res.data),
  switchDatabase: (dbKey: string, sessionId?: string) =>
    api.post('/database/switch', { database_key: dbKey, session_id: sessionId }).then(res => res.data),
  getSchema: (dbKey?: string) =>
    api.get('/schema', { params: { db_key: dbKey } }).then(res => res.data),
};

export const chatApi = {
  chat: (sessionId: string, message: string, config?: any) =>
    api.post('/chat/stream', {
      session_id: sessionId,
      message,
      parent_id: config?.parent_id,
      enable_thinking: config?.enable_thinking,
      enable_rag: config?.enable_rag
    }),
};

export const uploadApi = {
  upload: (file: File, sessionId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  // 深度知识库处理接口
  extractKnowledge: (file: File, engine: string = 'pro', prompt?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('engine', engine);
    if (prompt) formData.append('prompt', prompt);

    return api.post('/upload/knowledge', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000 // 延长至 300 秒 (5分钟)，MinerU 解析超大文件可能较慢
    }).then(res => res.data);
  },};

export default api
