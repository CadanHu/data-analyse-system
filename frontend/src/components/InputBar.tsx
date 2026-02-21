import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSSE } from '../hooks/useSSE'

interface InputBarProps {
  sessionId: string | null
  onMessageSent?: () => void
}

export default function InputBar({ sessionId, onMessageSent }: InputBarProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isLoading } = useChatStore()
  const { connect } = useSSE()

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [input])

  const handleSubmit = async () => {
    if (!input.trim() || !sessionId || isLoading) return

    const question = input.trim()
    setInput('')
    connect(sessionId, question, { onMessageSent })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative">
      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={!sessionId ? '请先选择一个会话' : '输入你的问题... (Enter 发送，Shift+Enter 换行)'}
          disabled={isLoading || !sessionId}
          className="w-full bg-transparent px-5 py-4 text-gray-700 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          rows={1}
        />
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="text-xs text-gray-400">
            {isLoading ? '正在思考中...' : 'Enter 发送 | Shift+Enter 换行'}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || !sessionId || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] disabled:from-gray-200 disabled:to-gray-300 disabled:cursor-not-allowed rounded-xl text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)] disabled:shadow-none"
          >
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9 18-9 18 9-2zm0 0v-8" />
            </svg>
            <span className="text-sm font-medium">发送</span>
          </button>
        </div>
      </div>
    </div>
  )
}
