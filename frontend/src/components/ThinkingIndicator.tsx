import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

export default function ThinkingIndicator({ content }: { content: string }) {
  // 判断是否是真正的模型思考内容（通常较长或包含多行）
  const isModelThinking = content && (content.length > 20 || content.includes('\n') || content.includes(' '))

  return (
    <div className="flex items-start gap-3 py-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[#FFD700] to-[#FFFACD] flex items-center justify-center shadow-[0_4px_12px_rgba(255,215,0,0.2)]">
        <svg className="w-4 h-4 text-amber-700 animate-spin" fill="none" viewBox="0 0 24 24" style={{ animationDuration: '3s' }}>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <div className="flex-1 bg-amber-50/40 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-3 border border-amber-100/50 shadow-[0_4px_16px_rgba(255,215,0,0.06)] max-w-[90%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600/80">Thinking Process</span>
          <div className="flex gap-1">
            <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce"></span>
            <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]"></span>
            <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]"></span>
          </div>
        </div>
        <div className={`text-gray-600 text-sm ${isModelThinking ? 'markdown-body prose prose-sm max-w-none italic' : ''}`}>
          {isModelThinking ? (
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {content}
            </ReactMarkdown>
          ) : (
            <p>{content || '正在准备数据...'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
