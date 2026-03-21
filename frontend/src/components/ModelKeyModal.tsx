import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Key, Check, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
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

// ─── 大模型供应商 ──────────────────────────────────────────────────────────────
const PROVIDER_MODELS: Record<string, {
  label: string
  vpn: boolean
  baseUrlHint?: string
  getKeyUrl: string
  freeTier?: string
  models: { value: string; label: string; thinking?: boolean }[]
}> = {
  deepseek: {
    label: 'DeepSeek',
    vpn: false,
    baseUrlHint: 'https://api.deepseek.com',
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
    freeTier: '有免费额度',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek V3 (标准)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek R1 (思考)', thinking: true },
    ],
  },
  qwen: {
    label: '通义千问 Qwen',
    vpn: false,
    baseUrlHint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    getKeyUrl: 'https://bailian.console.aliyun.com/',
    freeTier: '有免费额度',
    models: [
      { value: 'qwq-32b', label: 'QwQ-32B (思考)', thinking: true },
      { value: 'qwen-max', label: 'Qwen-Max 旗舰' },
      { value: 'qwen-plus', label: 'Qwen-Plus (免费额度)' },
      { value: 'qwen-turbo', label: 'Qwen-Turbo 极速 (免费额度)' },
    ],
  },
  minimax: {
    label: 'MiniMax',
    vpn: false,
    baseUrlHint: 'https://api.minimax.chat/v1',
    getKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    freeTier: '注册送额度',
    models: [
      { value: 'MiniMax-Text-01', label: 'MiniMax Text-01 旗舰' },
      { value: 'abab6.5s-chat', label: 'ABAB 6.5S 标准' },
    ],
  },
  openai: {
    label: 'OpenAI',
    vpn: true,
    baseUrlHint: 'https://api.openai.com/v1',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini 轻量' },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    vpn: true,
    getKeyUrl: 'https://aistudio.google.com/apikey',
    freeTier: '免费额度充足',
    models: [
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (思考)', thinking: true },
      { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite 超轻量' },
      { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash 图像生成' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    ],
  },
  claude: {
    label: 'Anthropic Claude',
    vpn: true,
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
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

// ─── Embedding 供应商（向量搜索，用于知识抽取 RAG）────────────────────────────
const EMBEDDING_PROVIDERS: Record<string, {
  label: string
  vpn: boolean
  getKeyUrl: string
  description: string
  freeTier: string
}> = {
  qwen_embedding: {
    label: 'Qwen Embedding',
    vpn: false,
    getKeyUrl: 'https://bailian.console.aliyun.com/',
    description: '与通义千问同一个 Key，无需额外申请',
    freeTier: '1M tokens/天免费',
  },
  zhipu_embedding: {
    label: '智谱 Embedding',
    vpn: false,
    getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    description: '支持中文语义，效果优秀',
    freeTier: '有免费额度',
  },
  jina_embedding: {
    label: 'Jina AI Embedding',
    vpn: false,
    getKeyUrl: 'https://jina.ai/',
    description: '国内通常可直连，无需 VPN',
    freeTier: '1M tokens/月免费',
  },
  google_embedding: {
    label: 'Google Embedding',
    vpn: true,
    getKeyUrl: 'https://aistudio.google.com/apikey',
    description: '与 Gemini 同一个 Key，质量高',
    freeTier: '1500次/天免费',
  },
}

// ─── 特殊工具 Key ──────────────────────────────────────────────────────────────
const SPECIAL_PROVIDERS: Record<string, {
  label: string
  vpn: boolean
  getKeyUrl: string
  description: string
  placeholder: string
  freeTier: string
}> = {
  mineru: {
    label: 'MinerU PDF 解析',
    vpn: false,
    getKeyUrl: 'https://mineru.net/',
    description: '用于深度模式和知识抽取，免费注册即可',
    placeholder: 'MinerU API Key（个人中心 → API Key）',
    freeTier: '免费注册',
  },
}

// ─── 验证逻辑 ──────────────────────────────────────────────────────────────────
async function validateProviderKey(providerKey: string, apiKey: string, baseUrl?: string): Promise<boolean> {
  const key = apiKey.trim()
  const base = (baseUrl || '').trim()
  try {
    if (providerKey === 'deepseek') {
      const url = `${base || 'https://api.deepseek.com'}/v1/models`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })
      return res.status === 200 || res.status === 404
    }
    if (providerKey === 'openai') {
      const url = `${base || 'https://api.openai.com'}/v1/models`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })
      return res.status === 200 || res.status === 404
    }
    if (providerKey === 'qwen' || providerKey === 'qwen_embedding') {
      const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models'
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })
      return res.status === 200 || res.status === 404
    }
    if (providerKey === 'minimax') {
      const res = await fetch('https://api.minimax.chat/v1/models', {
        headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000),
      })
      return res.status !== 401 && res.status !== 403
    }
    if (providerKey === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'x-api-key': key,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        signal: AbortSignal.timeout(10000),
      })
      return res.status === 200 || res.status === 529
    }
    if (providerKey === 'gemini' || providerKey === 'google_embedding') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(8000) })
      return res.status === 200
    }
    if (providerKey === 'mineru') {
      const res = await fetch('https://mineru.net/api/v4/file-urls/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ files: [] }),
        signal: AbortSignal.timeout(8000),
      })
      return res.status !== 401 && res.status !== 403
    }
    if (providerKey === 'jina_embedding') {
      const res = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ input: ['test'], model: 'jina-embeddings-v3' }),
        signal: AbortSignal.timeout(8000),
      })
      return res.status === 200 || res.status === 402
    }
    // Default: basic format check
    return key.length > 8
  } catch {
    return false
  }
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

