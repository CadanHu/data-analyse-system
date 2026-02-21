export default function ThinkingIndicator({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3 py-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[#E6E6FA] to-[#FFFACD] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
        <svg className="w-4 h-4 text-gray-700 animate-pulse" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <div className="flex-1 bg-white/60 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-3 border border-white/40 shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        <p className="text-gray-600">{content || '正在思考...'}</p>
      </div>
    </div>
  )
}
