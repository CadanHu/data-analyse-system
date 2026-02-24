import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import SessionList from './components/SessionList'
import ChatArea from './components/ChatArea'
import RightPanel from './components/RightPanel'
import ResizableSplit from './components/ResizableSplit'
import ErrorBoundary from './components/ErrorBoundary'
import Welcome from './components/Welcome'
import About from './components/About'
import LearnMore from './components/LearnMore'
import Tutorial from './components/Tutorial'
import Features from './components/Features'
import Changelog from './components/Changelog'
import { useSessionStore } from './stores/sessionStore'
import { useChatStore } from './stores/chatStore'
import { SQLResult } from './types/message'
import sessionApi from './api/sessionApi'

export default function App() {
  const navigate = useNavigate()
  const { sessions, currentSession, setSessions, setCurrentSession, setLoading, messages, setMessages, loading, clearMessages } = useSessionStore()
  const { setChartOption, setSqlResult, setCurrentSql, setCurrentSessionId, isRightPanelVisible, activeTab, setActiveTab } = useChatStore()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    loadSessions(true)
    
    const checkMobile = () => {
      // 竖屏且宽度较小视为移动端
      const isPortrait = window.innerHeight > window.innerWidth
      setIsMobile(isPortrait && window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    window.addEventListener('orientationchange', checkMobile)
    
    return () => {
      window.removeEventListener('resize', checkMobile)
      window.removeEventListener('orientationchange', checkMobile)
    }
  }, [])

  const loadSessions = async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true)
    sessionApi.getSessions()
      .then(data => {
        setSessions(data)
        // 在 iOS 上，我们不自动加载第一个会话的消息，以防卡顿
        // 让用户手动点击会话时再加载
      })
      .catch(error => console.error('加载会话列表失败:', error))
      .finally(() => {
        if (isInitialLoad) setLoading(false)
      })
  }

  const loadMessages = async (sessionId: string) => {
    if (!sessionId) return
    console.log('[App] Loading Messages for:', sessionId)
    
    try {
      const data = await sessionApi.getMessages(sessionId)
      // 这里的 map 处理如果是大数据量会卡，但在 3 条会话下应该是秒出的
      const processedData = data.map(msg => {
        if (typeof msg.data === 'string' && msg.data) {
          try {
            return { ...msg, data: JSON.parse(msg.data) }
          } catch (e) {
            console.error('解析消息 data 失败:', e)
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
    console.log('[App] Selecting Session:', sessionId)
    setSelectedSessionId(sessionId)
    const targetSession = session || sessions.find(s => s.id === sessionId)
    if (targetSession) {
      clearMessages()
      setCurrentSession(targetSession)
      setCurrentSessionId(sessionId)
      // 使用 setTimeout 确保 UI 先更新（高亮选中状态），然后再开始耗时的消息加载
      setTimeout(() => {
        loadMessages(sessionId)
      }, 50)
    }
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/about" element={<About />} />
        <Route path="/learn-more" element={<LearnMore />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/features" element={<Features />} />
        <Route path="/changelog" element={<Changelog />} />
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
                  <div className="h-full flex flex-col relative">
                    {/* 全局回退按钮：位于状态栏时间旁边 */}
                    <button 
                      onClick={() => navigate('/')}
                      className="absolute left-4 z-[100] p-1.5 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-gray-700 transition-all shadow-sm"
                      style={{ top: 'calc(env(safe-area-inset-top) + 0.4rem)' }}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    <div className="flex-none border-b border-white/30 bg-white/40 backdrop-blur-sm landscape:h-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                      <div className="flex pl-12 landscape:pl-16"> {/* 为左侧箭头留出空间 */}
                        <button
                          onClick={() => setActiveTab('sessions')}
                          className={`flex-1 px-4 py-3 landscape:py-2 text-sm landscape:text-xs font-medium transition-all ${
                            activeTab === 'sessions'
                              ? 'text-[#BFFFD9] border-b-2 border-[#BFFFD9]'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          会话
                        </button>
                        <button
                          onClick={() => setActiveTab('chat')}
                          className={`flex-1 px-4 py-3 landscape:py-2 text-sm landscape:text-xs font-medium transition-all ${
                            activeTab === 'chat'
                              ? 'text-[#BFFFD9] border-b-2 border-[#BFFFD9]'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          对话
                        </button>
                        <button
                          onClick={() => setActiveTab('charts')}
                          className={`flex-1 px-4 py-3 landscape:py-2 text-sm landscape:text-xs font-medium transition-all ${
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
                              // 1. 立即切换标签页 (最高优先级)
                              setActiveTab('chat')
                              
                              // 2. 更新状态并加载消息 (后台异步)
                              setSelectedSessionId(id)
                              const targetSession = session || sessions.find(s => s.id === id)
                              if (targetSession) {
                                clearMessages()
                                setCurrentSession(targetSession)
                                loadMessages(id)
                              }
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
