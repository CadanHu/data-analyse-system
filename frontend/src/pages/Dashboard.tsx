import { useState, useEffect } from 'react'
import SessionList from '../components/SessionList'
import MessageList from '../components/MessageList'
import InputBar from '../components/InputBar'
import RightPanel from '../components/RightPanel'
import { useChatStore } from '../stores/chatStore'
import { sessionApi } from '../api/sessionApi'

function Dashboard() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const { clearMessages, addMessage } = useChatStore()

  useEffect(() => {
    if (selectedSessionId) {
      clearMessages()
      loadSessionMessages(selectedSessionId)
    }
  }, [selectedSessionId, clearMessages])

  const loadSessionMessages = async (sessionId: string) => {
    try {
      const messages = await sessionApi.getMessages(sessionId)
      messages.forEach(msg => {
        const processedMsg = {
          ...msg,
          chartConfig: msg.chart_cfg ? JSON.parse(msg.chart_cfg) : null,
          data: msg.data ? JSON.parse(msg.data) : null,
          thinking: msg.thinking
        }
        addMessage(processedMsg)
      })
    } catch (error) {
      console.error('加载消息失败:', error)
    }
  }

  return (
    <div className="h-screen flex bg-gray-950">
      {/* 左侧面板 - 会话管理 */}
      <aside className="w-64 bg-gray-900 border-r border-gray-700 flex flex-col">
        <SessionList 
          onSelectSession={setSelectedSessionId} 
          selectedSessionId={selectedSessionId}
        />
      </aside>

      {/* 中间区域 - 问答区 */}
      <main className="flex-1 flex flex-col bg-gray-950">
        <MessageList />
        <InputBar 
          sessionId={selectedSessionId} 
          disabled={!selectedSessionId}
        />
      </main>

      {/* 右侧面板 - 图表区 */}
      <RightPanel />
    </div>
  )
}

export default Dashboard
