/**
 * mobileKnowledgeService.ts
 * 手机端完全本地化的知识抽取与 RAG 检索。
 *
 * 架构：
 *   标准模式  → pdfjs 本地解析 → 分块 → FTS5 + 可选 embedding
 *   深度/知识  → MinerU API（用户自己的 key）→ Markdown → 分块 → FTS5 + 可选 embedding
 *   RAG 检索  → 有 embedding → 余弦相似度搜索；无 embedding → FTS5 降级
 *
 * 所有数据存储在本机 SQLite，不依赖后端服务器。
 */

import * as pdfjsLib from 'pdfjs-dist'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — pdfjs worker entry, used for main-thread fake-worker setup
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.min.mjs'
import { CapacitorHttp, Capacitor, registerPlugin } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

// ─── 原生文件上传（借用已注册的 PdfExport 插件添加 putFile 方法）──────────────
// CapacitorHttp dataType:'file' 用 InputStream+httpBodyStream，iOS 实际发 0 字节
// （OSS ETag = D41D8CD9... 即空文件 MD5）。
// PdfExportPlugin.putFile 用 URLSession.uploadTask(with:fromFile:)，
// 正确读文件、自动设 Content-Length，OSS 收到完整二进制内容。
const PdfExportBridge = registerPlugin<{
  putFile: (options: { url: string; fileUri: string }) => Promise<{ status: number }>
}>('PdfExport')
import { generateEmbeddings, cosineSimilarity } from './embeddingService'
import {
  insertKnowledgeChunk,
  searchKnowledgeFTS,
  getChunksWithEmbeddings,
  deleteDocChunks,
  saveKnowledgeGraphToDb,
  loadKnowledgeGraphFromDb,
  type KnowledgeChunk,
} from './db'
import { localGetApiKey } from './localStore'
import { streamDirectAi } from './directAiService'

// ─── 知识图谱类型 ──────────────────────────────────────────────────────────────
export interface KnowledgeEntity {
  id: string
  text: string
  type: string      // Person / Organization / Concept / Event / Location / Other
  description?: string
}

export interface KnowledgeRelation {
  id: string
  source: string    // entity id
  target: string    // entity id
  label: string     // 关系描述
}

export interface KnowledgeGraph {
  entities: KnowledgeEntity[]
  relations: KnowledgeRelation[]
  doc_name: string
  extracted_at: string
}

// ─── pdfjs worker 配置 ────────────────────────────────────────────────────────
//
// Capacitor WKWebView 无法通过 XPC 初始化 Web Worker（NSCocoaErrorDomain 4099）。
// 解决方案：用 MessageChannel 在主线程内运行 WorkerMessageHandler，
// 完全绕过 Web Worker 创建，pdfjs 通过 workerPort 与"假 Worker"通信。
//
// 参考：https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#faq-workerthread
;(function setupPdfjsFakeWorker() {
  try {
    // initializeFromPort 是 pdfjs worker 的正规入口：
    //   1. 内部创建 MessageHandler("worker", "main", port1)
    //   2. 调用 WorkerMessageHandler.setup(handler, port1)
    //   3. 发送 "ready" 握手
    // 与真实 Web Worker 完全相同的代码路径，但在主线程执行。
    const channel = new MessageChannel()
    WorkerMessageHandler.initializeFromPort(channel.port1)
    pdfjsLib.GlobalWorkerOptions.workerPort = channel.port2
  } catch {
    // 降级：回退到 workerSrc（桌面 Web 可用）
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  }
})()


// ─── 常量 ──────────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 800       // 每块字符数
const CHUNK_OVERLAP = 100    // 块间重叠字符数
const RAG_TOP_K = 5          // 检索返回的最大块数

// Embedding 提供商优先级（按实用性排序，首个配置的生效）
const EMBEDDING_PROVIDERS = ['qwen_embedding', 'zhipu_embedding', 'jina_embedding', 'google_embedding']

// 视觉 AI 提供商优先级：国内模型优先（无需 VPN，无限速问题）
const VISION_PROVIDERS = ['qwen', 'zhipu', 'openai', 'claude', 'gemini']
// 各提供商默认视觉模型
const VISION_MODELS: Record<string, string> = {
  qwen:   'qwen-vl-plus',            // 通义千问视觉（国内，有免费额度）
  zhipu:  'glm-4.6v',                // 智谱 GLM-4.6V（国内，赠送 600万 tokens）
  openai: 'gpt-4o-mini',
  claude: 'claude-3-haiku-20240307',
  gemini: 'gemini-2.0-flash',        // 需 VPN，15 RPM 免费限制
}
// 各提供商请求间隔（ms），避免触发速率限制
const VISION_REQUEST_DELAY: Record<string, number> = {
  gemini: 4500,   // 15 RPM → 每 4s 一张
  qwen:   1000,
  zhipu:  500,
  openai: 1000,
  claude: 1000,
}
const MAX_VISION_IMAGES = 20   // 单次最多处理图片数量（避免 API 消耗过多）

// ─── MinerU 完整解析结果类型 ──────────────────────────────────────────────────

interface MineruContentItem {
  type: string        // 'text' | 'table' | 'figure' | 'equation' | 'title' | ...
  text?: string
  img_path?: string   // 相对于 ZIP 根目录的路径，如 "images/figure_001.png"
  page_idx?: number
  bbox?: number[]
}

