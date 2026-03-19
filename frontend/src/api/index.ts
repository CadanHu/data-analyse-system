// 本地测试专用 API 配置（端口 8000）
// 此文件不会被提交到 Git

import axios from 'axios'
import type { Session, Message, User, LoginCredentials, RegisterCredentials, TokenResponse } from '@/types'
import { useAuthStore } from '@/stores/authStore'

import { Capacitor } from '@capacitor/core'
import { getMobileBaseURL } from '../mobile/api'

/**
 * 动态获取 API 基础路径
 */
export const getBaseURL = () => {
  // 1. 核心修复：检查 Vite 注入的变量 (例如 http://192.168.1.10:8000/api)
  const injectedUrl = (window as any).__DEV_API_URL__;
  
  if (Capacitor.isNativePlatform()) {
    // 强制：如果是原生移动端，必须是 http 开头的绝对路径
    if (injectedUrl && typeof injectedUrl === 'string' && injectedUrl.startsWith('http')) {
      return injectedUrl;
    }
    // 推断逻辑：如果注入失败，尝试从 mobile/api.ts 获取
    return getMobileBaseURL();
  }

  // 2. 网页端开发：支持局域网 IP 直接访问
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${protocol}//${hostname}:8000/api`;
    }
  }

  // 3. 默认兜底：哪怕是本地开发也写全地址，防止 relative path 导致的歧义
  return 'http://localhost:8000/api';
}

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 60000, 
  headers: {
    'X-Client-Platform': Capacitor.isNativePlatform() ? 'mobile' : 'web',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

// 核心自愈：如果在移动端但 baseURL 不含协议头，直接抛出警告
if (Capacitor.isNativePlatform() && !api.defaults.baseURL?.startsWith('http')) {
    console.error(`❌ [API-Fatal] 移动端路径错误: "${api.defaults.baseURL}"。请确保重启了 npm run dev！`);
}

// 打印初始化信息
console.log(`🚀 [API-Init] 基准地址: ${api.defaults.baseURL}`);

// 请求拦截器
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // 打印绝对完整的请求地址，用于排查是否撞到 5173
  const bUrl = config.baseURL || '';
  const finalBase = bUrl.endsWith('/') ? bUrl.slice(0, -1) : bUrl;
  console.log(`📡 [API-Request] ${config.method?.toUpperCase()} ${finalBase}${config.url}`)
  
  return config;
});

// 响应拦截器：检测 HTML 异常响应
api.interceptors.response.use(
  response => {
    // 如果响应是 HTML 源码，说明请求被 5173 误拦截了
    if (typeof response.data === 'string' && response.data.trim().startsWith('<!doctype html>')) {
      console.error('❌ [API-Error] 撞到了前端 5173 端口! 检查 getBaseURL 是否正确。');
      return Promise.reject(new Error('Backend returned HTML instead of JSON. Check your API IP/Port.'));
    }
    return response;
  },
  error => {
    if (error.response?.status === 401 && !useAuthStore.getState().offlineMode) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

// ==================== API 方法 ====================

export const authApi = {
  login: async (credentials: LoginCredentials) => {
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
  updateSessionModes: (id: string, modes: {
    enable_data_science_agent?: boolean
    enable_thinking?: boolean
    enable_rag?: boolean
    model_provider?: string
    model_name?: string
  }) =>
    api.patch(`/sessions/${id}/modes`, modes).then(res => res.data),
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
      enable_rag: config?.enable_rag,
      language: config?.language // 🚀 新增：透传语言
    }),
};

export const uploadApi = {
  upload: (file: File, sessionId: string, engine: string = 'light', useHighPrecision: boolean = false) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    formData.append('engine', engine);
    if (useHighPrecision) formData.append('use_high_precision', 'true');
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000 // 🚀 延长至 60 秒以加载模型
    }).then(res => res.data);
  },
  // 深度知识库处理接口
  extractKnowledge: (file: File, sessionId: string, useHighPrecision: boolean = false, engine: string = 'pro', prompt?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    formData.append('engine', engine);
    if (useHighPrecision) formData.append('use_high_precision', 'true');
    if (prompt) formData.append('prompt', prompt);

    return api.post('/upload/knowledge', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 172800000 // 延长至 172,800,000 毫秒 (48小时)
    }).then(res => res.data);
  },
};

export const apiKeyApi = {
  list: () =>
    api.get('/api-keys').then(res => res.data),
  save: (data: { provider: string; api_key: string; base_url?: string; model_name?: string }) =>
    api.post('/api-keys', data).then(res => res.data),
  remove: (provider: string) =>
    api.delete(`/api-keys/${provider}`).then(res => res.data),
  getThinkingSupport: () =>
    api.get('/api-keys/thinking-support').then(res => res.data),
}

export const ragApi = {
  listChunks: (sessionId?: string) =>
    api.get<{ chunks: Array<{ id: string; content: string; metadata: Record<string, any> }>; total: number }>(
      '/rag/chunks', { params: sessionId ? { session_id: sessionId } : {} }
    ).then(res => res.data),
  deduplicate: (sessionId?: string, similarityThreshold: number = 0.85) =>
    api.post<{ removed: number; remaining: number; total_before: number }>(
      '/rag/deduplicate', { session_id: sessionId || null, similarity_threshold: similarityThreshold }
    ).then(res => res.data),
  deleteChunk: (chunkId: string) =>
    api.post<{ success: boolean }>('/rag/chunk/delete', { chunk_id: chunkId }).then(res => res.data),
};

export const messageApi = {
  saveMessage: (sessionId: string, message: { session_id: string; role: string; content: string; data?: string; thinking?: string }) =>
    api.post(`/sessions/${sessionId}/messages`, message).then(res => res.data),
  updateFeedback: (sessionId: string, messageId: string, feedback: number, feedbackText?: string) =>
    api.post(`/sessions/${sessionId}/messages/${messageId}/feedback`, {
      feedback,
      feedback_text: feedbackText
    }).then(res => res.data),
  getMessage: (sessionId: string, messageId: string) =>
    api.get<Message>(`/sessions/${sessionId}/messages/${messageId}`).then(res => res.data),
};

export default api
