import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Key, Check, Trash2, Eye, EyeOff, ChevronDown } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { apiKeyApi, sessionApi } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import {
  localGetApiKeys,
  localSaveApiKey,
  localDeleteApiKey,
  localUpdateSession,
} from '@/services/localStore'

// 各供应商的预置模型列表
const PROVIDER_MODELS: Record<string, { label: string; models: { value: string; label: string; thinking?: boolean }[] }> = {
  deepseek: {
    label: 'DeepSeek',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek V3 (标准)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek R1 (思考)', thinking: true },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { value: 'gpt-5.3', label: 'GPT-5.3 旗舰' },
      { value: 'gpt-5.2', label: 'GPT-5.2' },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    models: [
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (思考)', thinking: true },
      { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite 超轻量' },
      { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash 图像生成' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    ],
  },
  claude: {
    label: 'Anthropic Claude',
    models: [
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (思考)', thinking: true },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (思考)', thinking: true },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 轻量' },
      { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 (思考)', thinking: true },
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (思考)', thinking: true },
      { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet (思考)', thinking: true },
    ],
  },
}

// 供应商默认 Base URL 提示
const PROVIDER_BASE_URL_HINT: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  gemini: '(不需要填写)',
  claude: '(不需要填写)',
}

interface SavedKey {
  provider: string
  model_name: string | null
  base_url: string | null
  has_key: boolean
  api_key_preview: string
  updated_at: string | null
}

interface ModelKeyModalProps {
  sessionId: string | null
  currentProvider?: string | null
  currentModelName?: string | null
  onClose: () => void
  onModelChange: (provider: string, modelName: string) => void
}

// ─── 移动端全屏 Sheet ──────────────────────────────────────────────────────────
function MobileSheet({
  sessionId, currentProvider, currentModelName, onClose, onModelChange,
  savedKeys, loading, isOffline, localUserId,
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  apiKey, setApiKey,
  baseUrl, setBaseUrl,
  showKey, setShowKey,
  saving, saveSuccess,
  validating, validationResult,
  handleSaveKey, handleDeleteKey, handleApplyModel, handleValidateKey,
}: any) {
  const [activeTab, setActiveTab] = useState<'select' | 'config'>('select')
  const currentModels = PROVIDER_MODELS[selectedProvider]?.models || []
  const hasSavedKey = savedKeys.find((k: SavedKey) => k.provider === selectedProvider)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative mt-auto bg-white rounded-t-3xl flex flex-col"
        style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag bar */}
        <div className="flex-none flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-emerald-600" />
            <h2 className="font-bold text-gray-800 text-base">模型 & API Key 配置</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-none flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('select')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'select' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-500'}`}
          >
            选择模型
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'config' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-500'}`}
          >
            配置 API Key
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'select' && (
            <>
              {/* Provider */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">供应商</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PROVIDER_MODELS).map(([key, info]) => {
                    const hasSaved = savedKeys.find((k: SavedKey) => k.provider === key)
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedProvider(key)}
                        className={`flex items-center gap-2 p-3 rounded-2xl border-2 text-left transition-all active:scale-95 ${
                          selectedProvider === key ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{info.label}</div>
                          {hasSaved && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span className="text-[10px] text-emerald-600">已配置</span>
                            </div>
                          )}
                        </div>
                        {selectedProvider === key && <Check size={14} className="text-emerald-500 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Model */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">模型</label>
                <div className="space-y-2">
                  {currentModels.map((model: any) => (
                    <button
                      key={model.value}
                      onClick={() => setSelectedModel(model.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                        selectedModel === model.value ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800">{model.label}</div>
                        {model.thinking && (
                          <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                            💡 支持思考模式
                          </span>
                        )}
                      </div>
                      {selectedModel === model.value && <Check size={14} className="text-emerald-500 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {!hasSavedKey && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-700">
                  <span>⚠️</span>
                  <span>该供应商尚未配置 API Key，请先在「配置 API Key」标签页中添加。</span>
                </div>
              )}

              <button
                onClick={handleApplyModel}
                disabled={!selectedModel || !hasSavedKey}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-base"
              >
                应用模型设置
              </button>
            </>
          )}

          {activeTab === 'config' && (
            <>
              {/* Saved keys */}
              {!loading && savedKeys.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">已配置的 Key</label>
                  <div className="space-y-2">
                    {savedKeys.map((k: SavedKey) => (
                      <div key={k.provider} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-200">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800">{PROVIDER_MODELS[k.provider]?.label || k.provider}</div>
                          <div className="text-xs text-gray-500 font-mono mt-0.5">{k.api_key_preview}</div>
                          {k.model_name && <div className="text-[10px] text-emerald-600 mt-0.5">默认: {k.model_name}</div>}
                        </div>
                        <button
                          onClick={() => handleDeleteKey(k.provider)}
                          className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add/Update form */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                  {savedKeys.find((k: SavedKey) => k.provider === selectedProvider) ? '更新 API Key' : '新增 API Key'}
                </label>

                {/* Provider select */}
                <div className="relative">
                  <select
                    value={selectedProvider}
                    onChange={e => setSelectedProvider(e.target.value)}
                    className="w-full appearance-none px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 pr-8"
                  >
                    {Object.entries(PROVIDER_MODELS).map(([key, info]) => (
                      <option key={key} value={key}>{info.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>

                {/* API Key input — 用 type="text" + -webkit-text-security 替代 type="password"，解决 iOS WKWebView 粘贴被禁的问题 */}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={`${PROVIDER_MODELS[selectedProvider]?.label} API Key`}
                    className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-2xl text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 font-mono placeholder-gray-400"
                    style={{ WebkitTextSecurity: showKey ? 'none' : 'disc' } as React.CSSProperties}
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400"
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Base URL */}
                {(selectedProvider === 'deepseek' || selectedProvider === 'openai') && (
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    placeholder={`Base URL (可选，默认: ${PROVIDER_BASE_URL_HINT[selectedProvider]})`}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 placeholder-gray-400"
                  />
                )}

                {/* Validation result feedback */}
                {validationResult && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                    validationResult === 'ok'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    <span>{validationResult === 'ok' ? '✅ Key 验证通过，可正常使用' : '❌ Key 验证失败，请检查是否正确'}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleValidateKey}
                    disabled={validating || saving || !apiKey.trim()}
                    className="flex-1 py-3.5 font-semibold rounded-2xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] text-sm"
                  >
                    {validating ? '验证中…' : '测试 Key'}
                  </button>
                  <button
                    onClick={handleSaveKey}
                    disabled={saving || !apiKey.trim()}
                    className={`flex-[2] py-3.5 font-semibold rounded-2xl transition-all active:scale-[0.98] text-base ${
                      saveSuccess
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    {saving ? '保存中...' : saveSuccess ? '✓ 已保存' : '保存 Key'}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 text-center pb-2">
                {isOffline
                  ? 'API Key 加密存储在本机，联网时自动同步'
                  : 'API Key 存储在服务器数据库中，仅用于向对应的模型服务发起请求'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function ModelKeyModal({
  sessionId,
  currentProvider,
  currentModelName,
  onClose,
  onModelChange,
}: ModelKeyModalProps) {
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([])
  const [loading, setLoading] = useState(true)
  const { offlineMode, localUserId } = useAuthStore()
  const { connectionStatus } = useSyncStore()
  const isOffline = connectionStatus === 'offline' || offlineMode
  const isMobile = Capacitor.isNativePlatform() || window.innerWidth < 768

  // iOS viewport zoom reset: 关闭 modal 时强制还原缩放
  const handleClose = () => {
    if (isMobile) {
      const viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
      if (viewport) {
        const original = viewport.content
        viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1'
        // 短暂锁定后还原，让 iOS 有时间重置 zoom
        setTimeout(() => { viewport.content = original }, 100)
      }
    }
    onClose()
  }

  // 表单状态
  const [selectedProvider, setSelectedProvider] = useState(currentProvider || 'deepseek')
  const [selectedModel, setSelectedModel] = useState(currentModelName || '')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<'ok' | 'fail' | null>(null)
  const [activeTab, setActiveTab] = useState<'select' | 'config'>('select')

  // Desktop drag/resize state
  const MIN_W = 360
  const MIN_H = 200
  const [rect, setRect] = useState(() => {
    const w = 512
    const h = 560
    return {
      x: Math.round(window.innerWidth / 2 - w / 2),
      y: Math.round(window.innerHeight / 2 - h / 2),
      w,
      h,
    }
  })
  const modalRef = useRef<HTMLDivElement>(null)
  const action = useRef<string | null>(null)
  const startState = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 })

  const startDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea')) return
    action.current = 'drag'
    startState.current = { mx: e.clientX, my: e.clientY, ...rect }
    e.preventDefault()
  }, [rect])

  const startResize = useCallback((dir: string) => (e: React.MouseEvent) => {
    action.current = dir
    startState.current = { mx: e.clientX, my: e.clientY, ...rect }
    e.preventDefault()
    e.stopPropagation()
  }, [rect])

  useEffect(() => {
    if (isMobile) return
    const onMove = (e: MouseEvent) => {
      if (!action.current) return
      const dx = e.clientX - startState.current.mx
      const dy = e.clientY - startState.current.my
      const { x, y, w, h } = startState.current
      if (action.current === 'drag') {
        setRect(r => ({
          ...r,
          x: Math.max(0, Math.min(x + dx, window.innerWidth - r.w)),
          y: Math.max(0, Math.min(y + dy, window.innerHeight - 48)),
        }))
        return
      }
      let nx = x, ny = y, nw = w, nh = h
      if (action.current.includes('e')) nw = Math.max(MIN_W, w + dx)
      if (action.current.includes('s')) nh = Math.max(MIN_H, h + dy)
      if (action.current.includes('w')) { nw = Math.max(MIN_W, w - dx); nx = x + (w - nw) }
      if (action.current.includes('n')) { nh = Math.max(MIN_H, h - dy); ny = y + (h - nh) }
      setRect({ x: nx, y: ny, w: nw, h: nh })
    }
    const onUp = () => { action.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isMobile])

  useEffect(() => {
    loadSavedKeys()
  }, [])

  useEffect(() => {
    const models = PROVIDER_MODELS[selectedProvider]?.models || []
    if (models.length > 0 && !models.find(m => m.value === selectedModel)) {
      setSelectedModel(models[0].value)
    }
    setBaseUrl('')
    setApiKey('')
    setShowKey(false)
  }, [selectedProvider])

  const loadSavedKeys = async () => {
    try {
      setLoading(true)
      if (isOffline) {
        const userId = localUserId ?? -1
        const localKeys = await localGetApiKeys(userId)
        setSavedKeys(localKeys.map(k => ({
          provider: k.provider,
          model_name: k.model_name,
          base_url: k.base_url,
          has_key: true,
          api_key_preview: k.api_key.slice(0, 4) + '****' + k.api_key.slice(-4),
          updated_at: k.updated_at,
        })))
        return
      }
      const keys = await apiKeyApi.list()
      setSavedKeys(keys)
    } catch (e) {
      console.error('Failed to load API keys:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleValidateKey = async () => {
    if (!apiKey.trim()) return
    setValidating(true)
    setValidationResult(null)
    try {
      const key = apiKey.trim()
      const base = baseUrl.trim()
      let ok = false

      if (selectedProvider === 'deepseek' || selectedProvider === 'openai') {
        const base_url = base || (selectedProvider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com')
        const url = `${base_url.replace(/\/$/, '')}/v1/models`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })
        ok = res.status === 200 || res.status === 404 // 404 on some proxies is still auth ok
      } else if (selectedProvider === 'claude') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(10000),
        })
        ok = res.status === 200 || res.status === 529 // 529 = overloaded, but key is valid
      } else if (selectedProvider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(8000) })
        ok = res.status === 200
      }

      setValidationResult(ok ? 'ok' : 'fail')
    } catch {
      setValidationResult('fail')
    } finally {
      setValidating(false)
    }
  }

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveSuccess(false)
    setValidationResult(null)
    try {
      if (isOffline) {
        const userId = localUserId ?? -1
        await localSaveApiKey(userId, {
          provider: selectedProvider,
          api_key: apiKey.trim(),
          base_url: baseUrl.trim() || undefined,
          model_name: selectedModel || undefined,
        })
      } else {
        await apiKeyApi.save({
          provider: selectedProvider,
          api_key: apiKey.trim(),
          base_url: baseUrl.trim() || undefined,
          model_name: selectedModel || undefined,
        })
      }
      await loadSavedKeys()
      setApiKey('')
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (e) {
      console.error('Failed to save API key:', e)
      alert('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteKey = async (provider: string) => {
    if (!confirm(`确认删除 ${PROVIDER_MODELS[provider]?.label || provider} 的 API Key？`)) return
    try {
      if (isOffline) {
        const userId = localUserId ?? -1
        await localDeleteApiKey(userId, provider)
      } else {
        await apiKeyApi.remove(provider)
      }
      await loadSavedKeys()
    } catch (e) {
      console.error('Failed to delete API key:', e)
    }
  }

  const handleApplyModel = async () => {
    if (!selectedProvider || !selectedModel) return

    // 全局默认：切换任何对话都自动沿用
    localStorage.setItem('DEFAULT_PROVIDER', selectedProvider)
    localStorage.setItem('DEFAULT_MODEL', selectedModel)

    if (isOffline && sessionId) {
      // 离线模式：同时持久化到当前 session 的 SQLite 记录
      await localUpdateSession(sessionId, {
        model_provider: selectedProvider,
        model_name: selectedModel,
      }).catch(() => {})
    } else if (!isOffline && sessionId) {
      try {
        await sessionApi.updateSessionModes(sessionId, {
          model_provider: selectedProvider,
          model_name: selectedModel,
        })
      } catch (e) {
        console.error('Failed to save model to session:', e)
      }
    }

    onModelChange(selectedProvider, selectedModel)
    handleClose()
  }

  const sharedProps = {
    sessionId, currentProvider, currentModelName, onClose: handleClose, onModelChange,
    savedKeys, loading, isOffline, localUserId,
    selectedProvider, setSelectedProvider,
    selectedModel, setSelectedModel,
    apiKey, setApiKey,
    baseUrl, setBaseUrl,
    showKey, setShowKey,
    saving, saveSuccess,
    validating, validationResult,
    handleSaveKey, handleDeleteKey, handleApplyModel, handleValidateKey,
  }

  // ─── 移动端：底部 Sheet ──────────────────────────────────────────────────────
  if (isMobile) {
    return <MobileSheet {...sharedProps} />
  }

  // ─── 桌面端：可拖拽浮窗 ─────────────────────────────────────────────────────
  const currentModels = PROVIDER_MODELS[selectedProvider]?.models || []
  const hasSavedKey = savedKeys.find(k => k.provider === selectedProvider)

  const H = 6
  const C = 12
  const handles: { dir: string; style: React.CSSProperties }[] = [
    { dir: 'n',  style: { top: 0, left: C, right: C, height: H, cursor: 'n-resize' } },
    { dir: 's',  style: { bottom: 0, left: C, right: C, height: H, cursor: 's-resize' } },
    { dir: 'w',  style: { left: 0, top: C, bottom: C, width: H, cursor: 'w-resize' } },
    { dir: 'e',  style: { right: 0, top: C, bottom: C, width: H, cursor: 'e-resize' } },
    { dir: 'nw', style: { top: 0, left: 0, width: C, height: C, cursor: 'nw-resize' } },
    { dir: 'ne', style: { top: 0, right: 0, width: C, height: C, cursor: 'ne-resize' } },
    { dir: 'sw', style: { bottom: 0, left: 0, width: C, height: C, cursor: 'sw-resize' } },
    { dir: 'se', style: { bottom: 0, right: 0, width: C, height: C, cursor: 'se-resize' } },
  ]

  return createPortal(
    <div
      ref={modalRef}
      style={{ position: 'fixed', left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: 9999 }}
      className="bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
    >
      {handles.map(({ dir, style }) => (
        <div key={dir} onMouseDown={startResize(dir)} style={{ position: 'absolute', ...style, zIndex: 10 }} />
      ))}

      <div
        onMouseDown={startDrag}
        className="flex-none flex items-center justify-between px-5 py-4 bg-gradient-to-r from-emerald-50 to-cyan-50 border-b border-gray-100 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2">
          <Key size={18} className="text-emerald-600" />
          <h2 className="font-bold text-gray-800">模型 & API Key 配置</h2>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
          <X size={18} className="text-gray-500" />
        </button>
      </div>

      <div className="flex-none flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('select')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'select' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-500 hover:text-gray-700'}`}
        >
          选择模型
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'config' ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-500 hover:text-gray-700'}`}
        >
          配置 API Key
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'select' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 block">供应商</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PROVIDER_MODELS).map(([key, info]) => {
                  const hasSaved = savedKeys.find(k => k.provider === key)
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedProvider(key)}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                        selectedProvider === key ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">{info.label}</div>
                        {hasSaved && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] text-emerald-600">已配置</span>
                          </div>
                        )}
                      </div>
                      {selectedProvider === key && <Check size={14} className="text-emerald-500 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 block">模型</label>
              <div className="space-y-2">
                {currentModels.map(model => (
                  <button
                    key={model.value}
                    onClick={() => setSelectedModel(model.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      selectedModel === model.value ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{model.label}</div>
                      {model.thinking && (
                        <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                          💡 支持思考模式
                        </span>
                      )}
                    </div>
                    {selectedModel === model.value && <Check size={14} className="text-emerald-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {!hasSavedKey && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                <span>⚠️</span>
                <span>该供应商尚未配置 API Key，请先在「配置 API Key」标签页中添加。</span>
              </div>
            )}

            <button
              onClick={handleApplyModel}
              disabled={!selectedModel || !hasSavedKey}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              应用模型设置
            </button>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="space-y-4">
            {!loading && savedKeys.length > 0 && (
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 block">已配置的 Key</label>
                <div className="space-y-2">
                  {savedKeys.map(k => (
                    <div key={k.provider} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800">{PROVIDER_MODELS[k.provider]?.label || k.provider}</div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">{k.api_key_preview}</div>
                        {k.model_name && <div className="text-[10px] text-emerald-600 mt-0.5">默认: {k.model_name}</div>}
                      </div>
                      <button
                        onClick={() => handleDeleteKey(k.provider)}
                        className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block">
                {savedKeys.find(k => k.provider === selectedProvider) ? '更新 API Key' : '新增 API Key'}
              </label>

              <div className="relative">
                <select
                  value={selectedProvider}
                  onChange={e => setSelectedProvider(e.target.value)}
                  className="w-full appearance-none px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 pr-8"
                >
                  {Object.entries(PROVIDER_MODELS).map(([key, info]) => (
                    <option key={key} value={key}>{info.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={`${PROVIDER_MODELS[selectedProvider]?.label} API Key`}
                  className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 font-mono"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {(selectedProvider === 'deepseek' || selectedProvider === 'openai') && (
                <input
                  type="text"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder={`Base URL (可选，默认: ${PROVIDER_BASE_URL_HINT[selectedProvider]})`}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                />
              )}

              {validationResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${
                  validationResult === 'ok'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {validationResult === 'ok' ? '✅ Key 验证通过' : '❌ Key 验证失败，请检查'}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleValidateKey}
                  disabled={validating || saving || !apiKey.trim()}
                  className="flex-1 py-2.5 font-medium rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                >
                  {validating ? '验证中…' : '测试 Key'}
                </button>
                <button
                  onClick={handleSaveKey}
                  disabled={saving || !apiKey.trim()}
                  className={`flex-[2] py-2.5 font-semibold rounded-xl transition-all shadow-sm text-sm ${
                    saveSuccess
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {saving ? '保存中...' : saveSuccess ? '✓ 已保存' : '保存 Key'}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 text-center">
              {isOffline
                ? 'API Key 加密存储在本机，联网时自动同步'
                : 'API Key 存储在服务器数据库中，仅用于向对应的模型服务发起请求'}
            </p>
          </div>
        )}
      </div>
    </div>
  , document.body)
}
