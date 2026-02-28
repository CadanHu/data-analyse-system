// 本地测试专用 API 配置（端口 8008）
// 此文件不会被提交到 Git

import axios from 'axios'
import type { Session, Message, User, UserLogin, RegisterCredentials, TokenResponse } from '@/types'
import { useAuthStore } from '@/stores/authStore'

// 动态获取 API 基础路径
export const getBaseURL = () => {
  // --- 优先级 1: 手动注入 ---
  if (typeof window !== 'undefined' && (window as any).BACKEND_URL) {
    return (window as any).BACKEND_URL + '/api';
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;

    // --- 优先级 2: 显式识别 Capacitor (App 环境) ---
    // @ts-ignore
    const isCapacitor = window.Capacitor || origin.startsWith('capacitor') || origin.startsWith('http://10.0.2.2');

    if (isCapacitor) {
      // Android
      if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
        const isEmulator = /sdk|google/i.test(navigator.userAgent);
        if (isEmulator) return 'http://10.0.2.2:8008/api';
        // 真机 USB 调试 (adb reverse tcp:8008 tcp:8008)
        return 'http://localhost:8008/api';
      }
      // iOS
      if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        return 'http://localhost:8008/api';
      }
      // Capacitor 默认
      return 'http://localhost:8008/api';
    }

    // --- 优先级 3: 浏览器网页环境 (使用 Vite 代理) ---
    // 网页端返回 /api，axios 会将其作为所有请求的前缀
    // 请求 api.post('/auth/login') 将变为 /api/auth/login，完美匹配 Vite 代理
    return '/api';
  }
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
  console.log('🔑 [API Interceptor] 请求拦截器:', {
    url: config.url,
    hasToken: !!token,
    token: token ? token.substring(0, 30) + '...' : null
  })
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log('✅ [API Interceptor] Token 已注入:', config.headers.Authorization)
  } else {
    console.warn('⚠️ [API Interceptor] 没有 Token，跳过注入')
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
    console.log('📡 [API] 登录响应:', response)
    console.log('📡 [API] 登录响应数据:', response.data)
    return response.data
  },
  register: (credentials: RegisterCredentials) =>
    api.post('/auth/register', credentials),
  sendCode: (email: string) =>
    api.post('/auth/send-code', { email }),
  getMe: () =>
    api.get<User>('/auth/me'),
};

export const sessionApi = {
  getSessions: () =>
    api.get<Session[]>('/sessions'),
  createSession: () =>
    api.post<Session>('/sessions'),
  deleteSession: (id: string) =>
    api.delete(`/sessions/${id}`),
  updateSessionTitle: (id: string, title: string) =>
    api.patch(`/sessions/${id}`, { title }),
  getMessages: (sessionId: string) =>
    api.get<Message[]>(`/sessions/${sessionId}/messages`),
};

export const databaseApi = {
  getDatabases: () =>
    api.get('/databases'),
  switchDatabase: (dbKey: string, sessionId?: string) =>
    api.post('/databases/switch', { db_key: dbKey, session_id: sessionId }),
  getSchema: (dbKey?: string) =>
    api.get('/schema', { params: { db_key: dbKey } }),
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
    });
  },
};

export default api
