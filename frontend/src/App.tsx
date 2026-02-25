import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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
import { useSessionStore } from './stores/sessionStore'
import { useChatStore } from './stores/chatStore'
import { useAuthStore } from './stores/authStore'
import { SQLResult } from './types/message'
import { sessionApi } from '@/api'

export default function App() {
  const { isAuthenticated } = useAuthStore()
  const { sessions, currentSession, setSessions, setCurrentSession, setLoading, setMessages, clearMessages } = useSessionStore()
  const { setChartOption, setSqlResult, setCurrentSql, setCurrentSessionId, isRightPanelVisible, activeTab, setActiveTab } = useChatStore()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      loadSessions(true)
    }
    
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const loadSessions = async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true)
    sessionApi.getSessions()
      .then(data => {
        setSessions(data)
        // 只有在初始加载且没有当前会话时，才默认选中第一个
        if (isInitialLoad && data.length > 0 && !currentSession) {
          setSelectedSessionId(data[0].id)
          setCurrentSession(data[0])
          setCurrentSessionId(data[0].id)
          loadMessages(data[0].id)
        }
      })
      .catch(error => console.error('加载会话列表失败:', error))
      .finally(() => {
        if (isInitialLoad) setLoading(false)
      })
  }

  const loadMessages = async (sessionId: string) => {
    try {
      const data = await sessionApi.getMessages(sessionId)
      const processedData = data.map(msg => {
        const processedMsg = { ...msg }
        if (typeof processedMsg.data === 'string' && processedMsg.data) {
          try {
            processedMsg.data = JSON.parse(processedMsg.data)
          } catch (e) {
            console.error('解析消息 data 失败:', e)
          }
        }
        return processedMsg
      })
      setMessages(processedData)
      
      if (processedData.length > 0) {
        const lastMessage = processedData[processedData.length - 1]
        if (lastMessage.role === 'assistant') {
            if (lastMessage.chart_cfg && lastMessage.data) {
              try {
                const chartOption = JSON.parse(lastMessage.chart_cfg)
                const sqlResult = lastMessage.data as unknown as SQLResult
                setChartOption(chartOption, 'bar')
                setSqlResult(sqlResult)
                if (lastMessage.sql) setCurrentSql(lastMessage.sql)
              } catch (e) {
                console.error('解析图表配置失败:', e)
              }
            }
          }
        } else {
          setChartOption(null, 'bar')
          setSqlResult(null)
          setCurrentSql('')
        }
    } catch (error) {
      console.error('加载历史消息失败:', error)
    }
  }

  const handleSelectSession = (sessionId: string, session?: any) => {
    setSelectedSessionId(sessionId)
    const targetSession = session || sessions.find(s => s.id === sessionId)
    if (targetSession) {
      clearMessages()
      setCurrentSession(targetSession)
      setCurrentSessionId(sessionId)
      loadMessages(sessionId)
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
        
        {/* 使用路由守卫保护 App 主体 */}
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={
            <div className="h-screen w-screen overflow-hidden bg-[#FAFAFA]">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-32 -left-32 w-[50rem] h-[50rem] bg-gradient-to-br from-[#BFFFD9]/30 via-[#E0FFFF]/20 to-transparent rounded-full blur-3xl animate-pulse" />
              <div className="absolute -bottom-32 -right-32 w-[50rem] h-[50rem] bg-gradient-to-br from-[#E6E6FA]/30 via-[#FFFACD]/20 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-gradient-to-br from-[#E0FFFF]/20 via-[#BFFFD9]/15 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />
            </div>

            <div className="relative z-10 h-full p-4 md:p-6">
              <div className="h-full rounded-3xl overflow-hidden backdrop-blur-2xl bg-white/70 border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
                {isMobile ? (
                  <div className="h-full flex flex-col">
                    <div className="flex-none border-b border-white/30 bg-white/40 backdrop-blur-sm">
                      <div className="flex">
                        <button
                          onClick={() => setActiveTab('sessions')}
                          className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                            activeTab === 'sessions'
                              ? 'text-[#BFFFD9] border-b-2 border-[#BFFFD9]'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          会话
                        </button>
                        <button
                          onClick={() => setActiveTab('chat')}
                          className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                            activeTab === 'chat'
                              ? 'text-[#BFFFD9] border-b-2 border-[#BFFFD9]'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          对话
                        </button>
                        <button
                          onClick={() => setActiveTab('charts')}
                          className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                            activeTab === 'charts'
                              ? 'text-[#BFFFD9] border-b-2 border-[#BFFFD9]'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          图表
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {activeTab === 'sessions' && (
                        <div className="h-full bg-gradient-to-br from-[#E6E6FA]/40 to-[#BFFFD9]/30 backdrop-blur-md">
                          <SessionList
                            selectedSessionId={selectedSessionId}
                            onSelectSession={(id, session) => {
                              setSelectedSessionId(id)
                              if (session) {
                                clearMessages()
                                setCurrentSession(session)
                                loadMessages(id)
                              }
                              setActiveTab('chat')
                            }}
                            onSessionsUpdated={() => loadSessions(false)}
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
                    left={
                      <div className="h-full bg-gradient-to-br from-[#E6E6FA]/40 to-[#BFFFD9]/30 backdrop-blur-md border-r border-white/40">
                        <SessionList
                          selectedSessionId={selectedSessionId}
                          onSelectSession={handleSelectSession}
                          onSessionsUpdated={() => loadSessions(false)}
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
    </ErrorBoundary>
  )
}
