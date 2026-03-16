import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Key, Check, Trash2, Eye, EyeOff, ChevronDown } from 'lucide-react'
import { apiKeyApi, sessionApi } from '@/api'

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

export default function ModelKeyModal({
  sessionId,
  currentProvider,
  currentModelName,
  onClose,
  onModelChange,
}: ModelKeyModalProps) {
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([])
  const [loading, setLoading] = useState(true)

  // 表单状态
  const [selectedProvider, setSelectedProvider] = useState(currentProvider || 'deepseek')
  const [selectedModel, setSelectedModel] = useState(currentModelName || '')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'select' | 'config'>('select')

  const MIN_W = 360
  const MIN_H = 200

  // 位置 & 尺寸 — 初始居中
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
  // 'drag' | 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw' | null
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
  }, [])

  useEffect(() => {
    loadSavedKeys()
  }, [])

  // 当切换供应商时，自动选择第一个模型
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
      const keys = await apiKeyApi.list()
      setSavedKeys(keys)
    } catch (e) {
      console.error('Failed to load API keys:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveSuccess(false)
    try {
      await apiKeyApi.save({
        provider: selectedProvider,
        api_key: apiKey.trim(),
        base_url: baseUrl.trim() || undefined,
        model_name: selectedModel || undefined,
      })
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
      await apiKeyApi.remove(provider)
      await loadSavedKeys()
    } catch (e) {
      console.error('Failed to delete API key:', e)
    }
  }

  const handleApplyModel = async () => {
    if (!selectedProvider || !selectedModel) return
    // 持久化到会话
    if (sessionId) {
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
    onClose()
  }

  const currentModels = PROVIDER_MODELS[selectedProvider]?.models || []
  const hasSavedKey = savedKeys.find(k => k.provider === selectedProvider)

  // resize handle 辅助
  const H = 6 // handle 厚度px
  const C = 12 // 角 handle 大小px
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
      {/* Resize handles */}
      {handles.map(({ dir, style }) => (
        <div
          key={dir}
          onMouseDown={startResize(dir)}
          style={{ position: 'absolute', ...style, zIndex: 10 }}
        />
      ))}

        {/* Header — 拖拽把手 */}
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

        {/* Tabs */}
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
              {/* Provider Selection */}
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
                          selectedProvider === key
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
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

              {/* Model Selection */}
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 block">模型</label>
                <div className="space-y-2">
                  {currentModels.map(model => (
                    <button
                      key={model.value}
                      onClick={() => setSelectedModel(model.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                        selectedModel === model.value
                          ? 'border-emerald-400 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
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
              {/* Saved keys list */}
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

              {/* Add / Update key form */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block">
                  {savedKeys.find(k => k.provider === selectedProvider) ? '更新 API Key' : '新增 API Key'}
                </label>

                {/* Provider select */}
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

                {/* API Key input */}
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

                {/* Base URL (optional) */}
                {(selectedProvider === 'deepseek' || selectedProvider === 'openai') && (
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    placeholder={`Base URL (可选，默认: ${PROVIDER_BASE_URL_HINT[selectedProvider]})`}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  />
                )}

                <button
                  onClick={handleSaveKey}
                  disabled={saving || !apiKey.trim()}
                  className={`w-full py-3 font-semibold rounded-xl transition-all shadow-sm ${
                    saveSuccess
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {saving ? '保存中...' : saveSuccess ? '✓ 保存成功' : '保存 API Key'}
                </button>
              </div>

              <p className="text-[11px] text-gray-400 text-center">
                API Key 存储在服务器数据库中，仅用于向对应的模型服务发起请求
              </p>
            </div>
          )}
        </div>
      </div>
  , document.body)
}