interface MineruFullResult {
  markdown: string
  contentList: MineruContentItem[]
  imageFiles: Map<string, Uint8Array>   // ZIP 内路径 → 图片字节
  otherFiles: Map<string, Uint8Array>   // 其余文件：.model.json / _middle.json / .layout.pdf 等
}

// ─── 兼容性工具：替代 AbortSignal.timeout（iOS WKWebView 不支持）────────────
/**
 * 创建一个在指定毫秒后自动 abort 的 signal。
 * AbortSignal.timeout() 在 Capacitor iOS WKWebView 上不可用，需回退到
 * AbortController + setTimeout 方式。
 */
function timedSignal(ms: number): AbortSignal {
  // 优先使用原生 API（桌面 Chrome / 新版 Safari 原生支持）
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `kc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 将长文本切成有重叠的块 */
function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 20) chunks.push(chunk)    // 过滤太短的碎片
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

/** 按标题分割 Markdown，保留层级上下文（用于 MinerU 返回的 md） */
function chunkMarkdown(markdown: string): string[] {
  const lines = markdown.split('\n')
  const sections: string[] = []
  let current: string[] = []
  let headerContext = ''

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      if (current.length > 0) {
        sections.push((headerContext ? headerContext + '\n' : '') + current.join('\n'))
      }
      headerContext = line
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) {
    sections.push((headerContext ? headerContext + '\n' : '') + current.join('\n'))
  }

  // 对过长的 section 再做二次切割
  const result: string[] = []
  for (const section of sections) {
    if (section.length <= CHUNK_SIZE) {
      if (section.trim().length > 20) result.push(section.trim())
    } else {
      result.push(...chunkText(section))
    }
  }
  return result
}

// ─── PDF 本地解析 ──────────────────────────────────────────────────────────────

/**
 * 安全地将 pdfjs TextContent.items 转为字符串数组。
 * pdfjs-dist v5 的 items 在 iOS WKWebView (JavaScriptCore) 中直接迭代会
 * 触发 Symbol.iterator 缺失错误，改用 Array.from 做安全转换。
 */
function safeExtractPageText(items: any): string {
  try {
    // 优先用 Array.from 转换（兼容 WKWebView）
    const arr: any[] = Array.from(items as ArrayLike<any>)
    return arr
      .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
  } catch {
    // 极端降级：直接 JSON stringify 后粗提取文字
    try {
      return JSON.stringify(items).replace(/"str":"([^"]*)"/g, '$1 ')
    } catch {
      return ''
    }
  }
}

/**
 * 从单页提取文字，兼容 iOS 14/15。
 *
 * pdfjs v5 的 page.getTextContent() 内部使用：
 *   for await (const value of readableStream) { ... }
 * 这依赖 ReadableStream[Symbol.asyncIterator]，该 API 在 iOS 16+(Safari 16) 才支持。
 * iOS 14/15 的 WKWebView 不支持，报 "undefined is not a function (near '...a of r...')"。
 *
 * 解决：直接调用 page.streamTextContent() 返回的 ReadableStream，
 * 用 reader.read() 循环逐块读取，完全绕过 for-await-of 语法。
 */
async function extractPageText(page: any): Promise<string> {
  const stream = page.streamTextContent({ disableNormalization: true })
  const reader = (stream as ReadableStream).getReader()
  const parts: string[] = []
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value?.items) {
        const text = safeExtractPageText(value.items)
        if (text.trim()) parts.push(text)
      }
    }
  } finally {
    reader.cancel()
  }
  return parts.join(' ')
}

/** 使用 pdfjs-dist 在浏览器/WebView 内本地提取 PDF 文本 */
async function parsePdfLocally(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    disableRange: true,
    disableStream: true,
  }).promise
  const textParts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i)
      const pageText = await extractPageText(page)
      if (pageText.trim()) textParts.push(pageText)
    } catch (pageErr) {
      const msg = pageErr instanceof Error
        ? `${pageErr.name}: ${pageErr.message}`
        : JSON.stringify(pageErr, Object.getOwnPropertyNames(pageErr as object))
      console.warn(`[PDF] 第 ${i} 页解析失败，已跳过:`, msg)
    }
  }

  return textParts.join('\n\n')
}

// ─── MinerU API 调用 ────────────────────────────────────────────────────────────

interface MineruUploadInfo {
  batch_id: string
  file_url: string
}

/**
 * 原生 HTTP GET/POST/PUT 辅助（iOS WKWebView fetch 受 CORS 沙箱限制，需走 CapacitorHttp 原生层）。
 * 非 native 平台降级到普通 fetch。
 */
async function nativeFetchJSON(url: string, method: string, headers: Record<string, string>, bodyObj?: unknown): Promise<unknown> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      method,
      url,
      headers,
      data: bodyObj,
      connectTimeout: 60000,
      readTimeout: 60000,
    })
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`)
    return res.data
  }
  const res = await fetch(url, {
    method,
    headers,
    body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
    signal: timedSignal(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function mineruGetUploadUrl(apiKey: string, fileName: string, pageRange?: string): Promise<MineruUploadInfo> {
  const fileEntry: Record<string, unknown> = { name: fileName, is_ocr: true, data_id: generateId() }
  if (pageRange) fileEntry.page_ranges = pageRange   // API 原生支持页码范围，无需前端裁剪 PDF
  const json = await nativeFetchJSON(
    'https://mineru.net/api/v4/file-urls/batch',
    'POST',
    { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    { enable_formula: true, enable_table: true, model_version: 'vlm', files: [fileEntry] }
  ) as any
  // file_urls 是字符串数组，直接取 [0]，不是对象
  const fileUrl: string = json.data.file_urls[0]
  console.log('[MinerU] upload URL:', fileUrl?.slice(0, 80), 'pageRange:', pageRange)
  return { batch_id: json.data.batch_id, file_url: fileUrl }
}

async function mineruUploadFile(uploadUrl: string, file: File): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // WKWebView fetch 对 OSS PUT 有 CORS 限制，必须走 CapacitorHttp 原生层
    // dataType:'file' 需要本地文件 URI，先写入 Cache
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // 分块转 base64，避免大文件 call stack overflow
    const CHUNK = 8192
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    const base64Data = btoa(binary)
    const tmpName = `mineru_upload_${Date.now()}.pdf`
    const written = await Filesystem.writeFile({
      path: tmpName,
      data: base64Data,
      directory: Directory.Cache,
    })
    console.log('[MinerU] tmp file URI:', written.uri, 'size:', bytes.byteLength)
    try {
      // 用 PdfExport 插件的 putFile 方法上传：URLSession.uploadTask(with:fromFile:)
      // 正确读取文件、设置 Content-Length，OSS 收到完整二进制
      const result = await PdfExportBridge.putFile({ url: uploadUrl, fileUri: written.uri })
      console.log('[MinerU] PUT status:', result.status)
    } finally {
      await Filesystem.deleteFile({ path: tmpName, directory: Directory.Cache }).catch(() => {})
    }
    return
  }
  // Web: 直接发送 ArrayBuffer，无须 Content-Type
  const buffer = await file.arrayBuffer()
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: buffer,
    signal: timedSignal(120000),
  })
  if (!res.ok) throw new Error(`MinerU file upload error ${res.status}`)
}

