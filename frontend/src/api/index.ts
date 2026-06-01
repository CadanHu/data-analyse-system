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

export const datasourceApi = {
  list: () =>
    api.get('/datasources').then(res => res.data),
  create: (data: {
    name: string; type: string; host: string; port: number
    db_name: string; username: string; password?: string; description?: string
  }) =>
    api.post('/datasources', data).then(res => res.data),
  update: (id: string, data: Partial<{
    name: string; type: string; host: string; port: number
    db_name: string; username: string; password?: string; description: string
  }>) =>
    api.put(`/datasources/${id}`, data).then(res => res.data),
  delete: (id: string) =>
    api.delete(`/datasources/${id}`).then(res => res.data),
  test: (data: {
    type: string; host: string; port: number
    db_name: string; username: string; password: string
  }) =>
    api.post('/datasources/test', data).then(res => res.data),
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
  upload: (file: File, sessionId: string, engine: string = 'light', useHighPrecision: boolean = false, pageRange?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    formData.append('engine', engine);
    if (useHighPrecision) formData.append('use_high_precision', 'true');
    if (pageRange) formData.append('page_range', pageRange);
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000
    }).then(res => res.data);
  },
  // 深度知识库处理接口
  extractKnowledge: (file: File, sessionId: string, useHighPrecision: boolean = false, engine: string = 'pro', prompt?: string, pageRange?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    formData.append('engine', engine);
    if (useHighPrecision) formData.append('use_high_precision', 'true');
    if (prompt) formData.append('prompt', prompt);
    if (pageRange) formData.append('page_range', pageRange);

    return api.post('/upload/knowledge', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 172800000
    }).then(res => res.data);
  },
  cancelKnowledgeExtraction: (sessionId: string) =>
    api.post(`/upload/knowledge/cancel/${sessionId}`).then(res => res.data),
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
  listChunks: (sessionId?: string, limit?: number, offset?: number) =>
    api.get<{ chunks: Array<{ id: string; content: string; metadata: Record<string, any> }>; total: number }>(
      '/rag/chunks', {
        params: {
          ...(sessionId ? { session_id: sessionId } : {}),
          ...(limit !== undefined ? { limit, offset: offset ?? 0 } : {}),
        }
      }
    ).then(res => res.data),
  deduplicate: (sessionId?: string, similarityThreshold: number = 0.85) =>
    api.post<{ removed: number; remaining: number; total_before: number }>(
      '/rag/deduplicate', { session_id: sessionId || null, similarity_threshold: similarityThreshold }
    ).then(res => res.data),
  deleteChunk: (chunkId: string) =>
    api.post<{ success: boolean }>('/rag/chunk/delete', { chunk_id: chunkId }).then(res => res.data),
  deleteDoc: (sessionId: string | undefined, filename: string) =>
    api.post<{ success: boolean; deleted: number }>('/rag/doc/delete', { session_id: sessionId || null, filename }).then(res => res.data),
  listDocs: (sessionId?: string) =>
    api.get<{ docs: string[]; total: number }>(
      '/rag/docs', { params: sessionId ? { session_id: sessionId } : {} }
    ).then(res => res.data),
};

