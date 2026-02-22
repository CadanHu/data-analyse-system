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
