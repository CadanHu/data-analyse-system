/**
 * syncStore.ts — 同步状态 Zustand Store
 */
import { create } from 'zustand'

export type ConnectionStatus = 'offline' | 'online' | 'checking'

interface SyncState {
  connectionStatus: ConnectionStatus
  lastSyncAt: string | null
  isSyncing: boolean
  syncError: string | null

  setConnectionStatus: (status: ConnectionStatus) => void
  setLastSyncAt: (ts: string) => void
  setSyncing: (v: boolean) => void
  setSyncError: (err: string | null) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  connectionStatus: 'checking',
  lastSyncAt: null,
  isSyncing: false,
  syncError: null,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
  setSyncing: (v) => set({ isSyncing: v }),
  setSyncError: (err) => set({ syncError: err }),
}))
