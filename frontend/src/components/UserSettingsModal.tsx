import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { ragApi, parsedApi } from '@/api'
import { getAllKnowledgeChunks, deleteKnowledgeChunkById, deleteKnowledgeChunksByDoc, updateKnowledgeChunkContent } from '../services/db'
import { X, User, Database, ChevronDown, RefreshCw, Trash2, Loader2, Pencil, Check, FolderOpen } from 'lucide-react'

interface ParsedFileInfo {
  name: string
  size: number
  url?: string
}

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

interface GroupedBySession {
  [sessionId: string]: {
    sessionTitle: string
    files: { [filename: string]: RagChunk[] }
    totalChunks: number
  }
}

interface UserSettingsModalProps {
  onClose: () => void
}

export default function UserSettingsModal({ onClose }: UserSettingsModalProps) {
  const { user, localUserId } = useAuthStore()
  const { sessions } = useSessionStore()
  const [activeTab, setActiveTab] = useState<'profile' | 'rag' | 'parsed'>('profile')

  // RAG state
  const [allChunks, setAllChunks] = useState<RagChunk[]>([])   // 全量，用于推导下拉框
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalChunks, setTotalChunks] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(0.85)
  const [selectedSessionId, setSelectedSessionId] = useState<string>('__all__')
  const [deduping, setDeduping] = useState(false)
  const [dedupResult, setDedupResult] = useState<{ removed: number; remaining: number } | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deletingDocs, setDeletingDocs] = useState<Set<string>>(new Set())
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)

  const sessionMap = Object.fromEntries(sessions.map(s => [s.id, s.title || s.id.slice(0, 8)]))

  const PAGE_SIZE = 50

  // 始终拉全量（不传 session_id），在前端过滤；分页加载，第一页立即展示
  const loadChunks = useCallback(async () => {
    setLoadingChunks(true)
    setLoadingMore(false)
    setLoadError(null)
    setDedupResult(null)
    setAllChunks([])
    setTotalChunks(0)
    try {
      if (Capacitor.isNativePlatform()) {
        // 移动端：从本地 SQLite 读取（数据量小，一次性加载）
        const localChunks = await getAllKnowledgeChunks(user?.id ?? 0)
        const mapped = localChunks.map(c => ({
          id: c.id,
          content: c.content,
          metadata: {
            filename: c.doc_name,
            session_id: c.session_id ?? undefined,
            chunk_index: c.chunk_index,
            ...(c.metadata ? JSON.parse(c.metadata) : {}),
          }
        }))
        setAllChunks(mapped)
        setTotalChunks(mapped.length)
      } else {
        // 第一页：立即展示
        const first = await ragApi.listChunks(undefined, PAGE_SIZE, 0)
        setAllChunks(first.chunks)
        setTotalChunks(first.total)
        setLoadingChunks(false)

        // 后续页：后台静默加载，逐批 append
        if (first.total > PAGE_SIZE) {
          setLoadingMore(true)
          let offset = PAGE_SIZE
          while (offset < first.total) {
            const page = await ragApi.listChunks(undefined, PAGE_SIZE, offset)
            setAllChunks(prev => [...prev, ...page.chunks])
            offset += PAGE_SIZE
          }
          setLoadingMore(false)
        }
        return  // finally 里的 setLoadingChunks 不需要再执行
      }
    } catch (e: any) {
      console.error('获取RAG片段失败:', e)
      const msg = e?.response?.data?.detail || e?.message || '请求失败，请检查网络或重新登录'
      setLoadError(msg)
    } finally {
      setLoadingChunks(false)
      setLoadingMore(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (activeTab === 'rag') loadChunks()
  }, [activeTab, loadChunks])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 前端过滤：只展示选中会话的 chunks
  const chunks = selectedSessionId === '__all__'
    ? allChunks
    : allChunks.filter(c => c.metadata?.session_id === selectedSessionId)

  // 有 RAG 数据的会话 ID 集合（用于下拉框）
  const sessionIdsWithRag = [...new Set(
    allChunks.map(c => c.metadata?.session_id).filter(Boolean) as string[]
  )]
  const sessionsWithRag = sessions.filter(s => sessionIdsWithRag.includes(s.id))

  // 按会话/文件分组
  const grouped: GroupedBySession = chunks.reduce((acc, chunk) => {
    const sid = chunk.metadata?.session_id || '__unknown__'
    const filename = chunk.metadata?.filename || '未知文档'
    if (!acc[sid]) {
      acc[sid] = {
        sessionTitle: sessionMap[sid] || sid.slice(0, 12) + '...',
        files: {},
        totalChunks: 0
      }
    }
    if (!acc[sid].files[filename]) acc[sid].files[filename] = []
    acc[sid].files[filename].push(chunk)
    acc[sid].totalChunks++
    return acc
  }, {} as GroupedBySession)

  const sessionIds = Object.keys(grouped)

  const toggleKey = (key: string) => {
    setExpandedKeys(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const handleDeduplicate = async () => {
    setDeduping(true)
    setDedupResult(null)
    const sid = selectedSessionId === '__all__' ? undefined : selectedSessionId
    try {
      const result = await ragApi.deduplicate(sid, threshold)
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
      if (Capacitor.isNativePlatform()) {
        await deleteKnowledgeChunkById(chunkId)
      } else {
        await ragApi.deleteChunk(chunkId)
      }
      setAllChunks(prev => prev.filter(c => c.id !== chunkId))
    } catch (e) {
      console.error('删除片段失败:', e)
    } finally {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(chunkId); return s })
    }
  }

  const handleDeleteDoc = async (filename: string, sessionId: string) => {
    const key = `doc_${sessionId}_${filename}`
    setDeletingDocs(prev => new Set(prev).add(key))
    setConfirmingKey(null)
    try {
      if (Capacitor.isNativePlatform()) {
        await deleteKnowledgeChunksByDoc(
          user?.id ?? localUserId ?? 0,
          sessionId === '__unknown__' ? null : sessionId,
          filename
        )
      } else {
        await ragApi.deleteDoc(sessionId === '__unknown__' ? undefined : sessionId, filename)
      }
      setAllChunks(prev => prev.filter(c => !(c.metadata?.filename === filename && (c.metadata?.session_id || '__unknown__') === sessionId)))
    } catch (e) {
      console.error('删除文档失败:', e)
    } finally {
      setDeletingDocs(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  // ── 解析文件 Tab 删除 ──
  const [deletingParsedDocs, setDeletingParsedDocs] = useState<Set<string>>(new Set())

  const handleDeleteParsedDoc = async (filename: string) => {
    const key = `parsed_${filename}`
    setDeletingParsedDocs(prev => new Set(prev).add(key))
    setConfirmingKey(null)
    try {
      if (Capacitor.isNativePlatform()) {
        // 删除本地 SQLite 知识块
        await deleteKnowledgeChunksByDoc(user?.id ?? localUserId ?? 0, null, filename)
        // 删除 Capacitor 文件系统中的解析目录
        const safeDocName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const baseDir = `parsed/${localUserId ?? user?.id}/${safeDocName}`
        try {
          await Filesystem.rmdir({ path: baseDir, directory: Directory.Data, recursive: true })
        } catch { /* 目录不存在时静默 */ }
      } else {
        const stem = filename.replace(/\.[^.]+$/, '')
        // 删除解析文件（不阻断后续）
        try { await parsedApi.deleteParsed(stem) } catch { /* 非致命 */ }
        // 删除 RAG 知识块（不指定 session，清除所有会话的该文档）
        await ragApi.deleteDoc(undefined, filename)
      }
      setParsedDocs(prev => prev.filter(d => d !== filename))
      if (selectedParsedDoc === filename) {
        setSelectedParsedDoc(null)
        setParsedFilesList([])
      }
      // 同步更新 RAG tab 的缓存
      setAllChunks(prev => prev.filter(c => c.metadata?.filename !== filename))
    } catch (e) {
      console.error('删除解析文档失败:', e)
    } finally {
      setDeletingParsedDocs(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  // Chunk viewer / editor state
  const [viewingChunk, setViewingChunk] = useState<RagChunk | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const openChunk = (chunk: RagChunk) => {
    setViewingChunk(chunk)
    setEditMode(false)
    setEditContent(chunk.content)
  }

  const closeChunk = () => {
    setViewingChunk(null)
    setEditMode(false)
  }

  const handleSaveEdit = async () => {
    if (!viewingChunk || editContent === viewingChunk.content) { setEditMode(false); return }
    setSavingEdit(true)
    try {
      if (isNative) {
        await updateKnowledgeChunkContent(viewingChunk.id, editContent)
      } else {
        // Web: backend API not yet implemented — update local state only
      }
      setAllChunks(prev => prev.map(c =>
        c.id === viewingChunk.id ? { ...c, content: editContent } : c
      ))
      setViewingChunk(prev => prev ? { ...prev, content: editContent } : null)
      setEditMode(false)
    } catch (e) {
      console.error('保存失败:', e)
    } finally {
      setSavingEdit(false)
    }
  }

  const thresholdLabel = threshold >= 0.98 ? '完全重复' : threshold >= 0.9 ? '严格' : threshold >= 0.8 ? '适中' : '宽松'
  const isNative = Capacitor.isNativePlatform()

  // ── 解析文件 Tab ──────────────────────────────────────────
  const [parsedDocs, setParsedDocs] = useState<string[]>([])
  const [parsedDocsLoading, setParsedDocsLoading] = useState(false)
  const [selectedParsedDoc, setSelectedParsedDoc] = useState<string | null>(null)
  const [parsedFilesList, setParsedFilesList] = useState<ParsedFileInfo[]>([])
  const [parsedFilesLoading, setParsedFilesLoading] = useState(false)

  // 加载有过解析的文档列表（从已有 chunks 中提取唯一文档名）
  const loadParsedDocs = useCallback(async () => {
    setParsedDocsLoading(true)
    try {
      let docs: string[] = []
      if (isNative) {
        const localChunks = await getAllKnowledgeChunks(localUserId ?? user?.id ?? 0)
        docs = [...new Set(localChunks.map(c => c.doc_name).filter(Boolean))] as string[]
      } else {
        const data = await ragApi.listDocs()
        docs = data.docs
      }
      setParsedDocs(docs)
    } catch (e) {
      console.error('加载文档列表失败:', e)
    } finally {
      setParsedDocsLoading(false)
    }
  }, [isNative, localUserId, user?.id])

  useEffect(() => {
    if (activeTab === 'parsed') loadParsedDocs()
  }, [activeTab, loadParsedDocs])

  const loadParsedFiles = async (filename: string) => {
    if (selectedParsedDoc === filename) {
      setSelectedParsedDoc(null)
      setParsedFilesList([])
      return
    }
    setSelectedParsedDoc(filename)
    setParsedFilesList([])
    setParsedFilesLoading(true)
    try {
      if (isNative) {
        const safeDocName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const baseDir = `parsed/${localUserId ?? user?.id}/${safeDocName}`
        const files: ParsedFileInfo[] = []
        const readLevel = async (relDir: string) => {
          try {
            const res = await Filesystem.readdir({ path: relDir, directory: Directory.Data })
            for (const f of res.files) {
              if (f.type === 'directory') {
                await readLevel(`${relDir}/${f.name}`)
              } else {
                const relName = `${relDir.replace(baseDir + '/', '')}/${f.name}`.replace(/^\//, '')
                files.push({ name: relName || f.name, size: f.size ?? 0 })
              }
            }
          } catch { /* 静默 */ }
        }
        try {
          const rootRes = await Filesystem.readdir({ path: baseDir, directory: Directory.Data })
          for (const f of rootRes.files) {
            if (f.type === 'directory') {
              await readLevel(`${baseDir}/${f.name}`)
            } else {
              files.push({ name: f.name, size: f.size ?? 0 })
            }
          }
        } catch { /* 未找到 */ }
        setParsedFilesList(files)
      } else {
        const stem = filename.replace(/\.[^.]+$/, '')
        try {
          const res = await fetch(`/api/parsed-output/${encodeURIComponent(stem)}`)
          if (res.ok) {
            const data = await res.json()
            setParsedFilesList((data.files as any[]).map((f: any) => ({ name: f.name, size: f.size, url: f.url })))
          }
        } catch { /* API 未找到 */ }
      }
    } finally {
      setParsedFilesLoading(false)
    }
  }

  const navItems = [
    { id: 'profile' as const, label: '个人信息', icon: <User className="w-4 h-4" /> },
    { id: 'rag' as const, label: 'RAG 知识库', icon: <Database className="w-4 h-4" /> },
    { id: 'parsed' as const, label: '解析文件', icon: <FolderOpen className="w-4 h-4" /> },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#FAFAFA]">
      {/* 顶部渐变背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[40rem] h-[40rem] bg-gradient-to-br from-[#BFFFD9]/25 via-[#E0FFFF]/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[40rem] h-[40rem] bg-gradient-to-br from-[#E6E6FA]/25 via-[#FFFACD]/15 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex-none flex items-center justify-between px-4 sm:px-8 py-4 bg-white/70 backdrop-blur-xl border-b border-white/50 shadow-sm" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#06d6a0] flex items-center justify-center text-white text-sm font-bold shadow-md">
            {(user?.username || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-800">用户设置</h1>
            <p className="text-xs text-gray-400 hidden sm:block">{user?.email || ''}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          title="关闭"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Body */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* ── 桌面端左侧导航栏 ── */}
        <nav className="hidden md:flex flex-col w-56 flex-none bg-white/50 backdrop-blur-md border-r border-white/40 py-6 px-3 gap-1">
          {/* 用户卡片 */}
          <div className="flex flex-col items-center gap-2 mb-6 px-2">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#06d6a0] flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {(user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            <p className="text-sm font-semibold text-gray-800 text-center truncate w-full">{user?.username || '—'}</p>
            <p className="text-xs text-gray-400 text-center truncate w-full">{user?.email || '—'}</p>
            <span className="text-[10px] px-2 py-0.5 bg-[#BFFFD9]/60 text-green-700 rounded-full font-medium">
              {sessions.length} 个会话
            </span>
          </div>

          {/* 导航项 */}
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                activeTab === item.id
                  ? 'bg-gradient-to-r from-[#BFFFD9]/50 to-[#E0FFFF]/40 text-gray-800 shadow-sm border border-white/60'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <span className={activeTab === item.id ? 'text-blue-500' : 'text-gray-400'}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* ── 移动端顶部 Tab 栏 ── */}
        <div className="md:hidden flex-none flex border-b border-white/40 bg-white/50 backdrop-blur-md px-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === item.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* ── 内容区域 ── */}
        <main className="flex-1 min-h-0 overflow-y-auto">
          {/* 个人信息 */}
          {activeTab === 'profile' && (
            <div className="max-w-2xl mx-auto p-6 sm:p-10">
              <h2 className="text-lg font-semibold text-gray-800 mb-6">个人信息</h2>

              {/* 头像区域 */}
              <div className="flex items-center gap-5 mb-8 p-5 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#06d6a0] flex items-center justify-center text-white text-3xl font-bold shadow-lg flex-shrink-0">
                  {(user?.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xl font-semibold text-gray-800">{user?.username || '—'}</p>
                  <p className="text-sm text-gray-500 mt-1">{user?.email || '—'}</p>
                </div>
              </div>

              {/* 详细信息 */}
              <div className="space-y-3">
                {[
                  { label: '用户名', value: user?.username || '—' },
                  { label: '邮箱', value: user?.email || '—' },
                  { label: '会话数量', value: `${sessions.length} 个` },
                ].map(row => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between px-5 py-4 bg-white/60 backdrop-blur-sm rounded-xl border border-white/50 shadow-sm"
                  >
                    <span className="text-sm text-gray-500">{row.label}</span>
                    <span className="text-sm font-medium text-gray-800">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RAG 知识库 */}
          {activeTab === 'rag' && (
            <div className="flex flex-col h-full">
              {/* 控制栏 */}
              <div className="flex-none px-4 sm:px-8 py-4 border-b border-white/40 bg-white/40 backdrop-blur-sm space-y-4">
                {/* 筛选 + 刷新 */}
                <div className="flex items-center gap-3 max-w-2xl">
                  <label className="text-xs text-gray-500 flex-shrink-0">筛选会话</label>
                  <select
                    value={selectedSessionId}
                    onChange={e => {
                      setSelectedSessionId(e.target.value)
                      setDedupResult(null)
                    }}
                    className="flex-1 text-sm text-gray-700 bg-white/80 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300/50 shadow-sm"
                  >
                    <option value="__all__">全部会话（共 {allChunks.length} 片段）</option>
                    {sessionsWithRag.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.title || '未命名会话'} — {allChunks.filter(c => c.metadata?.session_id === s.id).length} 片段
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => loadChunks()}
                    disabled={loadingChunks}
                    className="flex-shrink-0 p-2 rounded-xl hover:bg-white/60 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 border border-gray-200/60"
                    title="刷新"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingChunks ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* 去重控制（仅 Web 端可用） */}
                {!isNative && <div className="max-w-2xl bg-amber-50/80 backdrop-blur-sm rounded-2xl p-4 border border-amber-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">🧹 智能去重</span>
                    <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium">{thresholdLabel}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 flex-shrink-0">宽松</span>
                    <input
                      type="range" min="0.7" max="1.0" step="0.05"
                      value={threshold}
                      onChange={e => setThreshold(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 accent-amber-500"
                    />
                    <span className="text-xs text-gray-400 flex-shrink-0">严格</span>
                    <span className="text-sm font-mono text-gray-600 w-10 text-right">{Math.round(threshold * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleDeduplicate}
                      disabled={deduping || loadingChunks || chunks.length < 2}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                    >
                      {deduping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '🧹'}
                      {deduping ? '去重中...' : selectedSessionId === '__all__' ? '全库去重' : '当前会话去重'}
                    </button>
                    {dedupResult && (
                      <span className={`text-sm ${dedupResult.removed > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {dedupResult.removed > 0
                          ? `✅ 删除 ${dedupResult.removed} 个重复片段，剩余 ${dedupResult.remaining}`
                          : '✓ 无重复内容'}
                      </span>
                    )}
                  </div>
                </div>}
              </div>

              {/* 片段列表 */}
              <div className="flex-1 overflow-y-auto">
                {loadingChunks && allChunks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <p className="text-sm">加载中...</p>
                  </div>
                ) : loadError ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3">
                    <span className="text-4xl">⚠️</span>
                    <p className="text-sm font-medium text-red-500">加载失败</p>
                    <p className="text-xs text-gray-400 max-w-xs text-center">{loadError}</p>
                    <button
                      onClick={() => loadChunks()}
                      className="mt-1 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-xl transition-colors"
                    >重试</button>
                  </div>
                ) : chunks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
                    <span className="text-5xl">📭</span>
                    <p className="text-base font-medium text-gray-500">暂无RAG内容</p>
                    <p className="text-sm text-gray-400">在聊天中上传文档后内容将显示在这里</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/60">
                    {sessionIds.map(sid => {
                      const sessionGroup = grouped[sid]
                      const sessionKey = `s_${sid}`
                      const isSessionExpanded = expandedKeys.has(sessionKey)
                      return (
                        <div key={sid}>
                          {selectedSessionId === '__all__' && (
                            <button
                              onClick={() => toggleKey(sessionKey)}
                              className="w-full flex items-center justify-between px-4 sm:px-8 py-3 bg-blue-50/60 hover:bg-blue-50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-base">💬</span>
                                <span className="text-sm font-semibold text-blue-700 truncate">{sessionGroup.sessionTitle}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className="text-xs text-blue-400 bg-blue-100 px-2 py-0.5 rounded-full">{sessionGroup.totalChunks} 片段</span>
                                <ChevronDown className={`w-4 h-4 text-blue-400 transition-transform ${isSessionExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </button>
                          )}

                          {(selectedSessionId !== '__all__' || isSessionExpanded) && (
                            Object.entries(sessionGroup.files).map(([filename, fileChunks]) => {
                              const fileKey = `f_${sid}_${filename}`
                              const isFileExpanded = expandedKeys.has(fileKey)
                              return (
                                <div key={fileKey}>
                                  <div className="flex items-center hover:bg-white/50 transition-colors group/file">
                                    <button
                                      onClick={() => toggleKey(fileKey)}
                                      className="flex-1 flex items-center justify-between px-4 sm:px-8 py-3 text-left min-w-0"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-base flex-shrink-0">📄</span>
                                        <span className="text-sm font-medium text-gray-700 truncate" title={filename}>{filename}</span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{fileChunks.length} 片段</span>
                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isFileExpanded ? 'rotate-180' : ''}`} />
                                      </div>
                                    </button>
                                    {/* 文档级删除按钮 */}
                                    {confirmingKey === fileKey ? (
                                      <div className="flex items-center gap-1 pr-3 flex-shrink-0">
                                        <button
                                          onClick={() => handleDeleteDoc(filename, sid)}
                                          disabled={deletingDocs.has(`doc_${sid}_${filename}`)}
                                          className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                                        >
                                          {deletingDocs.has(`doc_${sid}_${filename}`) ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                          确认删除
                                        </button>
                                        <button
                                          onClick={() => setConfirmingKey(null)}
                                          className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 rounded-lg"
                                        >取消</button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={e => { e.stopPropagation(); setConfirmingKey(fileKey) }}
                                        className="opacity-0 group-hover/file:opacity-100 flex-shrink-0 mr-3 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all"
                                        title="删除该文档的全部片段"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {isFileExpanded && (
                                    <div className="bg-gray-50/60">
                                      {fileChunks.map((chunk, idx) => (
                                        <div
                                          key={chunk.id}
                                          className="flex items-start gap-3 px-4 sm:px-8 py-3 border-t border-gray-100/80 hover:bg-white/60 transition-colors group cursor-pointer"
                                          onClick={() => openChunk(chunk)}
                                        >
                                          <span className="text-xs text-gray-300 font-mono mt-0.5 w-6 flex-shrink-0">#{idx + 1}</span>
                                          <p className="flex-1 text-sm text-gray-600 leading-relaxed line-clamp-3 min-w-0">{chunk.content}</p>
                                          <button
                                            onClick={e => { e.stopPropagation(); handleDeleteChunk(chunk.id) }}
                                            disabled={deletingIds.has(chunk.id)}
                                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all disabled:opacity-40"
                                            title="删除该片段"
                                          >
                                            {deletingIds.has(chunk.id)
                                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              : <Trash2 className="w-3.5 h-3.5" />
                                            }
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* 后台加载更多进度提示 */}
                {loadingMore && (
                  <div className="flex items-center justify-center gap-2 py-3 text-gray-400 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>已加载 {allChunks.length} / {totalChunks} 条</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* 解析文件 */}
          {activeTab === 'parsed' && (
            <div className="max-w-2xl mx-auto p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">📂 MinerU 解析文件</h2>
                <button
                  onClick={loadParsedDocs}
                  disabled={parsedDocsLoading}
                  className="p-2 rounded-xl hover:bg-white/60 text-gray-400 hover:text-gray-600 transition-colors border border-gray-200/60"
                  title="刷新文档列表"
                >
                  <RefreshCw className={`w-4 h-4 ${parsedDocsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-5">
                通过 MinerU 深度模式解析过的文档，可在此下载完整解析结果（Markdown、图片、JSON 等）。
              </p>

              {parsedDocsLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">加载中...</span>
                </div>
              ) : parsedDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                  <span className="text-5xl">📭</span>
                  <p className="text-sm font-medium text-gray-500">暂无解析文档</p>
                  <p className="text-xs text-center">使用「深度 MinerU 模式」上传 PDF 后，解析文件将出现在这里</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {parsedDocs.map(filename => (
                    <div key={filename} className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm overflow-hidden">
                      {/* 文档行 */}
                      <div className="flex items-center group/parsed">
                        <button
                          onClick={() => loadParsedFiles(filename)}
                          className="flex-1 flex items-center justify-between px-5 py-4 hover:bg-blue-50/40 transition-colors text-left min-w-0"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xl flex-shrink-0">📄</span>
                            <span className="text-sm font-medium text-gray-700 truncate">{filename}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {selectedParsedDoc === filename && parsedFilesLoading
                              ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                              : <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${selectedParsedDoc === filename ? 'rotate-180' : ''}`} />
                            }
                          </div>
                        </button>
                        {/* 解析文档删除按钮 */}
                        {confirmingKey === `parsed_${filename}` ? (
                          <div className="flex items-center gap-1 pr-3 flex-shrink-0">
                            <button
                              onClick={() => handleDeleteParsedDoc(filename)}
                              disabled={deletingParsedDocs.has(`parsed_${filename}`)}
                              className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                            >
                              {deletingParsedDocs.has(`parsed_${filename}`) ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              确认删除
                            </button>
                            <button
                              onClick={() => setConfirmingKey(null)}
                              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 rounded-lg"
                            >取消</button>
                          </div>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmingKey(`parsed_${filename}`) }}
                            className="opacity-0 group-hover/parsed:opacity-100 flex-shrink-0 mr-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all"
                            title="删除解析文件及知识库内容"
                          >
                            {deletingParsedDocs.has(`parsed_${filename}`) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        )}
                      </div>

                      {/* 文件列表面板 */}
                      {selectedParsedDoc === filename && !parsedFilesLoading && (
                        <div className="border-t border-gray-100 px-5 py-3 bg-blue-50/40">
                          {parsedFilesList.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">
                              未找到解析文件。该文档需通过 MinerU 深度模式解析后才会有结果。
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {isNative && (
                                <p className="text-[10px] text-gray-400 mb-2">
                                  存储路径：parsed/{localUserId ?? user?.id}/{filename.replace(/[^a-zA-Z0-9._-]/g, '_')}/
                                </p>
                              )}
                              {parsedFilesList.map(f => (
                                <div key={f.name} className="flex items-center justify-between gap-3 py-1">
                                  <span className="text-xs text-gray-600 truncate flex-1" title={f.name}>
                                    {f.name.includes('images/') ? '🖼 ' : f.name.endsWith('.md') ? '📝 ' : f.name.endsWith('.json') ? '🔧 ' : f.name.endsWith('.pdf') ? '📄 ' : '📎 '}
                                    {f.name}
                                  </span>
                                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                                    {f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)}MB` : f.size > 1024 ? `${(f.size / 1024).toFixed(0)}KB` : `${f.size}B`}
                                  </span>
                                  {f.url && (
                                    <a
                                      href={f.url}
                                      download
                                      className="flex-shrink-0 text-xs text-white bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded-lg transition-colors"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      下载
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 片段详情 / 编辑 overlay */}
      {viewingChunk && (
        <div
          className="absolute inset-0 z-10 flex flex-col bg-black/40 backdrop-blur-sm rounded-2xl"
          onClick={closeChunk}
        >
          <div
            className="mt-auto mx-3 mb-3 bg-white rounded-2xl shadow-xl flex flex-col max-h-[80%]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700 truncate max-w-[60%]" title={viewingChunk.metadata?.filename}>
                📄 {viewingChunk.metadata?.filename ?? '片段'}
              </span>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-medium transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />编辑
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditMode(false); setEditContent(viewingChunk.content) }}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-medium transition-colors"
                    >取消</button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={savingEdit || editContent === viewingChunk.content}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-xl text-xs font-medium transition-colors"
                    >
                      {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {savingEdit ? '保存中...' : '保存'}
                    </button>
                  </>
                )}
                <button onClick={closeChunk} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 编辑提示（仅编辑模式显示） */}
            {editMode && (
              <div className="px-5 pt-3 pb-1">
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                  ⚠️ 保存后将清空该片段的语义向量，搜索将自动降级为关键词匹配。如需恢复向量，请重新导入文档。
                </p>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {editMode ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[200px] text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-300/50 resize-none"
                  autoFocus
                />
              ) : (
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{viewingChunk.content}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
