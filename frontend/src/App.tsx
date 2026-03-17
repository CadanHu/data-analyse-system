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
import ProtectedRoute from './components/ProtectedRoute'
import About from './components/About'
import LearnMore from './components/LearnMore'
import Tutorial from './components/Tutorial'
import Features from './components/Features'
import Changelog from './components/Changelog'
import UserSync from './components/UserSync'
import LogViewer from './components/LogViewer'
import MobileDebugPanel from './mobile/DebugPanel'
import { Terminal } from 'lucide-react'
import { useSessionStore } from './stores/sessionStore'
import { useChatStore } from './stores/chatStore'
import { useAuthStore } from './stores/authStore'
import { SQLResult } from './types/message'
import { sessionApi } from '@/api'
import { useTranslation } from './hooks/useTranslation'

export default function App() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [showLogs, setShowLogs] = useState(false)
  const { isAuthenticated, user, setAuth } = useAuthStore()
  const { sessions, currentSession, setSessions, setCurrentSession, setLoading, setMessages, setAllMessages, clearMessages } = useSessionStore()
  const { setChartOption, setSqlResult, setCurrentSql, setCurrentSessionId, isRightPanelVisible, activeTab, setActiveTab, isFullScreen, isMobile, setIsMobile, orientation, setOrientation } = useChatStore()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

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

  const loadMessages = async (sessionId: string) => {
    if (!sessionId) return
    console.log('[App] Loading Messages for:', sessionId)
    
    try {
      const data = await sessionApi.getMessages(sessionId)
      
      sessionApi.getMessages(sessionId, true).then(allData => {
        if (Array.isArray(allData)) {
          const processedAll = allData.map(msg => {
            if (typeof msg.data === 'string' && msg.data) {
              try { return { ...msg, data: JSON.parse(msg.data) } } catch (e) {}
            }
            return msg
          })
          setAllMessages(processedAll)
        }
      })

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
    }
  }

  const handleSelectSession = (sessionId: string, session?: any) => {
    console.log('[App] Selecting Session:', sessionId)
    setSelectedSessionId(sessionId)
    const targetSession = session || sessions.find(s => s.id === sessionId)
    if (targetSession) {
      clearMessages()
      setCurrentSession(targetSession)
      setCurrentSessionId(sessionId)
      setTimeout(() => {
        loadMessages(sessionId)
      }, 50)
    }
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/app" replace /> : <Login />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/app" replace /> : <Register />} />
        <Route path="/about" element={<About />} />
        <Route path="/learn-more" element={<LearnMore />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/features" element={<Features />} />
        <Route path="/changelog" element={<Changelog />} />
        
        <Route element={<ProtectedRoute />}>
        <Route path="/app" element={
          <div 
            className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#FAFAFA]"
            data-mobile={isMobile}
            data-orientation={orientation}
          >
          <UserSync />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-32 -left-32 w-[50rem] h-[50rem] bg-gradient-to-br from-[#BFFFD9]/30 via-[#E0FFFF]/20 to-transparent rounded-full blur-3xl animate-pulse" />
              <div className="absolute -bottom-32 -right-32 w-[50rem] h-[50rem] bg-gradient-to-br from-[#E6E6FA]/30 via-[#FFFACD]/20 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-gradient-to-br from-[#E0FFFF]/20 via-[#BFFFD9]/15 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />
            </div>

            <div className={`relative z-10 h-full ${isMobile ? 'py-4 data-[mobile=true]:data-[orientation=landscape]:p-0' : 'p-0'}`}>
              <div className={`h-full overflow-hidden backdrop-blur-2xl bg-white/70 ${isMobile ? 'rounded-3xl data-[mobile=true]:data-[orientation=landscape]:rounded-none border border-white/60 data-[mobile=true]:data-[orientation=landscape]:border-none shadow-[0_8px_32px_rgba(0,0,0,0.08)]' : ''}`}>
                {isFullScreen && isRightPanelVisible && (
                  <div className="absolute inset-0 z-[200] bg-white">
                    <RightPanel />
                  </div>
                )}
                
                {isMobile ? (
                  <div className="h-full flex flex-col relative">
                    <button 
                      onClick={() => navigate('/')}
                      className="absolute left-2 z-[100] p-1 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-gray-700 transition-all shadow-sm data-[mobile=true]:data-[orientation=landscape]:top-1"
                      style={{ top: 'calc(var(--safe-top) + 0.4rem)' }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    <div className="flex-none border-b border-white/30 bg-white/40 backdrop-blur-sm data-[mobile=true]:data-[orientation=landscape]:bg-white/60" style={{ paddingTop: 'var(--safe-top)' }}>
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
                                clearMessages()
                                setCurrentSession(targetSession)
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
                    defaultLeftWidth={180}
                    minLeftWidth={150}
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
