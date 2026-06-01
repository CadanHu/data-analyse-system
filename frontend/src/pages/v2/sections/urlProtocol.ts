// DAT-25 串联第一波 · roadmap §6.2 URL 协议
// 所有跨画板跳转都经过这里 — 集中维护路由 + query 拼装

export const V2_BASE = '/v2-preview'

// ---------- 路由表 (与 V2Preview.tsx 中 GROUPS 的 slug 一一对应) ----------
const ROUTES = {
  canvas: `${V2_BASE}/canvas`,
  nodeDetail: `${V2_BASE}/node/detail`,
  boardEditor: `${V2_BASE}/board-editor`,
  alertDetail: `${V2_BASE}/alert-detail`,
  share: `${V2_BASE}/share`,
  sharePreview: `${V2_BASE}/share`, // 预览暂复用同路由 (token 走 query)
  metrics: `${V2_BASE}/data/metrics`,
} as const

function qs(params: Record<string, string | number | undefined | null>): string {
  const out = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') out.set(k, String(v))
  })
  const s = out.toString()
  return s ? `?${s}` : ''
}

// ---------- URL 构造器 ----------
export const v2Urls = {
  canvas: (p: { session?: string; node?: string; seed_q?: string } = {}) =>
    `${ROUTES.canvas}${qs(p)}`,
  nodeDetail: (id: string) => `${ROUTES.nodeDetail}${qs({ id })}`,
  boardEditor: (board?: string) => `${ROUTES.boardEditor}${qs({ board })}`,
  alertDetail: (event?: string) => `${ROUTES.alertDetail}${qs({ event })}`,
  share: (target_type?: string, target_id?: string) =>
    `${ROUTES.share}${qs({ target_type, target_id })}`,
  sharePreview: (token: string) => `${ROUTES.sharePreview}${qs({ token })}`,
  metrics: (p: { metric?: string; expr_seed?: string } = {}) =>
    `${ROUTES.metrics}${qs(p)}`,
}

// ---------- NotificationCenter 跳转规则 (roadmap §6.3) ----------
// 通知 schema: type ∈ mention/comment/alert/share/system, source_type ∈ node/board/session/alert_event/alert_rule
export type V2Notification = {
  id: string
  type: string
  source_type?: string | null
  source_id?: string | null
  payload_json?: any
}

export function notifJumpUrl(n: V2Notification): string | null {
  const t = (n.type || '').toLowerCase()
  const st = (n.source_type || '').toLowerCase()
  const sid = n.source_id || ''
  if (t === 'alert' || st === 'alert_event' || st === 'alert_rule') {
    return sid ? v2Urls.alertDetail(sid) : null
  }
  if (t === 'mention' || t === 'comment' || st === 'node') {
    return sid ? v2Urls.nodeDetail(sid) : null
  }
  if (t === 'share') {
    // share 通知 payload 可能带 token；source_id 兜底
    const token = n.payload_json?.token || sid
    return token ? v2Urls.sharePreview(token) : null
  }
  return null
}
