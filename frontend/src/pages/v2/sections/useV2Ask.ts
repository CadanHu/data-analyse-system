/**
 * v2 SSE 提问 hook — 独立于旧 useSSE。
 * - 调 POST /api/v2/sessions/{id}/ask，不写旧 sessionStore
 * - 把 user / assistant 节点的 message_id / node_id 反馈给调用方，方便它去重新 list canvas-nodes
 */
import { useCallback, useRef, useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'

export type V2AskEvent =
  | { event: 'user_message_saved'; data: { message_id: string; node_id: string } }
  | { event: 'done'; data: { message_id: string; node_id: string; user_message_id: string; user_node_id: string } }
  | { event: 'thinking'; data: { content: string } }
  | { event: 'summary'; data: { content: string } }
  | { event: 'sql_generated'; data: { sql: string } }
  | { event: 'chart_ready'; data: { option: any } }
  | { event: 'error'; data: { message: string } }
  | { event: string; data: any }

interface AskOptions {
  parentNodeId?: string | null
  noDatabase?: boolean
  enableThinking?: boolean
  language?: string
  onEvent?: (e: V2AskEvent) => void
  onUserSaved?: (ids: { message_id: string; node_id: string }) => void
  onDone?: (ids: { message_id: string; node_id: string; user_message_id: string; user_node_id: string }) => void
  onError?: (msg: string) => void
}

export function useV2Ask() {
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const token = useAuthStore(s => s.token)

  const ask = useCallback(async (sessionId: string, question: string, opts: AskOptions = {}) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setIsLoading(true)

    try {
      const res = await fetch(`/api/v2/sessions/${sessionId}/ask`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question,
          parent_node_id: opts.parentNodeId ?? null,
          no_database: opts.noDatabase ?? false,
          enable_thinking: opts.enableThinking ?? false,
          language: opts.language ?? 'zh-CN',
        }),
      })

      if (!res.ok || !res.body) {
        const msg = `HTTP ${res.status} ${res.statusText}`
        opts.onError?.(msg)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // SSE 按 \n\n 分块
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 2)
          if (!raw.startsWith('data:')) continue
          const json = raw.slice(5).trim()
          if (!json) continue
          try {
            const ev = JSON.parse(json) as V2AskEvent
            opts.onEvent?.(ev)
            if (ev.event === 'user_message_saved') opts.onUserSaved?.(ev.data as any)
            else if (ev.event === 'done') opts.onDone?.(ev.data as any)
            else if (ev.event === 'error') opts.onError?.((ev.data as any).message || 'unknown')
          } catch {
            // 跳过解析失败的行
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      opts.onError?.(e?.message || String(e))
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [token])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsLoading(false)
  }, [])

  return { ask, cancel, isLoading }
}
