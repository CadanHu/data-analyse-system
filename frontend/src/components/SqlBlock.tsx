import { useState } from 'react'

interface SqlBlockProps {
  sql: string
  collapsed: boolean
}

export default function SqlBlock({ sql, collapsed }: SqlBlockProps) {
  if (collapsed) return null

  return (
    <div className="mt-4">
      <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 overflow-x-auto border border-white/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">SQL Query</span>
        </div>
        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
          {sql}
        </pre>
      </div>
    </div>
  )
}
