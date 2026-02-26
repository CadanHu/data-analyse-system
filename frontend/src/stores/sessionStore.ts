import { create } from 'zustand'
import type { Session, Message } from '../types'

interface SessionState {
  sessions: Session[]
  currentSession: Session | null
  messages: Message[]
  loading: boolean
  
  // Actions
  setSessions: (sessions: Session[]) => void
  setCurrentSession: (session: Session | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateLastMessage: (updates: Partial<Message>) => void
  setLoading: (loading: boolean) => void
  removeSession: (sessionId: string) => void
  updateSession: (sessionId: string, updates: Partial<Session>) => void
  clearMessages: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  loading: false,
  
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
  updateSession: (sessionId, updates) => set((state) => {
    const newSessions = state.sessions.map(s => 
      s.id === sessionId ? { ...s, ...updates } : s
    );
    // 如果更新的是当前选中的会话，同步更新 currentSession
    const currentUpdates = state.currentSession?.id === sessionId 
      ? { currentSession: { ...state.currentSession, ...updates } } 
      : {};
    return { sessions: newSessions, ...currentUpdates };
  }),
  updateLastMessage: (updates) => set((state) => {
    const newMessages = [...state.messages]
    if (newMessages.length > 0) {
      const lastMessage = newMessages[newMessages.length - 1]
      newMessages[newMessages.length - 1] = { ...lastMessage, ...updates }
    }
    return { messages: newMessages }
  }),
  setLoading: (loading) => set({ loading }),
  clearMessages: () => set({ messages: [] }),
  removeSession: (sessionId) => set((state) => ({
    sessions: state.sessions.filter(s => s.id !== sessionId)
  })),
}))
