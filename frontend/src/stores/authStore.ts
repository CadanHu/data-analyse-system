import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateOfflineUserId } from '../services/localStore'
import { isValidLocalToken } from '../services/localAuthService'

/** 本地解码 JWT，检查是否过期，不联网。
 *  本地 token（第三段为 "local"）额外验证设备 nonce，防止伪造。
 *  服务端 token 仅检查 exp（签名由服务端负责）。 */
export function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    if (parts[2] === 'local') {
      // Local offline token — validate device nonce
      return isValidLocalToken(token)
    }
    // Server-issued token — validate expiry only (server validates signature)
    const payload = JSON.parse(atob(parts[1]))
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

interface User {
  id: number
  username: string
  email: string
  avatar_url?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  offlineMode: boolean
  localUserId: number
  /** true once offline→online user ID migration has completed (or was not needed) */
  migrationReady: boolean

  // Actions
  setAuth: (user: User, token: string) => void
  setToken: (token: string) => void
  logout: () => void
  initOffline: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      offlineMode: false,
      localUserId: -1,
      migrationReady: true,

      setAuth: (user, token) => {
        const prev = get()
        const needsMigration = prev.offlineMode && user.id > 0
        if (needsMigration) {
          set({ user, token, isAuthenticated: true, offlineMode: false, localUserId: user.id, migrationReady: false })
          migrateOfflineUserId(user.id)
            .catch(console.error)
            .finally(() => set({ migrationReady: true }))
        } else {
          set({ user, token, isAuthenticated: true, offlineMode: false, localUserId: user.id, migrationReady: true })
        }
      },
      setToken: (token) => set({ token }),
      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        offlineMode: false,
        localUserId: -1,
        migrationReady: true,
      }),
      initOffline: () => {
        set({
          user: { id: -1, username: 'Offline', email: '' },
          token: null,
          isAuthenticated: true,
          offlineMode: true,
          localUserId: -1,
        })
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)