async function mineruPollResult(
  batchId: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal
): Promise<MineruFullResult> {
  const MAX_RETRIES = 60   // 5 min max (5s interval)
  const startTime = Date.now()
  for (let i = 0; i < MAX_RETRIES; i++) {
    await new Promise(r => setTimeout(r, 5000))
    if (signal?.aborted) throw new DOMException('用户已取消', 'AbortError')
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    const elapsedStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`

    let json: any
    try {
      json = await nativeFetchJSON(
        `https://mineru.net/api/v4/extract-results/batch/${batchId}`,
        'GET',
        { Authorization: `Bearer ${apiKey}` },
      )
    } catch {
      onProgress?.(`⏳ MinerU 解析中... 第 ${i + 1}/60 次轮询，已等待 ${elapsedStr}（网络重试中）`)
      continue
    }
    if (i < 3) console.log('[MinerU] poll raw response:', JSON.stringify(json))
    const task = json?.data?.extract_result?.[0]
    const state: string = task?.state ?? 'unknown'
    const ep = task?.extract_progress
    const progressStr = (state === 'running' && ep)
      ? ` · ${ep.extracted_pages}/${ep.total_pages} 页`
      : ''

    onProgress?.(`⏳ MinerU 解析中... 状态: ${state}${progressStr} · 已等待 ${elapsedStr}（第 ${i + 1}/60 次）`)

    if (state === 'done') {
      // 优先取直接返回的 markdown 字段（无 ZIP，无图片）
      const direct = task.content ?? task.markdown ?? task.full_markdown
      if (direct) return { markdown: direct as string, contentList: [], imageFiles: new Map() }

      // 否则下载 ZIP
      onProgress?.(`⬇️ 解析完成，下载结果中...`)
      const zipUrl: string = task.full_zip_url
      if (!zipUrl) throw new Error('MinerU done but no content or zip URL')
      let zipBuffer: ArrayBuffer
      if (Capacitor.isNativePlatform()) {
        const isAndroid = Capacitor.getPlatform() === 'android'
        let b64zip: string
        if (isAndroid) {
          // Android：Filesystem.downloadFile 会 "Connection closed by peer"（CDN 重定向问题）
          // 改用 CapacitorHttp responseType:'blob' 直接拿 base64，避免 arraybuffer bridge 序列化问题
          try {
            const dlRes = await CapacitorHttp.request({
              url: zipUrl,
              method: 'GET',
              responseType: 'blob',
            })
            if (dlRes.status < 200 || dlRes.status >= 300) {
              throw new Error(`HTTP ${dlRes.status}`)
            }
            b64zip = (dlRes.data as string).replace(/\s/g, '')
          } catch (dlErr: any) {
            const msg = dlErr?.message ?? String(dlErr)
            throw new Error('下载结果失败：' + msg)
          }
        } else {
          // iOS：Filesystem.downloadFile 工作正常，保留原有路径
          const tmpZipName = `mineru_result_${Date.now()}.zip`
          try {
            await Filesystem.downloadFile({ url: zipUrl, path: tmpZipName, directory: Directory.Cache })
          } catch (dlErr: any) {
            const msg = dlErr?.message ?? String(dlErr)
            if (msg.includes('TLS') || msg.includes('-1200') || msg.includes('SSL')) {
              throw new Error('下载结果失败：TLS 证书错误。如已开启 VPN，请关闭后重试。')
            }
            throw new Error('下载结果失败：' + msg)
          }
          try {
            const readResult = await Filesystem.readFile({ path: tmpZipName, directory: Directory.Cache })
            b64zip = (readResult.data as string).replace(/\s/g, '')
          } finally {
            await Filesystem.deleteFile({ path: tmpZipName, directory: Directory.Cache }).catch(() => {})
          }
        }
        const binary = atob(b64zip)
        const bytes = new Uint8Array(binary.length)
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j)
        zipBuffer = bytes.buffer
      } else {
        const zipRes = await fetch(zipUrl, { signal: timedSignal(60000) })
        zipBuffer = await zipRes.arrayBuffer()
      }
      return await extractMineruZip(zipBuffer)
    }
    if (state === 'failed') throw new Error('MinerU task failed: ' + (task.err_msg || ''))
  }
  throw new Error('MinerU timeout: task did not complete in 5 minutes')
}

