import { create } from 'zustand'
import type { Message, ChartOption, ChatState, SQLResult } from '../types/message'

interface SessionState {
  chartOption: ChartOption | null
  chartType: string
  sqlResult: SQLResult | null
  sql: string
  isRightPanelVisible: boolean
}

export const useChatStore = create<ChatState & {
  sessionStates: Record<string, SessionState>
  currentSessionId: string | null
  setCurrentSessionId: (sessionId: string | null) => void
  isRightPanelVisible: boolean
  setRightPanelVisible: (visible: boolean) => void
  isThinkingMode: boolean
  setThinkingMode: (enabled: boolean) => void
  activeTab: 'chat' | 'sessions' | 'charts'
  setActiveTab: (tab: 'chat' | 'sessions' | 'charts') => void
  isFullScreen: boolean
  setFullScreen: (enabled: boolean) => void
}>((set, get) => ({
  messages: [],
  isLoading: false,
  currentChartOption: null,
  currentChartType: 'bar',
  currentSqlResult: null,
  thinkingContent: '',
  currentSql: '',
  sessionStates: {},
  currentSessionId: null,
  isRightPanelVisible: false,
  isThinkingMode: false,
  activeTab: 'sessions',
  isFullScreen: false,

  setFullScreen: (enabled: boolean) => set({ isFullScreen: enabled }),

  // 关键修复：从历史消息中同步分析结果到右侧面板
  setCurrentAnalysis: (sql: string, result: SQLResult | null, chartType?: string, chartOption?: ChartOption | null) => {
    set({
      currentSql: sql,
      currentSqlResult: result,
      currentChartType: chartType || 'table',
      currentChartOption: chartOption || null,
      isRightPanelVisible: true
    });
  },

  setThinkingMode: (enabled: boolean) =>
    set({ isThinkingMode: enabled }),

  setRightPanelVisible: (visible: boolean) =>
    set({ isRightPanelVisible: visible }),

  setActiveTab: (tab: 'chat' | 'sessions' | 'charts') =>
    set({ activeTab: tab }),

  setCurrentSessionId: (sessionId: string | null) => {
    const current = get()
    if (current.currentSessionId) {
      set({
        sessionStates: {
          ...current.sessionStates,
          [current.currentSessionId]: {
            chartOption: current.currentChartOption,
            chartType: current.currentChartType,
            sqlResult: current.currentSqlResult,
            sql: current.currentSql,
            isRightPanelVisible: current.isRightPanelVisible
          }
        }
      })
    }

    if (sessionId && get().sessionStates[sessionId]) {
      const saved = get().sessionStates[sessionId]
      set({
        currentChartOption: saved.chartOption,
        currentChartType: saved.chartType,
        currentSqlResult: saved.sqlResult,
        currentSql: saved.sql,
        isRightPanelVisible: saved.isRightPanelVisible,
        currentSessionId: sessionId,
        isThinkingMode: get().isThinkingMode
      })
    } else {
      set({
        currentChartOption: null,
        currentChartType: 'bar',
        currentSqlResult: null,
        currentSql: '',
        isRightPanelVisible: false,
        currentSessionId: sessionId,
        isThinkingMode: get().isThinkingMode
      })
    }
  },

  addMessage: (message: Message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),

  setIsLoading: (loading: boolean) =>
    set({ isLoading: loading }),

  setChartOption: (option: ChartOption | null, type: string) =>
    set({ currentChartOption: option, currentChartType: type }),

  setSqlResult: (result: SQLResult | null) =>
    set({ currentSqlResult: result }),

  setThinkingContent: (content: string) =>
    set({ thinkingContent: content }),

  setCurrentSql: (sql: string) =>
    set({ currentSql: sql }),

  clearMessages: () =>
    set({
      messages: [],
      currentChartOption: null,
      currentChartType: 'bar',
      currentSqlResult: null,
      currentSql: '',
      thinkingContent: '',
      isRightPanelVisible: false
    })
}))
