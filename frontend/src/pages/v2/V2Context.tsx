// DAT-28 串联第二波 · roadmap §6.4 全局 V2Context
// 把各 LiveBar 重复的 "getCurrentWorkspace / getMyProfile" 样板收敛到一处,
// 并集中维护"当前工作区 / 角色 / 未读数",未读数 30s 轮询。
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { v2Api, type V2Workspace, type V2Profile } from '../../api'

const UNREAD_POLL_MS = 30_000

export interface V2CtxValue {
  workspace: V2Workspace | null
  profile: V2Profile | null
  unreadCount: number
  /** 首屏 workspace+profile 是否还在加载 */
  loading: boolean
  /** 重新拉 workspace + profile + 未读数 */
  refresh: () => Promise<void>
  /** 只刷新未读数(标记已读 / 删除通知后调,立即反映到全局 badge) */
  refreshUnread: () => Promise<void>
}

const V2Context = createContext<V2CtxValue | null>(null)

/** 在 V2GlobalProvider 内消费全局状态。不在 Provider 内调用会抛错(便于发现接线遗漏)。 */
export function useV2Ctx(): V2CtxValue {
  const ctx = useContext(V2Context)
  if (!ctx) throw new Error('useV2Ctx 必须在 <V2GlobalProvider> 内使用')
  return ctx
}

export function V2GlobalProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<V2Workspace | null>(null)
  const [profile, setProfile] = useState<V2Profile | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  const refreshUnread = useCallback(async () => {
    try {
      const r = await v2Api.countUnreadNotifications()
      if (mounted.current) setUnreadCount(r?.unread || 0)
    } catch { /* 未登录 / 后端不可用时静默 */ }
  }, [])

  const refresh = useCallback(async () => {
    const [ws, prof] = await Promise.all([
      v2Api.getCurrentWorkspace().catch(() => null),
      v2Api.getMyProfile().catch(() => null),
    ])
    if (!mounted.current) return
    setWorkspace(ws)
    setProfile(prof)
    await refreshUnread()
  }, [refreshUnread])

  // 首屏加载 workspace + profile
  useEffect(() => {
    mounted.current = true
    refresh().finally(() => { if (mounted.current) setLoading(false) })
    return () => { mounted.current = false }
  }, [refresh])

  // 未读数 30s 轮询
  useEffect(() => {
    const t = setInterval(refreshUnread, UNREAD_POLL_MS)
    return () => clearInterval(t)
  }, [refreshUnread])

  return (
    <V2Context.Provider value={{ workspace, profile, unreadCount, loading, refresh, refreshUnread }}>
      {children}
    </V2Context.Provider>
  )
}