/** 从 ZIP ArrayBuffer 中提取 MinerU 完整解析结果：markdown + content_list + 所有图片 + 其余文件 */
async function extractMineruZip(zipBuffer: ArrayBuffer): Promise<MineruFullResult> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const files = unzipSync(new Uint8Array(zipBuffer))
  let markdown = ''
  let contentList: MineruContentItem[] = []
  const imageFiles = new Map<string, Uint8Array>()
  const otherFiles = new Map<string, Uint8Array>()

  for (const [name, data] of Object.entries(files)) {
    const lname = name.toLowerCase()
    if (lname.endsWith('.md') && !markdown) {
      markdown = strFromU8(data as Uint8Array)
    } else if (lname.endsWith('_content_list.json')) {
      try { contentList = JSON.parse(strFromU8(data as Uint8Array)) } catch {}
      otherFiles.set(name, data as Uint8Array)
    } else if (/\.(png|jpg|jpeg|webp)$/i.test(lname)) {
      imageFiles.set(name, data as Uint8Array)
    } else if (lname.endsWith('.json') || lname.endsWith('.pdf')) {
      // _model.json / _middle.json / .layout.pdf 等
      otherFiles.set(name, data as Uint8Array)
    }
  }

  if (!markdown) throw new Error('MinerU ZIP: no .md file found')
  return { markdown, contentList, imageFiles, otherFiles }
}

/** 调用 MinerU API 解析 PDF，返回 Markdown 字符串 */
async function callMineruApi(
  file: File,
  apiKey: string,
  onProgress?: (step: string) => void,
  signal?: AbortSignal,
  pageRange?: string
): Promise<MineruFullResult> {
  console.log('[MinerU] step1: getting upload URL, file=', file.name, 'size=', file.size, 'pageRange=', pageRange)
  onProgress?.('正在上传到 MinerU...')
  let batch_id: string, file_url: string
  try {
    const info = await mineruGetUploadUrl(apiKey, file.name, pageRange)
    batch_id = info.batch_id
    file_url = info.file_url
    console.log('[MinerU] step1 OK, batch_id=', batch_id)
  } catch (e: any) {
    console.error('[MinerU] step1 FAILED:', e?.message, e)
    throw e
  }

  console.log('[MinerU] step2: uploading file to presigned URL')
  onProgress?.('文件上传中...')
  try {
    await mineruUploadFile(file_url, file)
    console.log('[MinerU] step2 OK')
  } catch (e: any) {
    console.error('[MinerU] step2 FAILED:', e?.message, e)
    throw e
  }

  console.log('[MinerU] step3: polling result, batch_id=', batch_id)
  onProgress?.('AI 布局分析中（OCR/公式识别），请稍候...')
  return await mineruPollResult(batch_id, apiKey, onProgress, signal)
}

// ─── 查找用户配置的 Embedding Key ─────────────────────────────────────────────

async function findEmbeddingKey(userId: number): Promise<{ provider: string; apiKey: string } | null> {
  for (const provider of EMBEDDING_PROVIDERS) {
    const keyRecord = await localGetApiKey(userId, provider)
    if (keyRecord) return { provider, apiKey: keyRecord.api_key }
  }
  return null
}

// ─── 视觉 AI：图表/图片描述 ────────────────────────────────────────────────────

async function findVisionKey(userId: number): Promise<{ provider: string; key: NonNullable<Awaited<ReturnType<typeof localGetApiKey>>> } | null> {
  for (const provider of VISION_PROVIDERS) {
    const k = await localGetApiKey(userId, provider)
    if (k) return { provider, key: k }
    // 智谱：zhipu_embedding key 与 zhipu 聊天/视觉 key 相同，可复用
    if (provider === 'zhipu') {
      const fallback = await localGetApiKey(userId, 'zhipu_embedding')
      if (fallback) return { provider: 'zhipu', key: fallback }
    }
    // 通义千问：同理
    if (provider === 'qwen') {
      const fallback = await localGetApiKey(userId, 'qwen_embedding')
      if (fallback) return { provider: 'qwen', key: fallback }
    }
  }
  return null
}

/**
 * 调用视觉 AI 描述一张图片，返回文字说明。
 * 模型固定为各提供商的视觉专用版本（VISION_MODELS），不依赖用户配置的文本模型。
 */
