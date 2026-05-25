import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import SessionList from './components/SessionList'
import ChatArea from './components/ChatArea'
import RightPanel from './components/RightPanel'
import ResizableSplit from './components/ResizableSplit'
import ErrorBoundary from './components/ErrorBoundary'
import Welcome from './components/Welcome'
import Login from './pages/Login'
import Register from './pages/Register'
import LocalRegister from './pages/LocalRegister'
import ProtectedRoute from './components/ProtectedRoute'
import About from './components/About'
import LearnMore from './components/LearnMore'
import Tutorial from './components/Tutorial'
import Features from './components/Features'
import Changelog from './components/Changelog'
import V2Preview from './pages/v2/V2Preview'
import UserSync from './components/UserSync'
import LogViewer from './components/LogViewer'
import MobileDebugPanel from './mobile/DebugPanel'
import { useSessionStore } from './stores/sessionStore'
import { useChatStore } from './stores/chatStore'
import { useAuthStore } from './stores/authStore'
import { useSyncStore } from './stores/syncStore'
import { SQLResult } from './types/message'
import { sessionApi } from '@/api'
import { useTranslation } from './hooks/useTranslation'
import { useSyncManager } from './hooks/useSyncManager'
import { localGetMessages, localGetAllMessages } from './services/localStore'

