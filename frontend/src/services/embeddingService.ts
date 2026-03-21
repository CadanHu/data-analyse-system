/**
 * embeddingService.ts
 * 支持多家 Embedding API 提供商，按用户配置的 key 调用，返回向量数组。
 * 无 key → 返回 null，上层降级到 FTS5 全文检索。
 *
 * 支持的提供商（provider 字段存于 user_api_keys 表）：
 *   qwen_embedding   — 阿里云 DashScope，无需 VPN，同 qwen key
 *   zhipu_embedding  — 智谱 AI，无需 VPN
 *   jina_embedding   — Jina AI，国内通常可直连
 *   google_embedding — Google AI Studio，需要 VPN
 */

// 每个 provider 每次最多发送的文本数（批处理上限）
const BATCH_SIZE: Record<string, number> = {
  qwen_embedding: 25,
  zhipu_embedding: 20,
  jina_embedding: 128,
  google_embedding: 100,
}

/** AbortSignal.timeout() 在 iOS WKWebView 中不可用，用此进行兼容性回退 */
function timedSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

async function embedQwen(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-v3', input: texts }),
    signal: timedSignal(30000),
  })
  if (!res.ok) throw new Error(`Qwen embedding error ${res.status}`)
  const json = await res.json()
  return (json.data as any[]).map((d: any) => d.embedding as number[])
}

async function embedZhipu(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'embedding-3', input: texts }),
    signal: timedSignal(30000),
  })
  if (!res.ok) throw new Error(`Zhipu embedding error ${res.status}`)
  const json = await res.json()
  return (json.data as any[]).map((d: any) => d.embedding as number[])
}

async function embedJina(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'jina-embeddings-v3', input: texts }),
    signal: timedSignal(30000),
  })
  if (!res.ok) throw new Error(`Jina embedding error ${res.status}`)
  const json = await res.json()
  return (json.data as any[]).map((d: any) => d.embedding as number[])
}

async function embedGoogle(texts: string[], apiKey: string): Promise<number[][]> {
  // Google Embedding API v1 supports one text per request
  const results: number[][] = []
  for (const text of texts) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } }),
        signal: timedSignal(15000),
      }
    )
    if (!res.ok) throw new Error(`Google embedding error ${res.status}`)
    const json = await res.json()
    results.push(json.embedding.values as number[])
  }
  return results
}

/** 将文本数组分批处理，避免超过 API 上限 */
async function batchCall(
  texts: string[],
  apiKey: string,
  provider: string,
  fn: (batch: string[], key: string) => Promise<number[][]>
): Promise<number[][]> {
  const size = BATCH_SIZE[provider] || 20
  const result: number[][] = []
  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size)
    const vecs = await fn(batch, apiKey)
    result.push(...vecs)
  }
  return result
}

/**
 * 生成 embedding 向量。
 * @returns 向量数组（与 texts 一一对应），失败或无 key 时返回 null
 */
export async function generateEmbeddings(
  texts: string[],
  provider: string,
  apiKey: string
): Promise<number[][] | null> {
  if (!texts.length || !apiKey) return null
  try {
    switch (provider) {
      case 'qwen_embedding':
        return await batchCall(texts, apiKey, provider, embedQwen)
      case 'zhipu_embedding':
        return await batchCall(texts, apiKey, provider, embedZhipu)
      case 'jina_embedding':
        return await batchCall(texts, apiKey, provider, embedJina)
      case 'google_embedding':
        return await batchCall(texts, apiKey, provider, embedGoogle)
      default:
        console.warn('[Embedding] Unknown provider:', provider)
        return null
    }
  } catch (e) {
    console.error('[Embedding] Failed:', e)
    return null
  }
}

/** 余弦相似度（-1 ~ 1，越大越相似） */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
