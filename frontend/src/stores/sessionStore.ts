import { create } from 'zustand'
import type { Session, Message } from '../types'

interface SessionState {
  sessions: Session[]
  currentSession: Session | null
  messages: Message[]
  allMessages: Message[] // 用于支持分支功能：保存所有分支的消息
  loading: boolean
  
  // Actions
  setSessions: (sessions: Session[]) => void
  setCurrentSession: (session: Session | null) => void
  setMessages: (messages: Message[]) => void
  setAllMessages: (messages: Message[]) => void // 设置所有分支
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
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
  allMessages: [],
  loading: false,
  
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),
  setMessages: (messages) => set({ messages }),
  setAllMessages: (allMessages) => set({ allMessages }),
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message],
    allMessages: [...state.allMessages, message]
  })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map(m => m.id === id ? { ...m, ...updates } : m),
    allMessages: state.allMessages.map(m => m.id === id ? { ...m, ...updates } : m)
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
    // 同时更新 allMessages 中对应的消息（如果存在）
    const newAllMessages = state.allMessages.map(m => {
      if (newMessages.length > 0 && m.id === newMessages[newMessages.length - 1].id) {
        return { ...m, ...updates };
      }
      return m;
    });
    return { messages: newMessages, allMessages: newAllMessages }
  }),
  setLoading: (loading) => set({ loading }),
  clearMessages: () => set({ messages: [], allMessages: [] }),
  removeSession: (sessionId) => set((state) => ({
    sessions: state.sessions.filter(s => s.id !== sessionId)
  })),
}))