export default function App() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [showLogs, setShowLogs] = useState(false)
  const { isAuthenticated, offlineMode } = useAuthStore()
  const { connectionStatus } = useSyncStore()
  const { sessions, setCurrentSession, setLoading, setMessages, setAllMessages, clearMessages } = useSessionStore()
  const { setChartOption, setSqlResult, setCurrentSql, setCurrentSessionId, isRightPanelVisible, activeTab, setActiveTab, isFullScreen, isMobile, setIsMobile, orientation, setOrientation, landscapeUiVisible, setLandscapeUiVisible, streamingSessionId, setIsLoading } = useChatStore()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  // On native: treat 'checking' as offline to avoid remote API calls during ping cycle
  const isNativePlatform = Capacitor.isNativePlatform()
  const isOffline = offlineMode || (isNativePlatform ? connectionStatus !== 'online' : connectionStatus === 'offline')

  // Initialize sync manager
  useSyncManager()

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      document.documentElement.style.setProperty('--safe-top', 'env(safe-area-inset-top)')
      document.documentElement.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom)')
    }
  }, [])

  useEffect(() => {
    const checkLayout = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const isPortrait = height > width
      const currentOrientation = isPortrait ? 'portrait' : 'landscape'
      setOrientation(currentOrientation)

      const isMobileSize = width < 1024 || (height < 600 && width < 1024)
      setIsMobile(isMobileSize)
    }

    checkLayout()
    window.addEventListener('resize', checkLayout)
    window.addEventListener('orientationchange', checkLayout)
    
    return () => {
      window.removeEventListener('resize', checkLayout)
      window.removeEventListener('orientationchange', checkLayout)
    }
  }, [])

  // 横屏时默认隐藏 UI，竖屏时恢复显示
  useEffect(() => {
    if (orientation === 'landscape' && isMobile) {
      setLandscapeUiVisible(false)
    } else {
      setLandscapeUiVisible(true)
    }
  }, [orientation, isMobile])

  const loadSessions = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) setLoading(true)
      console.log('🔄 [App] Manually triggering session load...')
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      if (isInitialLoad) setLoading(false)
    }
  }

  // Restore chart state from the last assistant message that has chart data.
  // Called after loading messages so each historical session shows its own chart.
  // Uses setChartOption/setSqlResult (not setCurrentAnalysis) to avoid auto-opening the panel.
  const restoreChartFromMessages = (msgs: any[]) => {
    const lastChartMsg = [...msgs].reverse().find(m => {
      if (m.role !== 'assistant' || !m.chart_cfg) return false
      // Skip scientist-mode messages — they don't use the standard chart panel
      const d = typeof m.data === 'string' ? (() => { try { return JSON.parse(m.data) } catch { return {} } })() : (m.data ?? {})
      if (d?.is_data_science) return false
      return !!(m.data || m.sql_result)
    })
    if (lastChartMsg) {
      let chartOption: any = null
      try {
        chartOption = typeof lastChartMsg.chart_cfg === 'string'
          ? JSON.parse(lastChartMsg.chart_cfg)
          : lastChartMsg.chart_cfg
      } catch { /* ignore */ }

      let sqlResult = lastChartMsg.data
      if (!sqlResult && lastChartMsg.sql_result) {
        try {
          sqlResult = typeof lastChartMsg.sql_result === 'string'
            ? JSON.parse(lastChartMsg.sql_result)
            : lastChartMsg.sql_result
        } catch { /* ignore */ }
      }

      const chartType = chartOption?.series?.[0]?.type || 'table'
      if (chartOption) setChartOption(chartOption, chartType)
      if (sqlResult) setSqlResult(sqlResult)
      if (lastChartMsg.sql) setCurrentSql(lastChartMsg.sql)
    } else {
      // No chart in this session — clear so previous session's chart doesn't bleed through
      setChartOption(null, 'bar')
      setSqlResult(null)
      setCurrentSql('')
    }
  }

  const loadMessages = async (sessionId: string) => {
    if (!sessionId) return
    console.log('[App] Loading Messages for:', sessionId)

    setIsLoading(true)
    try {
      // Native always uses local AI → messages are in SQLite, not on server
      if (isOffline || isNativePlatform) {
        const localMsgs = await localGetMessages(sessionId)
        const localAllMsgs = await localGetAllMessages(sessionId)
        const processMsg = (msg: any) => {
          if (typeof msg.data === 'string' && msg.data) {
            try { return { ...msg, data: JSON.parse(msg.data) } } catch { return msg }
          }
          return msg
        }
        const processed = localMsgs.map(processMsg)
        setMessages(processed)
        setAllMessages(localAllMsgs.map(processMsg))
        restoreChartFromMessages(processed)
        return
      }

      // [perf 2] 旧：串行——先 await 主分支，再链式发起 allMessages 请求；allMessages 延迟 = T1 + T2
      // const data = await sessionApi.getMessages(sessionId)
      //
      // sessionApi.getMessages(sessionId, true).then(allData => {
      //   if (Array.isArray(allData)) {
      //     const processedAll = allData.map(msg => {
      //       if (typeof msg.data === 'string' && msg.data) {
      //         try { return { ...msg, data: JSON.parse(msg.data) } } catch (e) {}
      //       }
      //       return msg
      //     })
      //     setAllMessages(processedAll)
      //   }
      // })

      // [perf 2] 新：两个请求同时发起，allMessages 不阻塞主分支渲染
      const dataPromise = sessionApi.getMessages(sessionId)
      const allDataPromise = sessionApi.getMessages(sessionId, true)

      allDataPromise.then(allData => {
        if (Array.isArray(allData)) {
          const processedAll = allData.map(msg => {
            if (typeof msg.data === 'string' && msg.data) {
              try { return { ...msg, data: JSON.parse(msg.data) } } catch (e) {}
            }
            return msg
          })
          setAllMessages(processedAll)
        }
      }).catch(e => console.error('[App] allMessages 加载失败:', e))

      const data = await dataPromise

      if (!Array.isArray(data)) {
        console.error('[App] Messages data is not an array:', data)
        setMessages([])
        return
      }
      const processedData = data.map(msg => {
        if (typeof msg.data === 'string' && msg.data) {
          try {
            return { ...msg, data: JSON.parse(msg.data) }
          } catch (e) {
            console.error('Failed to parse message data:', e)
          }
        }
        return msg
      })

      setMessages(processedData)
      restoreChartFromMessages(processedData)

      if (processedData.length > 0) {
        const lastMessage = processedData[processedData.length - 1]
        if (lastMessage.role === 'assistant') {
            if (lastMessage.chart_cfg && lastMessage.data) {
              try {
                const chartOption = JSON.parse(lastMessage.chart_cfg)
                const rawData = lastMessage.data
                // Only set sqlResult if data has the expected SQLResult structure (rows + columns arrays)
                if (rawData && Array.isArray(rawData.rows) && Array.isArray(rawData.columns)) {
                  const sqlResult = rawData as unknown as SQLResult
                  setChartOption(chartOption, 'bar')
                  setSqlResult(sqlResult)
                  if (lastMessage.sql) setCurrentSql(lastMessage.sql)
                }
              } catch (e) {
                console.error('Failed to parse chart config:', e)
              }
            }
          }
        } else {
          setChartOption(null, 'bar')
          setSqlResult(null)
          setCurrentSql('')
        }
    } catch (error) {
      console.error('Failed to load history messages:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectSession = (sessionId: string, session?: any) => {
    console.log('[App] Selecting Session:', sessionId)
    setSelectedSessionId(sessionId)
    const targetSession = session || sessions.find(s => s.id === sessionId)
    if (targetSession) {
      setCurrentSession(targetSession)
      setCurrentSessionId(sessionId)
      // 如果正在切回的会话就是当前流式生成中的会话，不清空消息也不重新加载
      // 避免 loadMessages 与 localSaveMessage(assistant) 产生竞态
      if (streamingSessionId === sessionId) return
      clearMessages()
      // [perf 2] 旧：setTimeout 50ms 延迟（让 clearMessages 先渲染再发请求），直接导致 50ms 空白
      // setTimeout(() => {
      //   loadMessages(sessionId)
      // }, 50)
      // [perf 2] 新：clearMessages 已同步完成，直接发请求，省掉 50ms
      loadMessages(sessionId)
    }
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/app" replace /> : <Login />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/app" replace /> : <Register />} />
        <Route path="/local-register" element={isAuthenticated ? <Navigate to="/app" replace /> : <LocalRegister />} />
        <Route path="/about" element={<About />} />
        <Route path="/learn-more" element={<LearnMore />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/features" element={<Features />} />
        <Route path="/changelog" element={<Changelog />} />
        {import.meta.env.VITE_ENABLE_V2_PREVIEW === 'true' && (
          <Route path="/v2-preview" element={<V2Preview />} />
        )}

        <Route element={<ProtectedRoute />}>
        <Route path="/app" element={
          <div 
            className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#FAFAFA]"
            data-mobile={isMobile}
            data-orientation={orientation}
          >
          <UserSync />
          {/* [perf 5A] 旧：三个 animate-pulse 装饰光斑（opacity 60fps 动画）位于下面 backdrop-blur-2xl 卡片之后。
                      这意味着卡片的 backdrop-filter 被迫每一帧重新 blur 一次，吃掉 GPU 预算，让滚动永远慢半拍。
                      新：去掉 animate-pulse，光斑变静态——blur 成一次性成本；视觉上颜色渐变仍在，只是不再呼吸。
                      回退方式：把三行 className 的 "animate-pulse" 加回即可。 */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-32 -left-32 w-[50rem] h-[50rem] bg-gradient-to-br from-[#BFFFD9]/30 via-[#E0FFFF]/20 to-transparent rounded-full blur-3xl" />
              <div className="absolute -bottom-32 -right-32 w-[50rem] h-[50rem] bg-gradient-to-br from-[#E6E6FA]/30 via-[#FFFACD]/20 to-transparent rounded-full blur-3xl" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-gradient-to-br from-[#E0FFFF]/20 via-[#BFFFD9]/15 to-transparent rounded-full blur-3xl" />
            </div>

            <div className={`relative z-10 h-full ${isMobile ? 'py-4 data-[mobile=true]:data-[orientation=landscape]:p-0' : 'p-0'}`}>
              {/* [perf 5B] 旧：backdrop-blur-2xl = backdrop-filter: blur(40px)，卷积半径很大，对 GPU 极重。
                          与上面 animate-pulse 叠加后每帧都要重做一次大半径模糊。
                          新：降级到 backdrop-blur-sm（4px），毛玻璃质感仍在但成本降一个数量级。
                          回退方式：把 "backdrop-blur-sm" 改回 "backdrop-blur-2xl"。 */}
              {/* <div className={`h-full overflow-hidden backdrop-blur-2xl bg-white/70 ${isMobile ? 'rounded-3xl data-[mobile=true]:data-[orientation=landscape]:rounded-none border border-white/60 data-[mobile=true]:data-[orientation=landscape]:border-none shadow-[0_8px_32px_rgba(0,0,0,0.08)]' : ''}`}> */}
              <div className={`h-full overflow-hidden backdrop-blur-sm bg-white/70 ${isMobile ? 'rounded-3xl data-[mobile=true]:data-[orientation=landscape]:rounded-none border border-white/60 data-[mobile=true]:data-[orientation=landscape]:border-none shadow-[0_8px_32px_rgba(0,0,0,0.08)]' : ''}`}>
                {isFullScreen && isRightPanelVisible && (
                  <div className="absolute inset-0 z-[200] bg-white">
                    <RightPanel />
                  </div>
                )}
                
                {isMobile ? (
                  <div
                    className="h-full flex flex-col relative"
                    onClick={orientation === 'landscape' ? () => setLandscapeUiVisible(!landscapeUiVisible) : undefined}
                  >
                    <button 
                      onClick={() => navigate('/')}
                      className="absolute left-2 z-[100] p-1 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-gray-700 transition-all shadow-sm data-[mobile=true]:data-[orientation=landscape]:top-1"
                      style={{ top: 'calc(var(--safe-top) + 0.4rem)' }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    <div
                      className={`flex-none border-b border-white/30 bg-white/40 backdrop-blur-sm data-[mobile=true]:data-[orientation=landscape]:bg-white/60 transition-all duration-200 ${orientation === 'landscape' && !landscapeUiVisible ? 'hidden' : ''}`}
                      style={{ paddingTop: 'var(--safe-top)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex pl-10 data-[mobile=true]:data-[orientation=landscape]:pl-12">
                        <button
                          onClick={() => setActiveTab('sessions')}
                          className={`flex-1 px-4 py-3 data-[mobile=true]:data-[orientation=landscape]:py-1 text-sm data-[mobile=true]:data-[orientation=landscape]:text-[11px] font-medium transition-all ${
                            activeTab === 'sessions'
                              ? 'text-[#BFFFD9] border-b-2 border-[#BFFFD9]'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {t('nav.sessions')}
                        </button>
                        <button
                          onClick={() => setActiveTab('chat')}
                          className={`flex-1 px-4 py-3 data-[mobile=true]:data-[orientation=landscape]:py-1 text-sm data-[mobile=true]:data-[orientation=landscape]:text-[11px] font-medium transition-all ${
                            activeTab === 'chat'
                              ? 'text-[#BFFFD9] border-b-2 border-[#BFFFD9]'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {t('nav.chat')}
                        </button>
                        <button
                          onClick={() => setActiveTab('charts')}
                          className={`flex-1 px-4 py-3 data-[mobile=true]:data-[orientation=landscape]:py-1 text-sm data-[mobile=true]:data-[orientation=landscape]:text-[11px] font-medium transition-all ${
                            activeTab === 'charts'
                              ? 'text-[#BFFFD9] border-b-2 border-[#BFFFD9]'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {t('nav.charts')}
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {activeTab === 'sessions' && (
                        <div className="h-full bg-gradient-to-br from-[#E6E6FA]/40 to-[#BFFFD9]/30 backdrop-blur-md">
                          <SessionList
                            selectedSessionId={selectedSessionId}
                            onSelectSession={(id, session) => {
                              setActiveTab('chat')
                              setSelectedSessionId(id)
                              const targetSession = session || sessions.find(s => s.id === id)
                              if (targetSession) {
                                setCurrentSession(targetSession)
                                // 如果正在切回的会话就是当前流式生成中的会话，不清空消息也不重新加载
                                if (streamingSessionId === id) return
                                clearMessages()
                                loadMessages(id)
                              }
                            }}
                            onSessionsUpdated={() => loadSessions(false)}
                            showLogs={showLogs}
                            onToggleLogs={() => setShowLogs(!showLogs)}
                          />
                        </div>
                      )}
                      {activeTab === 'chat' && (
                        <div className="h-full bg-gradient-to-br from-[#FFFACD]/20 to-[#E0FFFF]/20 backdrop-blur-md">
                          <ChatArea
                            selectedSessionId={selectedSessionId}
                            onMessageSent={() => loadSessions()}
                          />
                        </div>
                      )}
                      {activeTab === 'charts' && (
                        <div className="h-full bg-gradient-to-br from-[#BFFFD9]/30 to-[#E6E6FA]/30 backdrop-blur-md">
                          <RightPanel />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <ResizableSplit
                    defaultLeftWidth={260}
                    minLeftWidth={200}
                    left={
                      <div className="h-full bg-gradient-to-br from-[#E6E6FA]/40 to-[#BFFFD9]/30 backdrop-blur-md border-r border-white/40">
                        <SessionList
                          selectedSessionId={selectedSessionId}
                          onSelectSession={handleSelectSession}
                          onSessionsUpdated={() => loadSessions(false)}
                          showLogs={showLogs}
                          onToggleLogs={() => setShowLogs(!showLogs)}
                        />
                      </div>
                    }
                    center={
                      <div className="h-full bg-gradient-to-br from-[#FFFACD]/20 to-[#E0FFFF]/20 backdrop-blur-md">
                        <ChatArea
                          selectedSessionId={selectedSessionId}
                          onMessageSent={() => loadSessions()}
                        />
                      </div>
                    }
                    right={isRightPanelVisible ? (
                      <div className="h-full bg-gradient-to-br from-[#BFFFD9]/30 to-[#E6E6FA]/30 backdrop-blur-md border-l border-white/40">
                        <RightPanel />
                      </div>
                    ) : undefined}
                  />
                )}
              </div>
            </div>
          </div>
        } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
      {showLogs && (
        <LogViewer onClose={() => setShowLogs(false)} />
      )}

      <MobileDebugPanel />
    </ErrorBoundary>
  )
}
