/**
 * useSyncManager.ts — 全局同步生命周期管理
 * - 每 60 秒 ping
 * - 页面可见时触发同步
 * - 连接恢复时立即全量同步
 * - 延迟防抖推送（写入后 300ms）
 */

import { useEffect, useRef } from 'react'
import { useSyncStore } from '../stores/syncStore'
import { useAuthStore } from '../stores/authStore'
import { ping, fullSync } from '../services/syncService'
import { initLocalStore } from '../services/localStore'

const PING_INTERVAL_MS = 60_000
const DEBOUNCE_PUSH_MS = 300

export function useSyncManager() {
  const { setConnectionStatus, connectionStatus } = useSyncStore()
  const { isAuthenticated } = useAuthStore()
  const prevOnlineRef = useRef(false)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize local SQLite on mount
  useEffect(() => {
    initLocalStore().then(() => {
      console.log('[SyncManager] LocalStore ready')
    })
  }, [])

  // Ping loop
  useEffect(() => {
    const doPing = async () => {
      setConnectionStatus('checking')
      const online = await ping()
      setConnectionStatus(online ? 'online' : 'offline')
    }

    // Initial ping
    doPing()

    pingTimerRef.current = setInterval(doPing, PING_INTERVAL_MS)
    return () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
    }
  }, [setConnectionStatus])

  // When coming back online → full sync
  useEffect(() => {
    if (connectionStatus === 'online' && !prevOnlineRef.current && isAuthenticated) {
      fullSync()
    }
    prevOnlineRef.current = connectionStatus === 'online'
  }, [connectionStatus, isAuthenticated])

  // Visibility change → sync
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        fullSync()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isAuthenticated])

  // Export debounced push trigger for use after local writes
  const schedulePush = () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      if (isAuthenticated) fullSync()
    }, DEBOUNCE_PUSH_MS)
  }

  return { schedulePush }
}
