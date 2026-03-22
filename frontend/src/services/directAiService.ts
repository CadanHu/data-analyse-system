/**
 * directAiService.ts — 离线直连 AI Provider 流式调用
 * 从本地 SQLite user_api_keys 读取 API Key，直接 fetch AI 端点
 * 输出事件格式与后端 SSE 完全一致：model_thinking / summary / done / error
 */

import { Capacitor } from '@capacitor/core'
import { LocalApiKey } from './db'

export interface DirectAiOptions {
  provider: string
  model: string
  messages: { role: string; content: string }[]
  enableThinking?: boolean
  maxTokens?: number
  apiKey: LocalApiKey
  onModelThinking?: (chunk: string) => void
  onSummary?: (chunk: string) => void
  onDone?: () => void
  onError?: (msg: string) => void
  signal?: AbortSignal
}

// ==================== Provider Endpoints ====================

interface ProviderConfig {
  buildUrl: (model: string, apiKey: string) => string
  buildHeaders: (apiKey: string) => Record<string, string>
  buildBody: (opts: DirectAiOptions) => object
  parseChunk: (line: string, onThinking: (c: string) => void, onSummary: (c: string) => void) => void
  isDone: (line: string) => boolean
}

const openaiCompatible = (baseUrl: string): ProviderConfig => ({
  buildUrl: (_model, _apiKey) => `${baseUrl}/v1/chat/completions`,
  buildHeaders: (apiKey) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }),
  buildBody: (opts) => ({
    model: opts.model,
    messages: opts.messages,
    stream: true,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
  }),
  parseChunk: (line, onThinking, onSummary) => {
    if (!line.startsWith('data: ')) return
    const data = line.slice(6)
    if (data === '[DONE]') return
    try {
      const obj = JSON.parse(data)
      const delta = obj.choices?.[0]?.delta
      if (delta?.reasoning_content) onThinking(delta.reasoning_content)
      if (delta?.content) onSummary(delta.content)
    } catch { /* ignore */ }
  },
  isDone: (line) => line === 'data: [DONE]',
})

const PROVIDER_CONFIGS: Record<string, (apiKey: LocalApiKey) => ProviderConfig> = {
  openai: (k) => openaiCompatible(k.base_url || 'https://api.openai.com'),
  deepseek: (k) => openaiCompatible(k.base_url || 'https://api.deepseek.com'),
  claude: (_k) => ({
    buildUrl: () => 'https://api.anthropic.com/v1/messages',
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    buildBody: (opts) => {
      const body: any = {
        model: opts.model,
        messages: opts.messages.filter(m => m.role !== 'system'),
        system: opts.messages.find(m => m.role === 'system')?.content || undefined,
        max_tokens: opts.maxTokens ?? 8000,
        stream: true,
      }
      if (opts.enableThinking) {
        body.thinking = { type: 'enabled', budget_tokens: 5000 }
      }
      return body
    },
    parseChunk: (line, onThinking, onSummary) => {
      if (!line.startsWith('data: ')) return
      try {
        const obj = JSON.parse(line.slice(6))
        if (obj.type === 'content_block_delta') {
          if (obj.delta?.type === 'thinking_delta') onThinking(obj.delta.thinking || '')
          if (obj.delta?.type === 'text_delta') onSummary(obj.delta.text || '')
        }
      } catch { /* ignore */ }
    },
    isDone: (line) => {
      try { return JSON.parse(line.slice(6))?.type === 'message_stop' } catch { return false }
    },
  }),
  gemini: (k) => ({
    buildUrl: (model, apiKey) => {
      const isNative = Capacitor.isNativePlatform()
      const base = k.base_url || 'https://generativelanguage.googleapis.com'
      if (isNative) {
        // iOS WKWebView 的 fetch 对 SSE 流式响应有已知 bug，会抛 "Load failed"
        // 改用非流式端点，拿到完整响应后一次性 emit
        return `${base}/v1beta/models/${model}:generateContent?key=${apiKey}`
      }
      return `${base}/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`
    },
    buildHeaders: () => ({ 'Content-Type': 'application/json' }),
    buildBody: (opts) => {
      const systemMsgs = opts.messages.filter(m => m.role === 'system')
      const systemText = systemMsgs.map(m => m.content).join('\n\n')
      const body: any = {
        contents: opts.messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
      }
      if (systemText) {
        body.systemInstruction = { parts: [{ text: systemText }] }
      }
      return body
    },
    parseChunk: (line, _onThinking, onSummary) => {
      if (!line.startsWith('data: ')) return
      try {
        const obj = JSON.parse(line.slice(6))
        const text = obj.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) onSummary(text)
      } catch { /* ignore */ }
    },
    isDone: (line) => {
      try {
        const obj = JSON.parse(line.slice(6))
        return obj.candidates?.[0]?.finishReason != null
      } catch { return false }
    },
  }),
}

// ==================== Main Stream Function ====================

export async function streamDirectAi(opts: DirectAiOptions): Promise<void> {
  const configFactory = PROVIDER_CONFIGS[opts.provider]
  if (!configFactory) {
    opts.onError?.(`Unsupported provider: ${opts.provider}`)
    return
  }

  const config = configFactory(opts.apiKey)
  const url = config.buildUrl(opts.model, opts.apiKey.api_key)
  const headers = config.buildHeaders(opts.apiKey.api_key)
  const body = config.buildBody(opts)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    })

    if (!response.ok) {
      const errText = await response.text()
      opts.onError?.(`HTTP ${response.status}: ${errText}`)
      return
    }

    // iOS native: Gemini uses non-streaming generateContent endpoint
    // Parse the single JSON response directly instead of streaming
    if (opts.provider === 'gemini' && Capacitor.isNativePlatform()) {
      const json = await response.json()
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) opts.onSummary?.(text)
      opts.onDone?.()
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      opts.onError?.('No stream reader')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        config.parseChunk(
          trimmed,
          opts.onModelThinking ?? (() => {}),
          opts.onSummary ?? (() => {})
        )
        if (config.isDone(trimmed)) {
          opts.onDone?.()
          return
        }
      }
    }

    opts.onDone?.()
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    opts.onError?.(e instanceof Error ? e.message : 'Direct AI error')
  }
}