async function describeImageWithAI(
  imgBase64: string,
  provider: string,
  key: NonNullable<Awaited<ReturnType<typeof localGetApiKey>>>,
  itemType: string,
): Promise<string> {
  const typeLabel = itemType === 'table' ? '表格' : '图表/图片'
  const prompt = `请详细描述这个${typeLabel}中的所有数据、标签、趋势和关键信息，输出完整文字描述，便于文本搜索和问答。如果是表格，请列出所有行列数据。`
  const model = VISION_MODELS[provider] ?? 'gemini-2.0-flash'

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key.api_key}`
    const res = await nativeFetchJSON(url, 'POST', { 'Content-Type': 'application/json' }, {
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/png', data: imgBase64 } },
        { text: prompt },
      ]}],
    }) as any
    return res?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  if (provider === 'openai') {
    const baseUrl = (key as any).base_url || 'https://api.openai.com'
    const res = await nativeFetchJSON(`${baseUrl}/v1/chat/completions`, 'POST', {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.api_key}`,
    }, {
      model,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imgBase64}` } },
        { type: 'text', text: prompt },
      ]}],
      max_tokens: 1000,
    }) as any
    return res?.choices?.[0]?.message?.content ?? ''
  }

  if (provider === 'claude') {
    const res = await nativeFetchJSON('https://api.anthropic.com/v1/messages', 'POST', {
      'Content-Type': 'application/json',
      'x-api-key': key.api_key,
      'anthropic-version': '2023-06-01',
    }, {
      model, max_tokens: 1000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imgBase64 } },
        { type: 'text', text: prompt },
      ]}],
    }) as any
    return res?.content?.[0]?.text ?? ''
  }

  if (provider === 'qwen') {
    const baseUrl = (key as any).base_url || 'https://dashscope.aliyuncs.com/compatible-mode'
    const res = await nativeFetchJSON(`${baseUrl}/v1/chat/completions`, 'POST', {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.api_key}`,
    }, {
      model,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imgBase64}` } },
        { type: 'text', text: prompt },
      ]}],
      max_tokens: 1000,
    }) as any
    return res?.choices?.[0]?.message?.content ?? ''
  }

  if (provider === 'zhipu') {
    // 智谱 GLM-4V-Flash：完全免费，国内直连，OpenAI 兼容格式
    const baseUrl = (key as any).base_url || 'https://open.bigmodel.cn/api/paas/v4'
    const res = await nativeFetchJSON(`${baseUrl}/chat/completions`, 'POST', {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.api_key}`,
    }, {
      model,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imgBase64}` } },
        { type: 'text', text: prompt },
      ]}],
      max_tokens: 1000,
    }) as any
    return res?.choices?.[0]?.message?.content ?? ''
  }

  return ''
}

/** 将 Uint8Array 写入 Filesystem（分块 base64 编码） */
async function writeFileData(relPath: string, data: Uint8Array): Promise<void> {
  let binary = ''
  const CHUNK = 8192
  for (let i = 0; i < data.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...data.subarray(i, i + CHUNK))
  }
  await Filesystem.writeFile({ path: relPath, data: btoa(binary), directory: Directory.Data, recursive: true })
}

/**
 * 将 MinerU ZIP 全部解析文件保存到本地持久目录（Directory.Data）：
 *   Plan A（按文件名）: parsed/{userId}/{safeDocName}/
 *   Plan B（按会话）:  parsed_sessions/{userId}/{sessionId}/{safeDocName}/  （sessionId 非空时）
 *
 * 返回 ZIP内图片路径 → Plan A 本地相对路径 的映射（供视觉识别步骤读取）。
 */
async function saveMineruParsedOutput(
  docName: string,
  sessionId: string | null,
  userId: number,
  result: MineruFullResult,
): Promise<Map<string, string>> {
  const imageLocalPaths = new Map<string, string>()
  if (!Capacitor.isNativePlatform()) return imageLocalPaths

  const safeDocName = docName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const planA = `parsed/${userId}/${safeDocName}`
  const planB = sessionId ? `parsed_sessions/${userId}/${sessionId}/${safeDocName}` : null

  /** 写一个文件到所有目录 */
  const writeAll = async (relInZip: string, data: Uint8Array) => {
    const paths = [planA + '/' + relInZip]
    if (planB) paths.push(planB + '/' + relInZip)
    for (const p of paths) {
      try { await writeFileData(p, data) } catch (e) { console.warn('[MinerU] write failed:', p, e) }
    }
  }

  // 1. 保存 markdown
  const mdPath = `${safeDocName}.md`
  const encoder = new TextEncoder()
  await writeAll(mdPath, encoder.encode(result.markdown)).catch(e => console.warn('[MinerU] md write:', e))

  // 2. 保存图片（同时记录 Plan A 路径供视觉识别）
  for (const [imgZipPath, data] of result.imageFiles.entries()) {
    try {
      const fileName = imgZipPath.split('/').pop() ?? imgZipPath
      const relInZip = `images/${fileName}`
      const planAFull = planA + '/' + relInZip
      await writeFileData(planAFull, data)
      if (planB) {
        await writeFileData(planB + '/' + relInZip, data).catch(e => console.warn('[MinerU] planB img:', e))
      }
      imageLocalPaths.set(imgZipPath, planAFull)
    } catch (e) {
      console.warn('[MinerU] saveImage:', imgZipPath, e)
    }
  }

  // 3. 保存其余文件（model.json / middle.json / layout.pdf 等）
  for (const [zipPath, data] of result.otherFiles.entries()) {
    const fileName = zipPath.split('/').pop() ?? zipPath
    await writeAll(fileName, data).catch(e => console.warn('[MinerU] otherFile:', zipPath, e))
  }

  console.log(`[MinerU] 解析文件已存储 → Plan A: ${planA}${planB ? `  Plan B: ${planB}` : ''}`)
  return imageLocalPaths
}

// ─── PDF 页码工具 ──────────────────────────────────────────────────────────────

/** 返回 PDF 的总页数（用于在 UI 显示页码范围提示） */
export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  return doc.numPages
}

/** 用 pdf-lib 裁剪 PDF，返回只包含指定页范围的新 File（1-indexed） */
export async function extractPdfPageRange(file: File, startPage: number, endPage: number): Promise<File> {
  const { PDFDocument } = await import('pdf-lib')
  const buffer = await file.arrayBuffer()
  const srcDoc = await PDFDocument.load(buffer)
  const totalPages = srcDoc.getPageCount()
  const s = Math.max(0, startPage - 1)
  const e = Math.min(totalPages - 1, endPage - 1)
  const newDoc = await PDFDocument.create()
  const indices = Array.from({ length: e - s + 1 }, (_, i) => s + i)
  const copied = await newDoc.copyPages(srcDoc, indices)   // copyPages, not copyPagesFrom
  copied.forEach(p => newDoc.addPage(p))
  const bytes = await newDoc.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const baseName = file.name.replace(/\.pdf$/i, '')
  return new File([blob], `${baseName}_p${startPage}-${endPage}.pdf`, { type: 'application/pdf' })
}

// ─── 主流程：处理文档 ──────────────────────────────────────────────────────────

export interface ProcessOptions {
  engine: 'light' | 'pro' | 'knowledge'
  userId: number
  sessionId: string | null
  onProgress?: (msg: string) => void
  signal?: AbortSignal
  pageRange?: string   // MinerU API 原生页码范围，如 "1-5"（无需前端裁剪 PDF）
}

/**
 * 处理上传的文件，提取文本、分块、存储到本地 SQLite。
 * 自动检测用户是否配置了 Embedding Key，有则生成向量，无则仅存文本（FTS5 搜索）。
 *
 * @returns 文档摘要（前 300 字），用于显示给用户
 */
export async function processDocument(file: File, opts: ProcessOptions): Promise<string> {
  const { engine, userId, sessionId, onProgress, signal, pageRange } = opts

  // ─ Step 1: 提取文本 ──────────────────────────────────────────────────────────
  let text: string
  let mineruResult: MineruFullResult | null = null
  if (engine === 'light') {
    onProgress?.('本地解析 PDF...')
    if (file.type === 'application/pdf') {
      text = await parsePdfLocally(file)
    } else {
      text = await file.text()
    }
  } else {
    // pro / knowledge → 用 MinerU API
    const mineruKey = await localGetApiKey(userId, 'mineru')
    if (!mineruKey) {
      throw new Error('请先在设置中配置 MinerU API Key（个人中心 → 国内直连 → PDF 解析工具）')
    }
    mineruResult = await callMineruApi(file, mineruKey.api_key, onProgress, signal, pageRange)
    text = mineruResult.markdown
  }

  if (!text.trim()) throw new Error('未能从文件中提取到文本内容')

  // ─ Step 2: 分块 ────────────────────────────────────────────────────────────
  onProgress?.('文本分块处理中...')
  const isPro = engine !== 'light'
  const chunks = isPro ? chunkMarkdown(text) : chunkText(text)
  const preview = text.slice(0, 300)

  // ─ Step 3: 删除旧版本（覆盖导入）────────────────────────────────────────────
  await deleteDocChunks(userId, file.name)

  // ─ Step 4: 生成 Embedding（可选）────────────────────────────────────────────
  const embeddingConfig = await findEmbeddingKey(userId)
  let embeddings: number[][] | null = null

  if (embeddingConfig) {
    onProgress?.(`生成语义向量（${embeddingConfig.provider}）...`)
    embeddings = await generateEmbeddings(chunks, embeddingConfig.provider, embeddingConfig.apiKey)
    if (!embeddings) onProgress?.('向量生成失败，降级到关键词搜索')
  } else {
    onProgress?.('未配置 Embedding Key，使用关键词搜索（FTS5）')
  }

  // ─ Step 5: 存入 SQLite ──────────────────────────────────────────────────────
  onProgress?.(`存储 ${chunks.length} 个知识块...`)
  const now = new Date().toISOString()
  for (let i = 0; i < chunks.length; i++) {
    const chunk: KnowledgeChunk = {
      id: generateId(),
      user_id: userId,
      session_id: sessionId,
      doc_name: file.name,
      chunk_index: i,
      content: chunks[i],
      embedding: embeddings ? JSON.stringify(embeddings[i]) : null,
      embedding_provider: embeddings ? embeddingConfig!.provider : null,
      metadata: null,
      created_at: now,
    }
    await insertKnowledgeChunk(chunk)
  }

  onProgress?.(`已索引 ${chunks.length} 个知识块`)

  // ─ Step 5.5: 保存全量解析文件（仅 MinerU 模式）──────────────────────────────
  // 无论有无图片，均保存 markdown / model.json / middle.json / images/ 等到本地
  // Plan A: parsed/{userId}/{docName}/   Plan B: parsed_sessions/{userId}/{sessionId}/{docName}/
  if (mineruResult) {
    const imgCount = mineruResult.imageFiles.size
    const otherCount = mineruResult.otherFiles.size
    if (imgCount > 0 || otherCount > 0) {
      onProgress?.(`保存解析文件到本地 (${imgCount} 张图片，${otherCount} 个结构文件)...`)
    } else {
      onProgress?.('保存解析 Markdown 到本地...')
    }
    const localImagePaths = await saveMineruParsedOutput(file.name, sessionId, userId, mineruResult)

    // ─ 图表视觉识别（有图片时执行）─────────────────────────────────────────────
    if (imgCount > 0) {
      const visionCfg = await findVisionKey(userId)
      if (visionCfg) {
        // 优先用 content_list 中的 figure/table 条目；无则处理全部图片
        const imageItems: { img_path: string; type: string; page_idx: number }[] =
          mineruResult.contentList.filter(c => (c.type === 'figure' || c.type === 'table') && c.img_path)
            .map(c => ({ img_path: c.img_path!, type: c.type, page_idx: c.page_idx ?? 0 }))

        const toProcess = imageItems.length > 0
          ? imageItems
          : [...mineruResult.imageFiles.keys()].map(k => ({ img_path: k, type: 'figure', page_idx: 0 }))

        const limited = toProcess.slice(0, MAX_VISION_IMAGES)
        onProgress?.(`图表 AI 识别中 (${limited.length}/${toProcess.length} 张, ${visionCfg.provider})...`)

        let visionCount = 0
        for (let vi = 0; vi < limited.length; vi++) {
          const item = limited[vi]
          const localPath = localImagePaths.get(item.img_path)
          if (!localPath) continue
          try {
            onProgress?.(`图表识别 ${vi + 1}/${limited.length}...`)
            const readResult = await Filesystem.readFile({ path: localPath, directory: Directory.Data })
            const imgBase64 = (readResult.data as string).replace(/\s/g, '')
            // Capacitor Bridge 传输大 base64 payload 有限制，超过 ~1MB base64 跳过
            if (imgBase64.length > 1_000_000) {
              console.warn('[Vision] skip oversized image (>1MB base64):', item.img_path)
              continue
            }
            // 请求间隔：避免触发速率限制（Gemini 免费额度 15 RPM，每 4.5s 一张）
            if (vi > 0) {
              const delay = VISION_REQUEST_DELAY[visionCfg.provider] ?? 1000
              await new Promise(r => setTimeout(r, delay))
            }
            // 单张图片识别最多等 45 秒，超时跳过而不卡整个流程
            const descriptionPromise = describeImageWithAI(imgBase64, visionCfg.provider, visionCfg.key, item.type)
            const timeoutPromise = new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('vision timeout')), 45000)
            )
            const description = await Promise.race([descriptionPromise, timeoutPromise])
            if (!description.trim()) continue
            const typeLabel = item.type === 'table' ? '表格' : '图表'
            await insertKnowledgeChunk({
              id: generateId(),
              user_id: userId,
              session_id: sessionId,
              doc_name: file.name,
              chunk_index: chunks.length + visionCount,
              content: `[${typeLabel} · 第 ${item.page_idx + 1} 页]\n${description}`,
              embedding: null,
              embedding_provider: null,
              metadata: JSON.stringify({ type: item.type, page: item.page_idx, image_path: localPath }),
              created_at: now,
            })
            visionCount++
          } catch (e) {
            console.warn('[Vision] failed:', item.img_path, e)
          }
        }
        if (visionCount > 0) onProgress?.(`图表识别完成，新增 ${visionCount} 个视觉知识块`)
      } else {
        onProgress?.('未配置视觉 AI Key（Gemini/OpenAI/Claude/Qwen），图片已保存本地但跳过识别')
      }
    }
  }

  // ─ Step 6: 知识图谱抽取（仅 knowledge 模式，且用户有 LLM key）─────────────
  if (engine === 'knowledge') {
    await extractKnowledgeGraph(userId, file.name, chunks.slice(0, 20), onProgress)
  }

  onProgress?.('完成！')
  return preview
}

// ─── 知识图谱抽取 ──────────────────────────────────────────────────────────────

/** 调用用户的 LLM，从文本块中抽取实体和关系，构建知识图谱 */
async function extractKnowledgeGraph(
  userId: number,
  docName: string,
  chunks: string[],
  onProgress?: (msg: string) => void
): Promise<KnowledgeGraph | null> {
  // 找用户配置的 LLM key（优先国内：deepseek、qwen、minimax）
  const LLM_PROVIDERS = ['deepseek', 'qwen', 'minimax', 'openai', 'gemini', 'claude']
  let llmKey = null
  let llmProvider = ''
  for (const p of LLM_PROVIDERS) {
    llmKey = await localGetApiKey(userId, p)
    if (llmKey) { llmProvider = p; break }
  }
  if (!llmKey) {
    onProgress?.('未找到 LLM Key，跳过知识图谱抽取')
    return null
  }

  onProgress?.('知识图谱抽取中（实体/关系识别）...')

  const combinedText = chunks.join('\n\n').slice(0, 6000)
  const prompt = `请从以下文本中抽取关键实体和它们之间的关系，用于构建知识图谱。

