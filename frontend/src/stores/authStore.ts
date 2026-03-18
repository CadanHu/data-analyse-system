import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateOfflineUserId } from '../services/localStore'

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

      setAuth: (user, token) => {
        const prev = get()
        // Migrate offline data to real user ID
        if (prev.offlineMode && prev.localUserId === -1 && user.id !== -1) {
          migrateOfflineUserId(user.id).catch(console.error)
        }
        set({ user, token, isAuthenticated: true, offlineMode: false, localUserId: user.id })
      },
      setToken: (token) => set({ token }),
      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        offlineMode: false,
        localUserId: -1,
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
