// 本地测试专用 API 配置（端口 8000）
// 此文件不会被提交到 Git

import axios from 'axios'
import type { Session, Message, User, UserLogin, RegisterCredentials, TokenResponse } from '@/types'
import { useAuthStore } from '@/stores/authStore'

// 动态获取 API 基础路径
export const getBaseURL = () => {
  // 1. 检查环境变量 (Vite)
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (envBaseUrl) return envBaseUrl;

  // 2. 手动注入 (用于部分特殊构建环境)
  if (typeof window !== 'undefined' && (window as any).BACKEND_URL) {
    return (window as any).BACKEND_URL + '/api';
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;

    // 3. 显式识别 Capacitor (App 环境)
    // @ts-ignore
    const isCapacitor = window.Capacitor || origin.startsWith('capacitor') || origin.startsWith('http://10.0.2.2');

    if (isCapacitor) {
      // Android 模拟器
      if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
        const isEmulator = /sdk|google/i.test(navigator.userAgent);
        if (isEmulator) return 'http://10.0.2.2:8000/api';
      }
      // 默认回退到本地
      return 'http://localhost:8000/api';
    }
  }

  // 4. 浏览器网页环境默认值
  return '/api';
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
  getMessages: (sessionId: string) =>
    api.get<Message[]>(`/sessions/${sessionId}/messages`).then(res => res.data),
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
      config
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
};

export default api