// ─── 单个 Key 卡片（可展开） ───────────────────────────────────────────────────
function KeyCard({
  providerKey, label, description, freeTier, getKeyUrl, placeholder, showBaseUrl,
  savedKeys, isOffline, localUserId, onSaved,
}: {
  providerKey: string
  label: string
  description?: string
  freeTier?: string
  getKeyUrl: string
  placeholder?: string
  showBaseUrl?: boolean
  savedKeys: SavedKey[]
  isOffline: boolean
  localUserId: number
  onSaved: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<'ok' | 'fail' | null>(null)

  const saved = savedKeys.find(k => k.provider === providerKey)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`确认删除 ${label} 的 API Key？`)) return
    try {
      if (isOffline) {
        await localDeleteApiKey(localUserId ?? -1, providerKey)
      } else {
        await apiKeyApi.remove(providerKey)
      }
      onSaved()
    } catch (err) {
      console.error('Failed to delete key:', err)
    }
  }

  const handleValidate = async () => {
    if (!apiKey.trim()) return
    setValidating(true)
    setValidationResult(null)
    const ok = await validateProviderKey(providerKey, apiKey, baseUrl)
    setValidationResult(ok ? 'ok' : 'fail')
    setValidating(false)
  }

  const handleSave = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveSuccess(false)
    setValidationResult(null)
    try {
      if (isOffline) {
        await localSaveApiKey(localUserId ?? -1, {
          provider: providerKey,
          api_key: apiKey.trim(),
          base_url: baseUrl.trim() || undefined,
          model_name: undefined,
        })
      } else {
        await apiKeyApi.save({
          provider: providerKey,
          api_key: apiKey.trim(),
          base_url: baseUrl.trim() || undefined,
          model_name: undefined,
        })
      }
      setApiKey('')
      setSaveSuccess(true)
      onSaved()
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch {
      alert('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${saved ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}>
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-3 p-3 text-left active:bg-gray-50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{label}</span>
            {freeTier && (
              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-md text-[10px] font-medium">{freeTier}</span>
            )}
          </div>
          {description && <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>}
          {saved && (
            <div className="text-[10px] text-emerald-600 font-mono mt-0.5">已配置 · {saved.api_key_preview}</div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {saved && (
            <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-3">
          <a
            href={getKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 underline"
          >
            <ExternalLink size={11} />
            获取 {label} API Key（官方）
          </a>

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
              placeholder={placeholder || `粘贴 ${label} API Key`}
              className="w-full px-3 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 font-mono placeholder-gray-400"
              style={{ WebkitTextSecurity: showKey ? 'none' : 'disc' } as React.CSSProperties}
            />
            <button onClick={() => setShowKey(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400">
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {showBaseUrl && (
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder={`Base URL（可选，默认: ${PROVIDER_MODELS[providerKey]?.baseUrlHint || ''}）`}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 placeholder-gray-400"
            />
          )}

          {validationResult && (
            <div className={`px-3 py-2 rounded-xl text-xs ${
              validationResult === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {validationResult === 'ok' ? '✅ Key 验证通过，可正常使用' : '❌ Key 验证失败，请检查是否正确'}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleValidate}
              disabled={validating || saving || !apiKey.trim()}
              className="flex-1 py-2.5 font-medium rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-xs transition-all active:scale-[0.98]"
            >
              {validating ? '验证中…' : '测试 Key'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className={`flex-[2] py-2.5 font-semibold rounded-xl text-sm transition-all active:scale-[0.98] ${
                saveSuccess
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {saving ? '保存中...' : saveSuccess ? '✓ 已保存' : '保存 Key'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Key 配置面板（某一 VPN 区域的所有服务） ───────────────────────────────────
function KeyConfigPanel({ vpn, savedKeys, isOffline, localUserId, onSaved }: {
  vpn: boolean
  savedKeys: SavedKey[]
  isOffline: boolean
  localUserId: number
  onSaved: () => void
}) {
  const llmProviders = Object.entries(PROVIDER_MODELS).filter(([, info]) => info.vpn === vpn)
  const embeddingProviders = Object.entries(EMBEDDING_PROVIDERS).filter(([, info]) => info.vpn === vpn)
  const specialProviders = Object.entries(SPECIAL_PROVIDERS).filter(([, info]) => info.vpn === vpn)
  const sharedProps = { savedKeys, isOffline, localUserId, onSaved }

  return (
    <div className="space-y-5">
      {llmProviders.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">大语言模型</div>
          <div className="space-y-2">
            {llmProviders.map(([key, info]) => (
              <KeyCard
                key={key}
                providerKey={key}
                label={info.label}
                freeTier={info.freeTier}
                getKeyUrl={info.getKeyUrl}
                showBaseUrl={!!info.baseUrlHint}
                {...sharedProps}
              />
            ))}
          </div>
        </div>
      )}

      {specialProviders.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">PDF 解析工具</div>
          <div className="space-y-2">
            {specialProviders.map(([key, info]) => (
              <KeyCard
                key={key}
                providerKey={key}
                label={info.label}
                description={info.description}
                freeTier={info.freeTier}
                getKeyUrl={info.getKeyUrl}
                placeholder={info.placeholder}
                {...sharedProps}
              />
            ))}
          </div>
        </div>
      )}

      {embeddingProviders.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">向量搜索 Embedding（知识抽取用）</div>
          <div className="space-y-2">
            {embeddingProviders.map(([key, info]) => (
              <KeyCard
                key={key}
                providerKey={key}
                label={info.label}
                description={info.description}
                freeTier={info.freeTier}
                getKeyUrl={info.getKeyUrl}
                {...sharedProps}
              />
            ))}
          </div>
        </div>
      )}

      {llmProviders.length === 0 && embeddingProviders.length === 0 && specialProviders.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-10">暂无此类别服务</div>
      )}
    </div>
  )
}

// ─── 移动端全屏 Sheet ──────────────────────────────────────────────────────────
function MobileSheet({
  onClose, savedKeys, loading, isOffline, localUserId,
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  handleApplyModel, onReloadKeys,
}: any) {
  const [activeTab, setActiveTab] = useState<'select' | 'domestic' | 'vpn'>('select')
  const currentModels = PROVIDER_MODELS[selectedProvider]?.models || []
  const hasSavedKey = savedKeys.find((k: SavedKey) => k.provider === selectedProvider)

  const tabs = [
    { key: 'select', label: '选择模型' },
    { key: 'domestic', label: '🇨🇳 国内直连' },
    { key: 'vpn', label: '🌐 需要VPN' },
  ] as const

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative mt-auto bg-white rounded-t-3xl flex flex-col"
        style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex-none flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-emerald-600" />
            <h2 className="font-bold text-gray-800 text-base">模型 & API Key 配置</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-none flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-xs font-medium whitespace-nowrap px-2 transition-colors ${
                activeTab === tab.key ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'select' && (
            <>
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
                          {info.vpn && <div className="text-[9px] text-orange-500 mt-0.5">需要VPN</div>}
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
                  <span>该供应商尚未配置 API Key，请在「国内直连」或「需要VPN」标签页中添加。</span>
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

          {activeTab === 'domestic' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700">
                <span>✅</span>
                <span>以下服务无需科学上网，国内直连可用</span>
              </div>
              {loading ? (
                <div className="text-center text-gray-400 py-8 text-sm">加载中…</div>
              ) : (
                <KeyConfigPanel vpn={false} savedKeys={savedKeys} isOffline={isOffline} localUserId={localUserId} onSaved={onReloadKeys} />
              )}
              <p className="text-[11px] text-gray-400 text-center pb-2">
                {isOffline ? 'API Key 加密存储在本机，联网时自动同步' : 'API Key 存储在服务器，仅用于向对应服务发起请求'}
              </p>
            </>
          )}

          {activeTab === 'vpn' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                <span>🌐</span>
                <span>以下服务在中国大陆需要科学上网才能访问</span>
              </div>
              {loading ? (
                <div className="text-center text-gray-400 py-8 text-sm">加载中…</div>
              ) : (
                <KeyConfigPanel vpn={true} savedKeys={savedKeys} isOffline={isOffline} localUserId={localUserId} onSaved={onReloadKeys} />
              )}
              <p className="text-[11px] text-gray-400 text-center pb-2">
                {isOffline ? 'API Key 加密存储在本机，联网时自动同步' : 'API Key 存储在服务器，仅用于向对应服务发起请求'}
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

  const handleClose = () => {
    if (isMobile) {
      const viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
      if (viewport) {
        const original = viewport.content
        viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1'
        setTimeout(() => { viewport.content = original }, 100)
      }
    }
    onClose()
  }

  const [selectedProvider, setSelectedProvider] = useState(currentProvider || 'deepseek')
  const [selectedModel, setSelectedModel] = useState(currentModelName || '')
  const [activeTab, setActiveTab] = useState<'select' | 'domestic' | 'vpn'>('select')

  // Desktop drag/resize
  const MIN_W = 540
  const MIN_H = 200
  const [rect, setRect] = useState(() => {
    const w = 560
    const h = 600
    return { x: Math.round(window.innerWidth / 2 - w / 2), y: Math.round(window.innerHeight / 2 - h / 2), w, h }
  })
  const modalRef = useRef<HTMLDivElement>(null)
  const action = useRef<string | null>(null)
  const startState = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 })

  const startDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return
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
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isMobile])

  useEffect(() => { loadSavedKeys() }, [])

  useEffect(() => {
    const models = PROVIDER_MODELS[selectedProvider]?.models || []
    if (models.length > 0 && !models.find(m => m.value === selectedModel)) {
      setSelectedModel(models[0].value)
    }
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

  const handleApplyModel = async () => {
    if (!selectedProvider || !selectedModel) return
    localStorage.setItem('DEFAULT_PROVIDER', selectedProvider)
    localStorage.setItem('DEFAULT_MODEL', selectedModel)

    if (isOffline && sessionId) {
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
    sessionId, currentProvider, currentModelName,
    onClose: handleClose, onModelChange,
    savedKeys, loading, isOffline, localUserId: localUserId ?? -1,
    selectedProvider, setSelectedProvider,
    selectedModel, setSelectedModel,
    handleApplyModel,
    onReloadKeys: loadSavedKeys,
  }

  if (isMobile) {
    return <MobileSheet {...sharedProps} />
  }

  // ─── 桌面端：可拖拽浮窗 ─────────────────────────────────────────────────────
  const currentModels = PROVIDER_MODELS[selectedProvider]?.models || []
  const hasSavedKey = savedKeys.find(k => k.provider === selectedProvider)

  const H = 6; const C = 12
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

  const desktopTabs = [
    { key: 'select', label: '选择模型' },
    { key: 'domestic', label: '🇨🇳 国内直连' },
    { key: 'vpn', label: '🌐 需要VPN' },
  ] as const

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
        {desktopTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'select' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 block">供应商</label>
              <div className="grid grid-cols-3 gap-2">
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
                        <div className="text-xs font-semibold text-gray-800 truncate">{info.label}</div>
                        {info.vpn && <div className="text-[9px] text-orange-500 mt-0.5">需要VPN</div>}
                        {hasSaved && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] text-emerald-600">已配置</span>
                          </div>
                        )}
                      </div>
                      {selectedProvider === key && <Check size={12} className="text-emerald-500 flex-shrink-0" />}
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
                <span>该供应商尚未配置 API Key，请在「国内直连」或「需要VPN」标签页中添加。</span>
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

        {activeTab === 'domestic' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700">
              <span>✅</span>
              <span>以下服务无需科学上网，中国大陆直连可用</span>
            </div>
            {loading ? (
              <div className="text-center text-gray-400 py-8 text-sm">加载中…</div>
            ) : (
              <KeyConfigPanel vpn={false} savedKeys={savedKeys} isOffline={isOffline} localUserId={localUserId ?? -1} onSaved={loadSavedKeys} />
            )}
            <p className="text-[11px] text-gray-400 text-center">
              {isOffline ? 'API Key 加密存储在本机，联网时自动同步' : 'API Key 存储在服务器数据库中，仅用于向对应的模型服务发起请求'}
            </p>
          </div>
        )}

        {activeTab === 'vpn' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
              <span>🌐</span>
              <span>以下服务在中国大陆需要科学上网才能正常访问</span>
            </div>
            {loading ? (
              <div className="text-center text-gray-400 py-8 text-sm">加载中…</div>
            ) : (
              <KeyConfigPanel vpn={true} savedKeys={savedKeys} isOffline={isOffline} localUserId={localUserId ?? -1} onSaved={loadSavedKeys} />
            )}
            <p className="text-[11px] text-gray-400 text-center">
              {isOffline ? 'API Key 加密存储在本机，联网时自动同步' : 'API Key 存储在服务器数据库中，仅用于向对应的模型服务发起请求'}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
