import { useState, useEffect, useCallback } from 'react'
import { ragApi } from '@/api'

interface RagChunk {
  id: string
  content: string
  metadata: {
    filename?: string
    session_id?: string
    engine?: string
    [key: string]: any
  }
}

interface GroupedChunks {
  [filename: string]: RagChunk[]
}

interface RagManagerModalProps {
  sessionId: string
  onClose: () => void
}

export default function RagManagerModal({ sessionId, onClose }: RagManagerModalProps) {
  const [chunks, setChunks] = useState<RagChunk[]>([])
  const [loading, setLoading] = useState(true)
  const [deduping, setDeduping] = useState(false)
  const [threshold, setThreshold] = useState(0.85)
  const [dedupResult, setDedupResult] = useState<{ removed: number; remaining: number } | null>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const loadChunks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await ragApi.listChunks(sessionId)
      setChunks(data.chunks)
    } catch (e) {
      console.error('获取RAG片段失败:', e)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    loadChunks()
  }, [loadChunks])

  // 按文件名分组
  const grouped: GroupedChunks = chunks.reduce((acc, chunk) => {
    const name = chunk.metadata?.filename || '未知文档'
    if (!acc[name]) acc[name] = []
    acc[name].push(chunk)
    return acc
  }, {} as GroupedChunks)

  const fileNames = Object.keys(grouped)

  const toggleFile = (filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  const handleDeduplicate = async () => {
    setDeduping(true)
    setDedupResult(null)
    try {
      const result = await ragApi.deduplicate(sessionId, threshold)
      setDedupResult(result)
      if (result.removed > 0) await loadChunks()
    } catch (e) {
      console.error('去重失败:', e)
    } finally {
      setDeduping(false)
    }
  }

  const handleDeleteChunk = async (chunkId: string) => {
    setDeletingIds(prev => new Set(prev).add(chunkId))
    try {
      await ragApi.deleteChunk(chunkId)
      setChunks(prev => prev.filter(c => c.id !== chunkId))
      setDedupResult(null)
    } catch (e) {
      console.error('删除片段失败:', e)
    } finally {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(chunkId); return s })
    }
  }

  const thresholdLabel = threshold >= 0.98 ? '完全重复' : threshold >= 0.9 ? '严格' : threshold >= 0.8 ? '适中' : '宽松'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景蒙层 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* 弹窗主体 */}
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-800">📋 RAG 知识库管理</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? '加载中...' : `共 ${chunks.length} 个片段，来自 ${fileNames.length} 个文档`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 去重面板 */}
        <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">🧹 智能去重</span>
            <span className="text-[10px] text-amber-600 font-medium px-2 py-0.5 bg-amber-100 rounded-full">{thresholdLabel}</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] text-gray-400 w-10">宽松</span>
            <input
              type="range"
              min="0.7"
              max="1.0"
              step="0.05"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-amber-500"
            />
            <span className="text-[10px] text-gray-400 w-10 text-right">严格</span>
            <span className="text-xs font-mono text-gray-600 w-8 text-right">{Math.round(threshold * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeduplicate}
              disabled={deduping || loading || chunks.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors"
            >
              {deduping ? (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : '🧹'}
              {deduping ? '去重中...' : '运行去重'}
            </button>
            {dedupResult && (
              <span className={`text-xs ${dedupResult.removed > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {dedupResult.removed > 0
                  ? `✅ 已删除 ${dedupResult.removed} 个重复片段，剩余 ${dedupResult.remaining} 个`
                  : '✓ 无重复内容'}
              </span>
            )}
          </div>
        </div>

        {/* 片段列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              <svg className="w-4 h-4 animate-spin mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              加载中...
            </div>
          ) : chunks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-3xl mb-2">📭</span>
              <p className="text-sm">当前会话暂无RAG内容</p>
              <p className="text-xs mt-1">上传文档后内容将出现在这里</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {fileNames.map(filename => {
                const fileChunks = grouped[filename]
                const isExpanded = expandedFiles.has(filename)
                return (
                  <div key={filename}>
                    {/* 文件标题行 */}
                    <button
                      onClick={() => toggleFile(filename)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base flex-shrink-0">📄</span>
                        <span className="text-xs font-medium text-gray-700 truncate" title={filename}>{filename}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{fileChunks.length} 片段</span>
                        <svg
                          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* 片段列表（折叠/展开） */}
                    {isExpanded && (
                      <div className="bg-gray-50/50">
                        {fileChunks.map((chunk, idx) => (
                          <div
                            key={chunk.id}
                            className="flex items-start gap-3 px-5 py-2.5 border-t border-gray-100/80 hover:bg-white/60 transition-colors group"
                          >
                            <span className="text-[10px] text-gray-300 font-mono mt-0.5 w-4 flex-shrink-0">#{idx + 1}</span>
                            <p className="flex-1 text-[11px] text-gray-600 leading-relaxed line-clamp-3 min-w-0">
                              {chunk.content}
                            </p>
                            <button
                              onClick={() => handleDeleteChunk(chunk.id)}
                              disabled={deletingIds.has(chunk.id)}
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all disabled:opacity-50"
                              title="删除该片段"
                            >
                              {deletingIds.has(chunk.id) ? (
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部刷新按钮 */}
        {!loading && chunks.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
            <button
              onClick={loadChunks}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