文本内容：
"""
${combinedText}
"""

请严格输出 JSON 格式（不要有任何其他文字）：
{
  "entities": [
    {"id": "e1", "text": "实体名称", "type": "Person|Organization|Concept|Event|Location|Other", "description": "简短描述（可选）"}
  ],
  "relations": [
    {"id": "r1", "source": "e1", "target": "e2", "label": "关系描述"}
  ]
}

要求：
- 实体数量 5-20 个，选最重要的
- 关系数量 5-15 个，只包含确定存在的关系
- id 从 e1/r1 开始递增
- 类型只能是 Person/Organization/Concept/Event/Location/Other 之一`

  let rawJson = ''
  try {
    await streamDirectAi({
      provider: llmProvider,
      model: llmKey.model_name || (llmProvider === 'deepseek' ? 'deepseek-chat' : llmProvider === 'qwen' ? 'qwen-plus' : 'gpt-4o-mini'),
      messages: [{ role: 'user', content: prompt }],
      apiKey: llmKey,
      enableThinking: false,
      maxTokens: 2000,
      onSummary: (chunk) => { rawJson += chunk },
      onDone: () => {},
      onError: (e) => { throw new Error(e) },
    })

    // 提取 JSON（防止模型输出多余文字）
    const match = rawJson.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON found')
    const parsed = JSON.parse(match[0])

    const graph: KnowledgeGraph = {
      entities: parsed.entities || [],
      relations: parsed.relations || [],
      doc_name: docName,
      extracted_at: new Date().toISOString(),
    }

    // localStorage 缓存（快速读取）
    const key = `kg_${docName}_${userId}`
    localStorage.setItem(key, JSON.stringify(graph))

    // SQLite 持久化（App 重装后恢复）
    await saveKnowledgeGraphToDb(docName, userId, graph.entities, graph.relations)

    console.log('[KG] 抽取完成，rawJson 长度:', rawJson.length, '实体:', graph.entities.length, '关系:', graph.relations.length)
    console.log('[KG] 实体列表:', JSON.stringify(graph.entities.map(e => e.text)))
    onProgress?.(`知识图谱构建完成（${graph.entities.length} 实体，${graph.relations.length} 关系）`)
    return graph
  } catch (e) {
    console.error('[KG] 抽取失败，rawJson:', rawJson, '错误:', e)
    onProgress?.('知识图谱抽取失败（不影响 RAG 检索）')
    return null
  }
}

/** 从 localStorage 加载某文档的知识图谱（同步，仅供当次抽取后立即检查用） */
export function loadKnowledgeGraph(docName: string, userId: number): KnowledgeGraph | null {
  try {
    const key = `kg_${docName}_${userId}`
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** 异步加载知识图谱：先查 localStorage，没有则从 SQLite 恢复（App 重装后） */
export async function loadKnowledgeGraphAsync(docName: string, userId: number): Promise<KnowledgeGraph | null> {
  const cached = loadKnowledgeGraph(docName, userId)
  if (cached) return cached
  try {
    const dbData = await loadKnowledgeGraphFromDb(docName, userId)
    if (!dbData) return null
    const graph: KnowledgeGraph = {
      entities: dbData.entities,
      relations: dbData.relations,
      doc_name: docName,
      extracted_at: '',
    }
    // 回写 localStorage 供后续同步读取
    localStorage.setItem(`kg_${docName}_${userId}`, JSON.stringify(graph))
    return graph
  } catch {
    return null
  }
}

// ─── RAG 检索 ──────────────────────────────────────────────────────────────────

/**
 * 搜索本地知识库，返回最相关的内容作为 AI 上下文。
 * 策略：
 *   1. 尝试向量相似度搜索（如果有 embedding）
 *   2. 降级到 FTS5 关键词搜索
 */
export async function searchKnowledge(
  userId: number,
  sessionId: string | null,
  query: string
): Promise<string> {
  let chunks: KnowledgeChunk[] = []

  // ── 策略 1：向量搜索 ────────────────────────────────────────────────────────
  const embeddingConfig = await findEmbeddingKey(userId)
  if (embeddingConfig) {
    try {
      const queryVec = await generateEmbeddings([query], embeddingConfig.provider, embeddingConfig.apiKey)
      if (queryVec?.[0]) {
        const allChunks = await getChunksWithEmbeddings(userId, sessionId)
        if (allChunks.length > 0) {
          const scored = allChunks
            .map(c => ({
              chunk: c,
              score: cosineSimilarity(queryVec[0], JSON.parse(c.embedding!)),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, RAG_TOP_K)
          chunks = scored.map(s => s.chunk)
        }
      }
    } catch {
      // 向量搜索失败，降级
    }
  }

  // ── 策略 2：FTS5 降级 ───────────────────────────────────────────────────────
  if (chunks.length === 0) {
    chunks = await searchKnowledgeFTS(userId, sessionId, query, RAG_TOP_K)
  }

  if (chunks.length === 0) return ''

  const context = chunks
    .map((c, i) => `[${i + 1}] (来自《${c.doc_name}》)\n${c.content}`)
    .join('\n\n---\n\n')

  return `以下是从用户本地知识库中检索到的相关内容：\n\n${context}`
}

/**
 * 判断当前 session 是否有本地知识（有知识块则启用 RAG）
 */
export async function hasLocalKnowledge(userId: number, sessionId: string | null): Promise<boolean> {
  try {
    const ftsResult = await searchKnowledgeFTS(userId, sessionId, '*', 1)
    return ftsResult.length > 0
  } catch {
    return false
  }
}