export const parsedApi = {
  deleteParsed: (stem: string) =>
    api.delete<{ success: boolean; deleted_paths: string[] }>(`/parsed-output/${encodeURIComponent(stem)}`).then(res => res.data),
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

// ─────────────────────────────────────
// 知识图谱管理 API
// ─────────────────────────────────────

export interface KGEntity {
  id: string
  text: string
  type: string
  doc_id?: string
  description?: string
  created_at?: string
}

export interface KGRelation {
  id: string
  source: string
  target: string
  label: string
  doc_id?: string
  created_at?: string
}

export interface KGFullGraph {
  entities: KGEntity[]
  relations: KGRelation[]
}

export interface KGStats {
  total_entities: number
  total_relations: number
  total_docs: number
  entity_type_counts: Record<string, number>
  top_relation_types: Array<{ type: string; count: number }>
}

export interface KGDocInfo {
  doc_id: string
  entity_count: number
  relation_count: number
}

export interface KGPathResult {
  found: boolean
  hops: number
  path: Array<{ from: string; relation: string; to: string }> | null
}

export interface KGCommunity {
  id: number
  doc_id: string
  community_id: number
  title: string
  summary: string
  entity_texts: string[]
  size: number
  created_at?: string
}

export const knowledgeGraphApi = {
  getFullGraph: (docId?: string, limit?: number) =>
    api.get<KGFullGraph>('/knowledge-graph/graph', {
      params: { ...(docId ? { doc_id: docId } : {}), ...(limit ? { limit } : {}) }
    }).then(r => r.data),

  getStats: () =>
    api.get<KGStats>('/knowledge-graph/stats').then(r => r.data),

  search: (q: string, limit = 20) =>
    api.get<KGFullGraph>('/knowledge-graph/search', { params: { q, limit } }).then(r => r.data),

  listDocs: () =>
    api.get<{ docs: KGDocInfo[]; total: number }>('/knowledge-graph/docs').then(r => r.data),

  findPath: (source: string, target: string, maxHops = 5) =>
    api.get<KGPathResult>('/knowledge-graph/path', {
      params: { source, target, max_hops: maxHops }
    }).then(r => r.data),

  createEntity: (data: { text: string; entity_class: string; doc_id?: string; description?: string }) =>
    api.post<KGEntity>('/knowledge-graph/entities', data).then(r => r.data),

  updateEntity: (id: string, data: { text?: string; entity_class?: string; description?: string }) =>
    api.put<{ success: boolean }>(`/knowledge-graph/entities/${id}`, data).then(r => r.data),

  deleteEntity: (id: string) =>
    api.delete<{ success: boolean }>(`/knowledge-graph/entities/${id}`).then(r => r.data),

  createRelation: (data: { source_text: string; target_text: string; relation_type: string; doc_id?: string }) =>
    api.post<KGRelation>('/knowledge-graph/relations', data).then(r => r.data),

  updateRelation: (id: string, data: { source_text?: string; target_text?: string; relation_type?: string }) =>
    api.put<{ success: boolean }>(`/knowledge-graph/relations/${id}`, data).then(r => r.data),

  deleteRelation: (id: string) =>
    api.delete<{ success: boolean }>(`/knowledge-graph/relations/${id}`).then(r => r.data),

  exportGraph: (docId?: string) =>
    api.get<KGFullGraph>('/knowledge-graph/export', {
      params: docId ? { doc_id: docId } : {}
    }).then(r => r.data),

  getCommunities: (docId?: string) =>
    api.get<{ communities: KGCommunity[]; total: number }>('/knowledge-graph/communities', {
      params: docId ? { doc_id: docId } : {}
    }).then(r => r.data),
}

// ============================================================
// v2 API (workspace / v2 sessions / canvas nodes)
// 详见 data-sys-docs/v2-schema.md
// ============================================================

export interface V2Workspace {
  id: string
  name: string
  slug: string
  owner_user_id: number
  plan_tier: string
  role?: string
}

export interface V2Session {
  id: string
  workspace_id: string
  owner_user_id: number
  title: string | null
  model_provider: string | null
  model_name: string | null
  mode_flags_json: any
  created_at: string
  updated_at: string
}

export interface V2CanvasNode {
  node_id: string
  parent_node_id: string | null
  branch_label: string | null
  pinned_to_board_id: string | null
  position_index: number
  clarify_status: string
  hitl_status: string
  message_id: string
  role: 'user' | 'assistant' | 'system'
  content: string | null
  sql: string | null
  chart_cfg_json: any
  data_json: any
  thinking_steps_json: string[] | null
  elapsed_ms: number | null
  created_at: string
}

export interface V2Board {
  id: string
  workspace_id: string
  title: string
  description: string | null
  grid_cols: number
  schedule_cron: string | null
  owner_user_id: number
  from_template_id: string | null
  created_at: string
  updated_at: string
  widgets?: V2BoardWidget[]
}

export interface V2BoardWidget {
  widget_id: string
  board_id: string
  source_node_id: string
  grid_x: number
  grid_y: number
  w: number
  h: number
  override_cfg_json: any
  order_index: number
  node_role: string
  node_content: string | null
  node_sql: string | null
  node_chart_cfg_json: any
  node_branch_label: string | null
}

export interface V2BoardTemplate {
  id: string
  category: string | null
  name: string
  preview_url: string | null
  layout_json: any
  is_builtin: boolean
}

export interface V2WorkspaceMember {
  workspace_id: string
  user_id: number
  role: string
  joined_at: string | null
  invited_by_user_id: number | null
  // 路由层跨库 enrich 出来的用户资料
  email: string | null
  username: string
  avatar_url: string | null
}

export interface V2Profile {
  user_id: number
  display_name: string | null
  role: string | null
  team_id: string | null
  avatar_url: string | null
  lang: string
  theme: string
  density: string
  shortcuts_json: any
}

export const v2Api = {
  getMyProfile: () =>
    api.get<V2Profile>('/v2/me/profile').then(r => r.data),
  updateMyProfile: (updates: Partial<V2Profile>) =>
    api.put<V2Profile>('/v2/me/profile', updates).then(r => r.data),

  getCurrentWorkspace: () =>
    api.get<V2Workspace>('/v2/workspaces/current').then(r => r.data),
  listWorkspaces: () =>
    api.get<V2Workspace[]>('/v2/workspaces').then(r => r.data),
  // DAT-27 · 工作区成员
  listMembers: (workspaceId: string) =>
    api.get<V2WorkspaceMember[]>(`/v2/workspaces/${workspaceId}/members`).then(r => r.data),
  addMember: (workspaceId: string, payload: { email: string; role: string }) =>
    api.post<V2WorkspaceMember>(`/v2/workspaces/${workspaceId}/members`, payload).then(r => r.data),
  updateMemberRole: (workspaceId: string, userId: number, role: string) =>
    api.patch<V2WorkspaceMember>(`/v2/workspaces/${workspaceId}/members/${userId}`, { role }).then(r => r.data),
  removeMember: (workspaceId: string, userId: number) =>
    api.delete(`/v2/workspaces/${workspaceId}/members/${userId}`).then(r => r.data),

  listSessions: (workspaceId: string) =>
    api.get<V2Session[]>('/v2/sessions', { params: { workspace_id: workspaceId } }).then(r => r.data),
  createSession: (workspaceId: string, title?: string) =>
    api.post<V2Session>('/v2/sessions', { workspace_id: workspaceId, title }).then(r => r.data),
  deleteV2Session: (sessionId: string) =>
    api.delete(`/v2/sessions/${sessionId}`).then(r => r.data),
  listCanvasNodes: (sessionId: string) =>
    api.get<V2CanvasNode[]>(`/v2/sessions/${sessionId}/canvas-nodes`).then(r => r.data),
  askStreamUrl: (sessionId: string) => `/api/v2/sessions/${sessionId}/ask`,

  // 阶段 3 · 看板
  listBoards: (workspaceId: string) =>
    api.get<V2Board[]>('/v2/boards', { params: { workspace_id: workspaceId } }).then(r => r.data),
  createBoard: (workspaceId: string, title: string, description?: string) =>
    api.post<V2Board>('/v2/boards', { workspace_id: workspaceId, title, description }).then(r => r.data),
  getBoard: (boardId: string) =>
    api.get<V2Board>(`/v2/boards/${boardId}`).then(r => r.data),
  updateBoard: (boardId: string, updates: Partial<{ title: string; description: string; grid_cols: number; schedule_cron: string }>) =>
    api.patch<V2Board>(`/v2/boards/${boardId}`, updates).then(r => r.data),
  deleteBoard: (boardId: string) =>
    api.delete(`/v2/boards/${boardId}`).then(r => r.data),
  pinNodeToBoard: (boardId: string, sourceNodeId: string, opts?: { grid_x?: number; grid_y?: number; w?: number; h?: number }) =>
    api.post<V2BoardWidget>(`/v2/boards/${boardId}/widgets`, { source_node_id: sourceNodeId, ...opts }).then(r => r.data),
  updateWidget: (boardId: string, widgetId: string, updates: Partial<{ grid_x: number; grid_y: number; w: number; h: number }>) =>
    api.patch<V2BoardWidget>(`/v2/boards/${boardId}/widgets/${widgetId}`, updates).then(r => r.data),
  deleteWidget: (boardId: string, widgetId: string) =>
    api.delete(`/v2/boards/${boardId}/widgets/${widgetId}`).then(r => r.data),
  listBoardTemplates: (category?: string) =>
    api.get<V2BoardTemplate[]>('/v2/board-templates', { params: category ? { category } : {} }).then(r => r.data),

  // 阶段 4 · 分享 + 通知
  createShareLink: (targetType: string, targetId: string, permission = 'view', expiresDays?: number) =>
    api.post('/v2/share-links', { target_type: targetType, target_id: targetId, permission, expires_days: expiresDays }).then(r => r.data),
  listShareLinks: (targetType?: string, targetId?: string) =>
    api.get('/v2/share-links', { params: { target_type: targetType, target_id: targetId } }).then(r => r.data),
  revokeShareLink: (linkId: string) =>
    api.post(`/v2/share-links/${linkId}/revoke`).then(r => r.data),
  deleteShareLink: (linkId: string) =>
    api.delete(`/v2/share-links/${linkId}`).then(r => r.data),
  upsertShareGrant: (targetType: string, targetId: string, userId: number, permission = 'view') =>
    api.post('/v2/share-grants', { target_type: targetType, target_id: targetId, user_id: userId, permission }).then(r => r.data),
  listShareGrants: (targetType: string, targetId: string) =>
    api.get('/v2/share-grants', { params: { target_type: targetType, target_id: targetId } }).then(r => r.data),
  deleteShareGrant: (grantId: string) =>
    api.delete(`/v2/share-grants/${grantId}`).then(r => r.data),

  listNotifications: (onlyUnread = false, limit = 50, offset = 0) =>
    api.get('/v2/notifications', { params: { only_unread: onlyUnread, limit, offset } }).then(r => r.data),
  countUnreadNotifications: () =>
    api.get('/v2/notifications/_count').then(r => r.data),
  markNotificationRead: (notifId: string) =>
    api.patch(`/v2/notifications/${notifId}/read`).then(r => r.data),
  markAllNotificationsRead: () =>
    api.post('/v2/notifications/_read_all').then(r => r.data),
  deleteNotification: (notifId: string) =>
    api.delete(`/v2/notifications/${notifId}`).then(r => r.data),

  // 阶段 5 · 告警
  listAlertRules: (workspaceId: string) =>
    api.get('/v2/alert-rules', { params: { workspace_id: workspaceId } }).then(r => r.data),
  createAlertRule: (data: any) =>
    api.post('/v2/alert-rules', data).then(r => r.data),
  updateAlertRule: (ruleId: string, updates: any) =>
    api.patch(`/v2/alert-rules/${ruleId}`, updates).then(r => r.data),
  deleteAlertRule: (ruleId: string) =>
    api.delete(`/v2/alert-rules/${ruleId}`).then(r => r.data),
  listAlertEvents: (params: { rule_id?: string; workspace_id?: string; status?: string; limit?: number }) =>
    api.get('/v2/alert-events', { params }).then(r => r.data),
  triggerAlert: (ruleId: string, data: any) =>
    api.post(`/v2/alert-rules/${ruleId}/_trigger`, data).then(r => r.data),
  evalAlertNow: (ruleId: string) =>
    api.post(`/v2/alert-rules/${ruleId}/_eval_now`).then(r => r.data),
  ackAlertEvent: (eventId: string) =>
    api.patch(`/v2/alert-events/${eventId}/ack`).then(r => r.data),
  resolveAlertEvent: (eventId: string) =>
    api.patch(`/v2/alert-events/${eventId}/resolve`).then(r => r.data),
  subscribeAlert: (ruleId: string, channelOverrides?: any) =>
    api.post(`/v2/alert-rules/${ruleId}/subscribe`, { channel_overrides: channelOverrides }).then(r => r.data),
  unsubscribeAlert: (ruleId: string) =>
    api.delete(`/v2/alert-rules/${ruleId}/subscribe`).then(r => r.data),
  listAlertSubscribers: (ruleId: string) =>
    api.get(`/v2/alert-rules/${ruleId}/subscribers`).then(r => r.data),
  myAlertSubscriptions: () =>
    api.get('/v2/me/alert-subscriptions').then(r => r.data),

  // 阶段 6 · 管理后台
  // audit
  listAuditLogs: (params: { workspace_id?: string; actor_user_id?: number; target_type?: string; target_id?: string; since_days?: number; limit?: number; offset?: number }) =>
    api.get('/v2/admin/audit', { params }).then(r => r.data),
  auditStats: (workspaceId: string, sinceDays = 30) =>
    api.get('/v2/admin/audit/_stats', { params: { workspace_id: workspaceId, since_days: sinceDays } }).then(r => r.data),
  seedAuditLog: (data: any) =>
    api.post('/v2/admin/audit/_seed', data).then(r => r.data),
  // billing
  getSubscription: (workspaceId: string) =>
    api.get('/v2/admin/billing/subscription', { params: { workspace_id: workspaceId } }).then(r => r.data),
  upgradePlan: (data: any) =>
    api.post('/v2/admin/billing/subscription', data).then(r => r.data),
  getSeats: (workspaceId: string) =>
    api.get('/v2/admin/billing/seats', { params: { workspace_id: workspaceId } }).then(r => r.data),
  updateSeats: (data: any) =>
    api.patch('/v2/admin/billing/seats', data).then(r => r.data),
  getUsage: (workspaceId: string, period?: string) =>
    api.get('/v2/admin/billing/usage', { params: { workspace_id: workspaceId, period } }).then(r => r.data),
  listInvoices: (workspaceId: string) =>
    api.get('/v2/admin/billing/invoices', { params: { workspace_id: workspaceId } }).then(r => r.data),
  createInvoice: (data: any) =>
    api.post('/v2/admin/billing/invoices', data).then(r => r.data),
  updateInvoiceStatus: (invoiceId: string, status: string) =>
    api.patch(`/v2/admin/billing/invoices/${invoiceId}`, { status }).then(r => r.data),
  closeBillingMonth: (year: number, month: number) =>
    api.post('/v2/admin/billing/_close-month', null, { params: { year, month } }).then(r => r.data),
  // model routes & budgets
  listModelRoutes: (workspaceId: string) =>
    api.get('/v2/admin/model-routes', { params: { workspace_id: workspaceId } }).then(r => r.data),
  createModelRoute: (data: any) =>
    api.post('/v2/admin/model-routes', data).then(r => r.data),
  updateModelRoute: (routeId: string, updates: any) =>
    api.patch(`/v2/admin/model-routes/${routeId}`, updates).then(r => r.data),
  deleteModelRoute: (routeId: string) =>
    api.delete(`/v2/admin/model-routes/${routeId}`).then(r => r.data),
  evaluateModelRoute: (workspaceId: string, intent: string) =>
    api.post('/v2/admin/model-routes/_evaluate', { workspace_id: workspaceId, intent }).then(r => r.data),
  listModelBudgets: (workspaceId: string, period?: string) =>
    api.get('/v2/admin/model-budgets', { params: { workspace_id: workspaceId, period } }).then(r => r.data),
  setModelBudget: (data: any) =>
    api.post('/v2/admin/model-budgets', data).then(r => r.data),
  // api keys
  listApiKeys: (workspaceId: string, includeRevoked = false) =>
    api.get('/v2/admin/api-keys', { params: { workspace_id: workspaceId, include_revoked: includeRevoked } }).then(r => r.data),
  createApiKey: (data: any) =>
    api.post('/v2/admin/api-keys', data).then(r => r.data),
  rotateApiKey: (keyId: string) =>
    api.post(`/v2/admin/api-keys/${keyId}/rotate`).then(r => r.data),
  revokeApiKey: (keyId: string) =>
    api.post(`/v2/admin/api-keys/${keyId}/revoke`).then(r => r.data),

  // 阶段 7 · 安全设置 (me)
  // 2FA
  get2FAStatus: () =>
    api.get('/v2/me/security/2fa').then(r => r.data),
  setup2FA: () =>
    api.post('/v2/me/security/2fa/setup').then(r => r.data),
  verify2FA: (code: string) =>
    api.post('/v2/me/security/2fa/verify', { code }).then(r => r.data),
  disable2FA: () =>
    api.delete('/v2/me/security/2fa').then(r => r.data),
  regenerateBackupCodes: () =>
    api.post('/v2/me/security/2fa/regenerate-backup-codes').then(r => r.data),
  // login sessions
  listLoginSessions: (onlyActive = true) =>
    api.get('/v2/me/security/sessions', { params: { only_active: onlyActive } }).then(r => r.data),
  seedLoginSession: (data: any) =>
    api.post('/v2/me/security/sessions/_seed', data).then(r => r.data),
  revokeLoginSession: (sessionId: string) =>
    api.delete(`/v2/me/security/sessions/${sessionId}`).then(r => r.data),
  revokeOtherSessions: () =>
    api.post('/v2/me/security/sessions/_revoke_others').then(r => r.data),
  // oauth apps
  listOAuthApps: (onlyActive = true) =>
    api.get('/v2/me/security/oauth-apps', { params: { only_active: onlyActive } }).then(r => r.data),
  seedOAuthApp: (data: any) =>
    api.post('/v2/me/security/oauth-apps/_seed', data).then(r => r.data),
  revokeOAuthApp: (appId: string) =>
    api.delete(`/v2/me/security/oauth-apps/${appId}`).then(r => r.data),

  // 节点详情 (阶段 8 配套)
  getNodeDetail: (nodeId: string) =>
    api.get(`/v2/nodes/${nodeId}`).then(r => r.data),
  listNodeComments: (nodeId: string) =>
    api.get(`/v2/nodes/${nodeId}/comments`).then(r => r.data),
  addNodeComment: (nodeId: string, body: string, mentions?: number[], parent_comment_id?: string) =>
    api.post(`/v2/nodes/${nodeId}/comments`, { body, mentions, parent_comment_id }).then(r => r.data),
  resolveNodeComment: (nodeId: string, commentId: string) =>
    api.post(`/v2/nodes/${nodeId}/comments/${commentId}/resolve`).then(r => r.data),
  deleteNodeComment: (nodeId: string, commentId: string) =>
    api.delete(`/v2/nodes/${nodeId}/comments/${commentId}`).then(r => r.data),
  listNodeVersions: (nodeId: string) =>
    api.get(`/v2/nodes/${nodeId}/versions`).then(r => r.data),
  patchNodeStatus: (nodeId: string, updates: { clarify_status?: string; hitl_status?: string }) =>
    api.patch(`/v2/nodes/${nodeId}/status`, updates).then(r => r.data),
  getNodeDeleteImpact: (nodeId: string) =>
    api.get(`/v2/nodes/${nodeId}/_delete_impact`).then(r => r.data),
  deleteNode: (nodeId: string, cascade = false) =>
    api.delete(`/v2/nodes/${nodeId}`, { params: { cascade } }).then(r => r.data),

  // 语义层 + 指标中心 (阶段 8)
  listSemanticTables: (dsId: string, schemaName?: string) =>
    api.get('/v2/semantic/tables', { params: { ds_id: dsId, schema_name: schemaName } }).then(r => r.data),
  upsertSemanticTable: (data: any) =>
    api.post('/v2/semantic/tables', data).then(r => r.data),
  listSemanticColumns: (dsId: string, schemaName: string, tableName: string) =>
    api.get('/v2/semantic/columns', { params: { ds_id: dsId, schema_name: schemaName, table_name: tableName } }).then(r => r.data),
  upsertSemanticColumn: (data: any) =>
    api.post('/v2/semantic/columns', data).then(r => r.data),
  listColumnTags: (columnId: string) =>
    api.get(`/v2/semantic/columns/${columnId}/tags`).then(r => r.data),
  addColumnTag: (columnId: string, data: { tag_name: string; confidence?: number; source?: string }) =>
    api.post(`/v2/semantic/columns/${columnId}/tags`, data).then(r => r.data),
  deleteColumnTag: (columnId: string, tagName: string) =>
    api.delete(`/v2/semantic/columns/${columnId}/tags/${encodeURIComponent(tagName)}`).then(r => r.data),
  listMetrics: (workspaceId: string) =>
    api.get('/v2/semantic/metrics', { params: { workspace_id: workspaceId } }).then(r => r.data),
  createMetric: (data: any) =>
    api.post('/v2/semantic/metrics', data).then(r => r.data),
  updateMetric: (metricId: string, updates: any) =>
    api.patch(`/v2/semantic/metrics/${metricId}`, updates).then(r => r.data),
  deleteMetric: (metricId: string) =>
    api.delete(`/v2/semantic/metrics/${metricId}`).then(r => r.data),
  searchMetrics: (workspaceId: string, q: string, limit = 10) =>
    api.get('/v2/semantic/search-metrics', { params: { workspace_id: workspaceId, q, limit } }).then(r => r.data),
  listMetricSynonyms: (metricId: string) =>
    api.get(`/v2/semantic/metrics/${metricId}/synonyms`).then(r => r.data),
  addMetricSynonym: (metricId: string, data: { synonym_text: string; weight?: number; source?: string }) =>
    api.post(`/v2/semantic/metrics/${metricId}/synonyms`, data).then(r => r.data),
  deleteMetricSynonym: (metricId: string, synonymText: string) =>
    api.delete(`/v2/semantic/metrics/${metricId}/synonyms/${encodeURIComponent(synonymText)}`).then(r => r.data),
  listMetricLineage: (metricId: string) =>
    api.get(`/v2/semantic/metrics/${metricId}/lineage`).then(r => r.data),
  addMetricLineage: (metricId: string, data: any) =>
    api.post(`/v2/semantic/metrics/${metricId}/lineage`, data).then(r => r.data),
  deleteMetricLineage: (metricId: string, toType: string, toId: string) =>
    api.delete(`/v2/semantic/metrics/${metricId}/lineage/${toType}/${encodeURIComponent(toId)}`).then(r => r.data),
}

export default api
