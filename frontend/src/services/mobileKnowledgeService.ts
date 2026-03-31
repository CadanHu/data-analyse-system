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
  markDocChunksDirty,
  searchKnowledgeFTS,
  getChunksWithEmbeddings,
  deleteDocChunks,
  saveKnowledgeGraphToDb,
  loadKnowledgeGraphFromDb,
  getGraphDocIdsForSession,
  findEntitiesInText,
  findRelationsForEntityNames,
  saveCommunitiesToDb,
  type KnowledgeChunk,
} from './db'
import { localGetApiKey } from './localStore'
import { streamDirectAi } from './directAiService'
import { getBaseURL } from '../api'
import { useAuthStore } from '../stores/authStore'

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
; (function setupPdfjsFakeWorker() {
  try {
    // initializeFromPort 是 pdfjs worker 的正规入口：
    //   1. 内部创建 MessageHandler("worker", "main", port1)
    //   2. 调用 WorkerMessageHandler.setup(handler, port1)
    //   3. 发送 "ready" 握手
    // 与真实 Web Worker 完全相同的代码路径，但在主线程执行。
    const channel = new MessageChannel()
    WorkerMessageHandler.initializeFromPort(channel.port1)
    pdfjsLib.GlobalWorkerOptions.workerPort = channel.port2 as any
  } catch {
    // 降级：回退到 workerSrc（桌面 Web 可用）
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  }
})()


// ─── 常量 ──────────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 800       // 每块字符数
const CHUNK_OVERLAP = 200    // 上文衔接字符数
const RAG_TOP_K = 5          // 检索返回的最大块数

// Embedding 提供商优先级（按实用性排序，首个配置的生效）
const EMBEDDING_PROVIDERS = ['qwen_embedding', 'zhipu_embedding', 'jina_embedding', 'google_embedding']

// 视觉 LLM provider 配置表（顺序 = 降级优先级，与后端 _VISION_PROVIDER_TABLE 对齐）
// call_type: 'openai' = OpenAI 兼容格式（Bearer Auth）；'gemini' = Gemini 原生；'claude' = Anthropic 原生
interface VisionProviderEntry {
  provider: string
  base_url: string
  vision_model: string
  call_type: 'openai' | 'gemini' | 'claude'
  request_delay_ms: number  // 速率限制间隔
}
const VISION_PROVIDER_TABLE: VisionProviderEntry[] = [
  // ── 国内直连（国内优先，无需 VPN）──────────────────────────────────────────────
  { provider: 'zhipu', base_url: 'https://open.bigmodel.cn/api/paas/v4', vision_model: 'glm-4.6v-flash', call_type: 'openai', request_delay_ms: 500 },
  { provider: 'zhipu', base_url: 'https://open.bigmodel.cn/api/paas/v4', vision_model: 'glm-4.6v', call_type: 'openai', request_delay_ms: 500 },
  { provider: 'qwen', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', vision_model: 'qwen3-vl-plus', call_type: 'openai', request_delay_ms: 1000 },
  { provider: 'doubao', base_url: 'https://ark.volcengineapi.com/api/v3', vision_model: 'doubao-seed-2.0-lite', call_type: 'openai', request_delay_ms: 500 },
  { provider: 'hunyuan', base_url: 'https://api.hunyuan.cloud.tencent.com/v1', vision_model: 'hunyuan-vision', call_type: 'openai', request_delay_ms: 500 },
  { provider: 'baidu', base_url: 'https://aistudio.baidu.com/llm/lmapi/v3', vision_model: 'ERNIE-4.5-VL', call_type: 'openai', request_delay_ms: 500 },
  { provider: 'kimi', base_url: 'https://api.moonshot.cn/v1', vision_model: 'kimi-k2.5', call_type: 'openai', request_delay_ms: 1000 },
  { provider: 'sensenova', base_url: 'https://api.sensenova.cn/v1', vision_model: 'SenseNova-V6.5-Turbo', call_type: 'openai', request_delay_ms: 500 },
  // ── 海外（需 VPN）──────────────────────────────────────────────────────────────
  { provider: 'openai', base_url: 'https://api.openai.com/v1', vision_model: 'gpt-4o', call_type: 'openai', request_delay_ms: 1000 },
  { provider: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', vision_model: 'gemini-2.0-flash', call_type: 'gemini', request_delay_ms: 4500 },
  { provider: 'claude', base_url: 'https://api.anthropic.com', vision_model: 'claude-sonnet-4-6', call_type: 'claude', request_delay_ms: 1000 },
  { provider: 'xai', base_url: 'https://api.x.ai/v1', vision_model: 'grok-4.1-fast', call_type: 'openai', request_delay_ms: 1000 },
  { provider: 'mistral', base_url: 'https://api.mistral.ai/v1', vision_model: 'pixtral-large-latest', call_type: 'openai', request_delay_ms: 1000 },
]
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

/** 将段落列表合并到接近 CHUNK_SIZE，返回合并后的段落数组 */
function mergeSmallParagraphs(paras: string[]): string[] {
  const merged: string[] = []
  let buf = ''
  for (const p of paras) {
    if (buf.length + p.length < CHUNK_SIZE) {
      buf = buf ? buf + '\n\n' + p : p
    } else {
      if (buf) merged.push(buf)
      buf = p
    }
  }
  if (buf) merged.push(buf)
  return merged
}

/** 提取并保护文本中的表格。返回：片段数组（普通文本需要在此基础上继续切分，table 需整个保留） */
function extractAndProtectTables(content: string): { type: 'text' | 'table'; content: string }[] {
  const htmlTableRegex = /<table\b[^>]*>[\s\S]*?<\/table>/gi
  const mdTableRegex = /(?:^[ \t]*\|.*\|[ \t]*$\n?){2,}/gm
  
  const matches: { start: number; end: number; content: string }[] = []
  let m
  while ((m = htmlTableRegex.exec(content)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, content: m[0] })
  }
  while ((m = mdTableRegex.exec(content)) !== null) {
    const start = m.index
    const end = m.index + m[0].length
    const isOverlap = matches.some(ext => start < ext.end && end > ext.start)
    if (!isOverlap) {
      matches.push({ start, end, content: m[0] })
    }
  }
  
  matches.sort((a, b) => a.start - b.start)
  
  const blocks: { type: 'text' | 'table'; content: string }[] = []
  let lastEnd = 0
  for (const match of matches) {
    if (match.start > lastEnd) {
      blocks.push({ type: 'text', content: content.slice(lastEnd, match.start) })
    }
    blocks.push({ type: 'table', content: match.content })
    lastEnd = match.end
  }
  if (lastEnd < content.length) {
    blocks.push({ type: 'text', content: content.slice(lastEnd) })
  }
  
  return blocks
}

/** 纯文本：按段落（双换行）切分，小段落合并，附加上文衔接 */
function chunkText(text: string): string[] {
  const blocks = extractAndProtectTables(text)
  const flat: string[] = []
  
  for (const block of blocks) {
    if (block.type === 'table') {
      flat.push(block.content)
    } else {
      const paras = block.content.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20)
      const merged = mergeSmallParagraphs(paras)
      flat.push(...merged)
    }
  }

  return flat.map((chunk, i) => {
    if (i === 0) return chunk
    const prevTail = flat[i - 1].slice(-CHUNK_OVERLAP)
    return `[上文衔接]\n${prevTail}\n\n[正文]\n${chunk}`
  })
}

/** 按标题分割 Markdown（1-6级），小节合并，附加上文衔接 */
function chunkMarkdown(markdown: string): string[] {
  const lines = markdown.split('\n')
  const headerRe = /^(#{1,6})\s+(.+)/

  // 按标题切点收集原始节
  type RawSection = { headerPath: string; lines: string[] }
  const rawSections: RawSection[] = [{ headerPath: '', lines: [] }]
  const stack: Array<{ level: number; title: string }> = []

  for (const line of lines) {
    const m = headerRe.exec(line)
    if (m) {
      const level = m[1].length
      const title = m[2].trim()
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
      stack.push({ level, title })
      rawSections.push({
        headerPath: stack.map(s => s.title).join(' > '),
        lines: [line],
      })
    } else {
      rawSections[rawSections.length - 1].lines.push(line)
    }
  }

  // 转为纯文本段，过滤空节
  const sections = rawSections
    .map(s => ({ path: s.headerPath, content: s.lines.join('\n').trim() }))
    .filter(s => s.content.length > 20)

  // 合并过短相邻节
  const merged: typeof sections = []
  let buf = { path: '', content: '' }
  for (const s of sections) {
    if (buf.content.length + s.content.length < CHUNK_SIZE) {
      buf.content = buf.content ? buf.content + '\n\n' + s.content : s.content
      buf.path = buf.path || s.path
    } else {
      if (buf.content) merged.push({ ...buf })
      buf = { ...s }
    }
  }
  if (buf.content) merged.push(buf)

  // 对超长节二次切割（字符滑窗），再整体附加上文衔接
  const flat: string[] = []
  for (const s of merged) {
    if (s.content.length <= CHUNK_SIZE) {
      flat.push(s.path ? `[${s.path}]\n${s.content}` : s.content)
    } else {
      // 超长节内部先抽离表格保护，不让滑窗切断表格
      const blocks = extractAndProtectTables(s.content)
      for (const block of blocks) {
        if (block.type === 'table') {
          // 表格单独作为一个完整片段保存
          flat.push(s.path ? `[${s.path}]\n${block.content.trim()}` : block.content.trim())
        } else {
          const textBlock = block.content.trim()
          if (!textBlock) continue
          let start = 0
          while (start < textBlock.length) {
            const sub = textBlock.slice(start, start + CHUNK_SIZE).trim()
            if (sub.length > 20) flat.push(s.path ? `[${s.path}]\n${sub}` : sub)
            start += CHUNK_SIZE - CHUNK_OVERLAP
          }
        }
      }
    }
  }

  // 附加上文衔接
  return flat.map((chunk, i) => {
    if (i === 0) return chunk
    const prevTail = flat[i - 1].slice(-CHUNK_OVERLAP)
    return `[上文衔接]\n${prevTail}\n\n[正文]\n${chunk}`
  })
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
      connectTimeout: 90000,
      readTimeout: 90000,
    })
    if (res.status < 200 || res.status >= 300) {
      const bodyStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      throw new Error(`HTTP ${res.status}: ${bodyStr.slice(0, 300)}`)
    }
    return res.data
  }
  const res = await fetch(url, {
    method,
    headers,
    body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
    signal: timedSignal(30000),
  })
  if (!res.ok) {
    const bodyStr = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${bodyStr.slice(0, 300)}`)
  }
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
      await Filesystem.deleteFile({ path: tmpName, directory: Directory.Cache }).catch(() => { })
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
      if (direct) return { markdown: direct as string, contentList: [], imageFiles: new Map(), otherFiles: new Map() }

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
            await Filesystem.deleteFile({ path: tmpZipName, directory: Directory.Cache }).catch(() => { })
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
      try { contentList = JSON.parse(strFromU8(data as Uint8Array)) } catch { }
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

type VisionConfig = VisionProviderEntry & { api_key: string }

/**
 * 收集所有已配置的视觉 LLM，按 VISION_PROVIDER_TABLE 优先级排列。
 * 与后端 _get_all_vision_configs 逻辑对齐：返回完整列表供逐个降级尝试。
 */
async function findAllVisionConfigs(userId: number): Promise<VisionConfig[]> {
  const configs: VisionConfig[] = []
  for (const entry of VISION_PROVIDER_TABLE) {
    const k = await localGetApiKey(userId, entry.provider)
    let apiKey = k?.api_key?.trim() ?? ''
    // 智谱/通义千问：embedding key 与视觉 key 相同，可复用
    if (!apiKey && entry.provider === 'zhipu') {
      const fb = await localGetApiKey(userId, 'zhipu_embedding')
      if (fb) apiKey = fb.api_key?.trim() ?? ''
    }
    if (!apiKey && entry.provider === 'qwen') {
      const fb = await localGetApiKey(userId, 'qwen_embedding')
      if (fb) apiKey = fb.api_key?.trim() ?? ''
    }
    if (!apiKey) continue
    const userBaseUrl = k?.base_url?.trim() ?? ''
    configs.push({ ...entry, base_url: userBaseUrl || entry.base_url, api_key: apiKey })
  }
  return configs
}

const _VISION_PROMPT = `请仔细分析这张图表或图片，用中文详细描述以下内容：
1. 图表类型（折线图/柱状图/散点图/热力图/表格等）
2. 标题、坐标轴标签及其含义
3. 关键数据点、趋势方向和变化规律
4. 数据的时间范围、数值区间、单位
5. 极值（最高/最低）及出现时间
6. 图表传达的核心结论或市场信号

请直接输出描述，不要开场白，语言简洁精准，保留具体数字。`

/**
 * 调用单个视觉 LLM provider 描述图片，抛出异常表示失败（供调用方降级）。
 * call_type='openai'  → OpenAI 兼容格式（所有国内 + openai/xai/mistral）
 * call_type='gemini'  → Gemini 原生 generateContent
 * call_type='claude'  → Anthropic Messages API
 */
async function describeImageWithAI(
  imgBase64: string,
  cfg: VisionConfig,
  itemType: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const typeHint = itemType === 'table' ? '（这是一个表格，请列出所有行列数据）' : ''
  const prompt = _VISION_PROMPT + typeHint

  if (cfg.call_type === 'gemini') {
    const url = `${cfg.base_url}/models/${cfg.vision_model}:generateContent?key=${cfg.api_key}`
    const res = await nativeFetchJSON(url, 'POST', { 'Content-Type': 'application/json' }, {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imgBase64 } },
          { text: prompt },
        ]
      }],
    }) as any
    const text = res?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!text) throw new Error('empty response')
    return text
  }

  if (cfg.call_type === 'claude') {
    const res = await nativeFetchJSON(`${cfg.base_url}/v1/messages`, 'POST', {
      'Content-Type': 'application/json',
      'x-api-key': cfg.api_key,
      'anthropic-version': '2023-06-01',
    }, {
      model: cfg.vision_model, max_tokens: 4096,
      messages: [{
        role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imgBase64 } },
          { type: 'text', text: prompt },
        ]
      }],
    }) as any
    const text = res?.content?.[0]?.text ?? ''
    if (!text) throw new Error('empty response')
    return text
  }

  // OpenAI-compat（覆盖：zhipu/qwen/doubao/hunyuan/baidu/kimi/sensenova/openai/xai/mistral）
  const res = await nativeFetchJSON(`${cfg.base_url}/chat/completions`, 'POST', {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.api_key}`,
  }, {
    model: cfg.vision_model,
    messages: [{
      role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imgBase64}`, detail: 'high' } },
      ]
    }],
    max_tokens: 4096,
  }) as any
  const text = res?.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('empty response')
  return text
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
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
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
export async function processDocument(file: File, opts: ProcessOptions): Promise<{ preview: string; fullText: string; localPdfUri: string | null }> {
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
  const rawChunks = isPro ? chunkMarkdown(text) : chunkText(text)
  // RAG 存储时剥除图片 Markdown 语法（![alt](path)），避免 chunk 里出现无意义的图片 URL
  // 视觉识别成功后会另外新增包含图片描述的 chunk
  const chunks = rawChunks
    .map(c => c.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\n{3,}/g, '\n\n').trim())
    .filter(Boolean)

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
    const chunk: KnowledgeChunk & { _sync_dirty: number } = {
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
      _sync_dirty: 0, // 等待所有处理步骤完成后再统一标记
    }
    await insertKnowledgeChunk(chunk)
  }

  onProgress?.(`已索引 ${chunks.length} 个知识块`)

  // ─ Step 5.5: 保存全量解析文件（仅 MinerU 模式）──────────────────────────────
  // 无论有无图片，均保存 markdown / model.json / middle.json / images/ 等到本地
  // Plan A: parsed/{userId}/{docName}/   Plan B: parsed_sessions/{userId}/{sessionId}/{docName}/
  let localPdfUri: string | null = null
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
      // 优先用 content_list 中的 figure/table 条目；无则处理全部图片
      const imageItems: { img_path: string; type: string; page_idx: number }[] =
        mineruResult.contentList.filter(c => (c.type === 'figure' || c.type === 'table') && c.img_path)
          .map(c => ({ img_path: c.img_path!, type: c.type, page_idx: c.page_idx ?? 0 }))

      const toProcess = imageItems.length > 0
        ? imageItems
        : [...mineruResult.imageFiles.keys()].map(k => ({ img_path: k, type: 'figure', page_idx: 0 }))

      const limited = toProcess.slice(0, MAX_VISION_IMAGES)

      // 初次检查：用于进度提示，key 列表在循环内每张图片重新查询以支持途中配置
      const initialConfigs = await findAllVisionConfigs(userId)
      if (initialConfigs.length > 0) {
        const providerChain = initialConfigs.map(c => c.provider).join(' → ')
        onProgress?.(`图表 AI 识别中 (${limited.length}/${toProcess.length} 张) | provider链: ${providerChain}`)
      } else {
        onProgress?.('未配置视觉 AI Key，图片已保存本地但跳过识别')
      }

      let visionCount = 0
      let lastUsedProvider = initialConfigs[0]?.provider ?? ''
      for (let vi = 0; vi < limited.length; vi++) {
        const item = limited[vi]
        // 每张图片重新查询配置列表，确保解析中途新配置的 key 立即生效
        const visionConfigs = await findAllVisionConfigs(userId)
        if (visionConfigs.length === 0) continue

        const localPath = localImagePaths.get(item.img_path)
        if (!localPath) continue
        // 从文件扩展名检测正确 MIME type（MinerU 常见：jpg/jpeg/png/webp）
        const imgExt = (localPath.split('.').pop() ?? 'jpg').toLowerCase()
        const imgMime = imgExt === 'png' ? 'image/png' : imgExt === 'webp' ? 'image/webp' : 'image/jpeg'
        try {
          onProgress?.(`图表识别 ${vi + 1}/${limited.length}...`)
          const readResult = await Filesystem.readFile({ path: localPath, directory: Directory.Data })
          const imgBase64 = (readResult.data as string).replace(/\s/g, '')
          // Capacitor Bridge 传输大 base64 payload 有限制，超过 ~1MB base64 跳过
          if (imgBase64.length > 1_000_000) {
            console.warn('[Vision] skip oversized image (>1MB base64):', item.img_path)
            continue
          }
          // 请求间隔：基于上一张成功使用的 provider，避免触发速率限制
          if (vi > 0) {
            const primaryCfg = visionConfigs.find(c => c.provider === lastUsedProvider) ?? visionConfigs[0]
            await new Promise(r => setTimeout(r, primaryCfg.request_delay_ms))
          }

          // ── Provider 降级链：逐个尝试，与后端 _describe_image 对齐 ──────────────
          const imgName = item.img_path.split('/').pop() ?? item.img_path
          const typeHintLabel = item.type === 'table' ? '表格' : '图表'
          const promptPreview = _VISION_PROMPT.split('\n')[0]
          console.info(`[Vision] 🔍 开始处理 ${vi + 1}/${limited.length}: ${imgName} (${typeHintLabel}) | 大小: ${(imgBase64.length / 1024).toFixed(1)} KB`)
          console.info(`[Vision] 📋 Prompt: ${promptPreview}${item.type === 'table' ? '（含表格行列提示）' : ''}`)
          let description = ''
          for (let pi = 0; pi < visionConfigs.length; pi++) {
            const cfg = visionConfigs[pi]
            const nextModel = pi + 1 < visionConfigs.length
              ? ` → 改用 ${visionConfigs[pi + 1].provider}/${visionConfigs[pi + 1].vision_model}`
              : ' → 已无可用 provider，放弃'
            console.info(`[Vision] 📤 尝试 ${cfg.provider}/${cfg.vision_model} | 图片: ${imgName}`)
            try {
              const descPromise = describeImageWithAI(imgBase64, cfg, item.type, imgMime)
              const timeoutPromise = new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('vision timeout')), 90000)
              )
              const result = await Promise.race([descPromise, timeoutPromise])
              if (result.trim()) {
                description = result
                lastUsedProvider = cfg.provider
                console.info(`[Vision] ✅ ${cfg.provider}/${cfg.vision_model} 成功 | 图片 ${vi + 1}/${limited.length}: ${imgName} | 描述长度: ${result.trim().length} 字`)
                break
              }
              console.warn(`[Vision] ❌ ${cfg.provider}/${cfg.vision_model} 返回空内容 | 图片: ${imgName}${nextModel}`)
            } catch (e) {
              console.warn(`[Vision] ❌ ${cfg.provider}/${cfg.vision_model} 失败: ${e instanceof Error ? e.message : String(e)} | 图片: ${imgName}${nextModel}`)
            }
          }

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
            _sync_dirty: 0, // 等待所有处理步骤完成后再统一标记
          })
          visionCount++
        } catch (e) {
          console.warn('[Vision] 图片读取失败:', item.img_path, e instanceof Error ? e.message : String(e))
        }
      }
      if (visionCount > 0) onProgress?.(`图表识别完成，新增 ${visionCount} 个视觉知识块`)
    }

    // ─ Step 5.6: 替换 Markdown 图片路径 (修复路径重复嵌套 Bug) ─────────────────────
    if (Capacitor.isNativePlatform() && localImagePaths.size > 0) {
      console.log(`[MinerU] 🚀 开始替换图片路径，共 ${localImagePaths.size} 张图片`)
      for (const [imgZipPath, localRelPath] of localImagePaths.entries()) {
        try {
          const { uri } = await Filesystem.getUri({ path: localRelPath, directory: Directory.Data })
          const webUrl = Capacitor.convertFileSrc(uri)
          
          // 1. 替换 Markdown 语法: ![alt](images/xxx) -> ![alt](http://...)
          // 仅匹配起始为 images/ 或 ./images/ 的路径，避免匹配到已经是 http/capacitor 的完整路径
          const mdRe = new RegExp(`(!\\[[^\\]]*\\]\\()(\\./)?${imgZipPath.replace(/\//g, '\\/')}(\\))`, 'g')
          text = text.replace(mdRe, `$1${webUrl}$3`)
          
          // 2. 替换 HTML 语法 (MinerU 表格中常见): <img src="images/xxx"> -> <img src="http://...">
          const htmlRe = new RegExp(`(src=["'])(\\./)?${imgZipPath.replace(/\//g, '\\/')}(["'])`, 'g')
          text = text.replace(htmlRe, `$1${webUrl}$3`)

          // 💡 注意：此处删除了 text.split(imgZipPath).join(webUrl) 的兜底逻辑。
          // 原先的 split/join 会无差别替换文本，导致 webUrl 结尾的 images/xxx 再次被替换为完整的 webUrl，
          // 产生 capacitor://.../capacitor://... 这种重复路径。
        } catch (e) {
          console.warn('[MinerU] 图片路径转换失败:', imgZipPath, e)
        }
      }
    }

    // ─ Step 5.7: 保存原始 PDF 到本地（供"对照预览"左侧显示使用）────────────────
    if (Capacitor.isNativePlatform() && file.type === 'application/pdf') {
      try {
        const safeDocName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const pdfPath = `parsed/${userId}/${safeDocName}_original.pdf`
        const arrayBuffer = await file.arrayBuffer()
        const data = new Uint8Array(arrayBuffer)
        let binary = ''
        const CHUNK = 8192
        for (let i = 0; i < data.byteLength; i += CHUNK) {
          binary += String.fromCharCode(...data.subarray(i, i + CHUNK))
        }
        await Filesystem.writeFile({ path: pdfPath, data: btoa(binary), directory: Directory.Data, recursive: true })
        const { uri } = await Filesystem.getUri({ path: pdfPath, directory: Directory.Data })
        localPdfUri = uri  // 保存原始 native file:// URI（MessageItem 读取时会调用 convertFileSrc）
        console.log('[PDF] 原始文件已保存本地:', uri)
      } catch (e) {
        console.warn('[PDF] 保存原始文件失败（不影响知识索引）:', e)
      }
    }
  }

  // ─ Step 6: 知识图谱抽取 + 社区检测（仅 knowledge 模式）──────────────────────
  if (engine === 'knowledge') {
    const graph = await extractKnowledgeGraph(userId, file.name, chunks.slice(0, 20), onProgress)
    if (graph && graph.entities.length >= 3 && graph.relations.length > 0) {
      await detectAndUploadCommunities(graph, userId, file.name, onProgress)
    }
  }

  // ─ Step 7: 所有本地处理完成，统一标记为待同步 ─────────────────────────────────
  // 必须在视觉识别 + 知识图谱全部完成后，才将本文档所有 chunk 标记 dirty，
  // 确保同步到 Web 时片段数量完整、内容原封不动。
  await markDocChunksDirty(userId, file.name)

  const preview = text.slice(0, 300)
  onProgress?.('完成！')
  return { preview, fullText: text, localPdfUri }
}

// ─── 知识图谱抽取 ──────────────────────────────────────────────────────────────

/** 调用用户的 LLM，从文本块中抽取实体和关系，构建知识图谱（与 Web 端 extract_knowledge_graph_for_web 对齐）*/
async function extractKnowledgeGraph(
  userId: number,
  docName: string,
  chunks: string[],
  onProgress?: (msg: string) => void
): Promise<KnowledgeGraph | null> {

  // 1. 按优先级（国内优先）收集所有可用 LLM 配置，使用 OpenAI 兼容接口（与 Web 端一致）
  type LlmConfig = { provider: string; url: string; apiKey: string; model: string }
  const KG_PROVIDER_DEFAULTS: Array<{ provider: string; defaultUrl: string; defaultModel: string }> = [
    { provider: 'deepseek', defaultUrl: 'https://api.deepseek.com/v1/chat/completions', defaultModel: 'deepseek-chat' },
    { provider: 'qwen', defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', defaultModel: 'qwen-plus' },
    { provider: 'zhipu', defaultUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', defaultModel: 'glm-4-flash' },
    { provider: 'minimax', defaultUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2', defaultModel: 'MiniMax-Text-01' },
    { provider: 'kimi', defaultUrl: 'https://api.moonshot.cn/v1/chat/completions', defaultModel: 'moonshot-v1-8k' },
    { provider: 'doubao', defaultUrl: 'https://ark.volcengineapi.com/api/v3/chat/completions', defaultModel: 'doubao-seed-2.0-lite' },
    { provider: 'openai', defaultUrl: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini' },
  ]

  const allConfigs: LlmConfig[] = []
  for (const entry of KG_PROVIDER_DEFAULTS) {
    const k = await localGetApiKey(userId, entry.provider)
    const apiKey = k?.api_key?.trim() ?? ''
    if (!apiKey) continue
    const base = (k?.base_url ?? '').trim().replace(/\/+$/, '')
    let url: string
    if (base) {
      if (base.endsWith('/chat/completions')) url = base
      else if (base.includes('/v1') || base.includes('compatible-mode') || base.includes('paas')) url = base + '/chat/completions'
      else url = base + '/v1/chat/completions'
    } else {
      url = entry.defaultUrl
    }
    allConfigs.push({ provider: entry.provider, url, apiKey, model: k?.model_name?.trim() || entry.defaultModel })
  }

  if (allConfigs.length === 0) {
    onProgress?.('未找到 LLM Key，跳过知识图谱抽取')
    return null
  }

  // 2. 全文分块：4000 字符 + 200 重叠（与 Web 端 CHUNK_SIZE/OVERLAP 对齐）
  const fullText = chunks.join('\n\n')
  const KG_CHUNK_SIZE = 4000
  const KG_OVERLAP = 200
  const kgChunks: string[] = []
  let pos = 0
  while (pos < fullText.length) {
    kgChunks.push(fullText.slice(pos, pos + KG_CHUNK_SIZE))
    if (pos + KG_CHUNK_SIZE >= fullText.length) break
    pos += KG_CHUNK_SIZE - KG_OVERLAP
  }

  const modelChain = allConfigs.map(c => `${c.provider}/${c.model}`).join(' → ')
  console.log(`[KG] 🚀 开始抽取: ${docName} | 文本 ${fullText.length} 字符 → ${kgChunks.length} 块 | 模型链: ${modelChain}`)
  onProgress?.('知识图谱抽取中（实体/关系识别）...')

  // 3. 构建 prompt（与 Web 端 build_prompt 完全一致）
  function buildKgPrompt(chunk: string): string {
    return `请从以下文本中抽取所有实体和它们之间的关系，用于构建知识图谱。

文本内容：
"""
${chunk}
"""

请严格输出 JSON 格式（不要有任何其他文字）：
{
  "entities": [
    {"id": "e1", "text": "实体名称", "type": "Person|Organization|Concept|Event|Location|Other", "description": "简短描述"}
  ],
  "relations": [
    {"id": "r1", "source": "e1", "target": "e2", "label": "关系描述"}
  ]
}

要求：
- 尽量抽取文本中出现的所有实体，不要遗漏
- 尽量抽取所有确定存在的关系
- id 从 e1/r1 开始递增
- 类型只能是 Person/Organization/Concept/Event/Location/Other 之一`
  }

  // 4. 单次 LLM 调用（非流式，与 Web 端 httpx POST 对齐）
  async function callOnce(chunk: string, cfg: LlmConfig): Promise<string | null> {
    try {
      const res = await nativeFetchJSON(cfg.url, 'POST', {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      }, { model: cfg.model, messages: [{ role: 'user', content: buildKgPrompt(chunk) }], max_tokens: 4000 }) as any
      return res?.choices?.[0]?.message?.content ?? null
    } catch {
      return null
    }
  }

  // 5. 合并解析结果（text.toLowerCase() 去重，与 Web 端 all_entities/all_relations dict 对齐）
  const allEntitiesMap = new Map<string, { text: string; type: string; description: string }>()
  const allRelationsMap = new Map<string, { source: string; target: string; label: string }>()

  function parseAndMerge(raw: string, chunkIdx: number): void {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) { console.warn(`[KG] ⚠️ 块 ${chunkIdx + 1}/${kgChunks.length} 未找到 JSON`); return }
    let parsed: any
    try { parsed = JSON.parse(match[0]) } catch (je) { console.warn(`[KG] ⚠️ 块 ${chunkIdx + 1}/${kgChunks.length} JSON 解析失败:`, je); return }

    const chunkIdToText: Record<string, string> = {}
    let newE = 0, newR = 0
    for (const e of parsed.entities ?? []) {
      const t = (e.text ?? '').trim()
      if (!t) continue
      chunkIdToText[e.id ?? ''] = t
      const key = t.toLowerCase()
      if (!allEntitiesMap.has(key)) { allEntitiesMap.set(key, { text: t, type: e.type ?? 'Other', description: e.description ?? '' }); newE++ }
    }
    for (const r of parsed.relations ?? []) {
      const srcRaw = r.source ?? r.from ?? ''
      const tgtRaw = r.target ?? r.to ?? ''
      const src = (chunkIdToText[srcRaw] ?? srcRaw).trim()
      const tgt = (chunkIdToText[tgtRaw] ?? tgtRaw).trim()
      const label = (r.label ?? '').trim()
      if (!src || !tgt || !label) continue
      const rkey = `${src.toLowerCase()}→${tgt.toLowerCase()}→${label.toLowerCase()}`
      if (!allRelationsMap.has(rkey)) { allRelationsMap.set(rkey, { source: src, target: tgt, label }); newR++ }
    }
    console.log(`[KG] ✔ 块 ${chunkIdx + 1}/${kgChunks.length} 完成 (+${newE} 实体, +${newR} 关系) | 累计: ${allEntitiesMap.size} 实体, ${allRelationsMap.size} 关系`)
  }

  // 6. 逐块处理：主模型 → 重试一次 → 备用模型（与 Web 端三段式重试对齐）
  const [primaryCfg, ...fallbackCfgs] = allConfigs
  const failedChunks: number[] = []

  for (let ci = 0; ci < kgChunks.length; ci++) {
    console.log(`[KG] ⏳ 块 ${ci + 1}/${kgChunks.length} (${kgChunks[ci].length} 字符) → ${primaryCfg.provider}/${primaryCfg.model}`)
    const raw = await callOnce(kgChunks[ci], primaryCfg)
    if (raw) { parseAndMerge(raw, ci) } else { failedChunks.push(ci) }
  }

  // 重试一次
  const stillFailed: number[] = []
  for (const ci of failedChunks) {
    console.log(`[KG] 🔁 重试块 ${ci + 1}/${kgChunks.length}`)
    const raw = await callOnce(kgChunks[ci], primaryCfg)
    if (raw) { parseAndMerge(raw, ci) } else { stillFailed.push(ci) }
  }

  // 备用模型
  for (const ci of stillFailed) {
    let succeeded = false
    for (const fb of fallbackCfgs) {
      console.log(`[KG] 🔄 块 ${ci + 1}/${kgChunks.length} 切换备用模型: ${fb.provider}/${fb.model}`)
      const raw = await callOnce(kgChunks[ci], fb)
      if (raw) { parseAndMerge(raw, ci); succeeded = true; break }
    }
    if (!succeeded) console.warn(`[KG] ⚠️ 块 ${ci + 1}/${kgChunks.length} 所有模型均失败，跳过`)
  }

  if (allEntitiesMap.size === 0) {
    onProgress?.('知识图谱抽取失败（不影响 RAG 检索）')
    return null
  }

  // 7. 全局重新编号（与 Web 端 text_to_gid 逻辑对齐）
  const textToGid = new Map<string, string>()
  const entitiesList: KnowledgeEntity[] = []
  let eidx = 1
  for (const [, e] of allEntitiesMap) {
    const gid = `e${eidx++}`
    textToGid.set(e.text.toLowerCase(), gid)
    entitiesList.push({ id: gid, text: e.text, type: e.type, description: e.description })
  }

  const relationsList: KnowledgeRelation[] = []
  let ridx = 1
  for (const [, r] of allRelationsMap) {
    const srcGid = textToGid.get(r.source.toLowerCase()) ?? r.source
    const tgtGid = textToGid.get(r.target.toLowerCase()) ?? r.target
    relationsList.push({ id: `r${ridx++}`, source: srcGid, target: tgtGid, label: r.label })
  }

  const graph: KnowledgeGraph = {
    entities: entitiesList,
    relations: relationsList,
    doc_name: docName,
    extracted_at: new Date().toISOString(),
  }

  // 8. 持久化（localStorage 缓存 + SQLite）
  localStorage.setItem(`kg_${docName}_${userId}`, JSON.stringify(graph))
  await saveKnowledgeGraphToDb(docName, userId, graph.entities, graph.relations)

  console.log(`[KG] ✅ 抽取完成: ${graph.entities.length} 实体, ${graph.relations.length} 关系`)
  console.log('[KG] 实体列表:', JSON.stringify(graph.entities.map(e => e.text)))
  onProgress?.(`知识图谱构建完成（${graph.entities.length} 实体，${graph.relations.length} 关系）`)
  return graph
}

/**
 * BFS 连通分量社区检测 + LLM 摘要 → POST 到服务器
 * 仅在 knowledge 模式下调用，不影响 Web 端。
 */
async function detectAndUploadCommunities(
  graph: KnowledgeGraph,
  userId: number,
  docName: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const { entities, relations } = graph

  // ─ BFS 连通分量 ──────────────────────────────────────────────────────────────
  const adjMap = new Map<string, Set<string>>()
  for (const e of entities) adjMap.set(e.id, new Set())
  for (const r of relations) {
    adjMap.get(r.source)?.add(r.target)
    adjMap.get(r.target)?.add(r.source)
  }

  const visited = new Set<string>()
  const componentGroups: string[][] = []
  for (const e of entities) {
    if (visited.has(e.id)) continue
    const group: string[] = []
    const queue = [e.id]
    visited.add(e.id)
    while (queue.length > 0) {
      const cur = queue.shift()!
      group.push(cur)
      for (const nb of adjMap.get(cur) || []) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb) }
      }
    }
    if (group.length >= 2) componentGroups.push(group)
  }

  if (componentGroups.length === 0) return
  componentGroups.sort((a, b) => b.length - a.length)

  onProgress?.(`社区检测中（${componentGroups.length} 个社区）...`)

  // ─ 找 LLM Key ─────────────────────────────────────────────────────────────────
  const LLM_PROVIDERS = ['deepseek', 'qwen', 'minimax', 'openai', 'gemini', 'claude']
  let llmKey = null
  let llmProvider = ''
  for (const p of LLM_PROVIDERS) {
    llmKey = await localGetApiKey(userId, p)
    if (llmKey) { llmProvider = p; break }
  }
  if (!llmKey) return

  // ─ 逐社区生成 LLM 摘要 ───────────────────────────────────────────────────────
  const communities: Array<{
    community_id: number; title: string; summary: string; entity_texts: string[]; size: number
  }> = []

  for (let i = 0; i < componentGroups.length; i++) {
    const group = componentGroups[i]
    const groupEntities = group.map(id => entities.find(e => e.id === id)!).filter(Boolean)
    const entityTexts = groupEntities.map(e => e.text)
    const groupRelations = relations.filter(r => group.includes(r.source) && group.includes(r.target))
    const relLines = groupRelations.slice(0, 10).map(r => {
      const src = entities.find(e => e.id === r.source)?.text ?? r.source
      const tgt = entities.find(e => e.id === r.target)?.text ?? r.target
      return `${src} → ${tgt}（${r.label}）`
    })

    const prompt = `请为以下知识图谱社区生成标题和摘要。
实体：${entityTexts.join('、')}
关系：${relLines.join('；')}
请严格输出 JSON（不要其他文字）：{"title": "不超过15字的标题", "summary": "80-150字摘要"}`

    let raw = ''
    try {
      await streamDirectAi({
        provider: llmProvider,
        model: llmKey.model_name || (llmProvider === 'deepseek' ? 'deepseek-chat' : llmProvider === 'qwen' ? 'qwen-plus' : 'gpt-4o-mini'),
        messages: [{ role: 'user', content: prompt }],
        apiKey: llmKey,
        enableThinking: false,
        maxTokens: 300,
        onSummary: c => { raw += c },
        onDone: () => { },
        onError: () => { },
      })
      const match = raw.match(/\{[\s\S]*?\}/)
      const parsed = match ? JSON.parse(match[0]) : {}
      communities.push({
        community_id: i,
        title: parsed.title || entityTexts.slice(0, 3).join('、'),
        summary: parsed.summary || entityTexts.join('、'),
        entity_texts: entityTexts,
        size: entityTexts.length,
      })
    } catch {
      communities.push({
        community_id: i,
        title: entityTexts.slice(0, 3).join('、'),
        summary: entityTexts.join('、'),
        entity_texts: entityTexts,
        size: entityTexts.length,
      })
    }
  }

  // ─ 先存本地 SQLite（离线时服务器不可达，但本地数据不丢失）───────────────────
  try {
    await saveCommunitiesToDb(docName, communities)
    console.log(`[Community] ✅ 已将 ${communities.length} 个社区存入本地 SQLite: ${docName}`)
  } catch (e) {
    console.warn('[Community] 本地存储社区失败:', e instanceof Error ? e.message : String(e))
  }

  // ─ 再尝试 POST 到服务器（在线时同步，离线则优雅降级）───────────────────────
  try {
    const base = getBaseURL()
    const token = useAuthStore.getState().token || ''
    const apiBase = base.endsWith('/') ? base.slice(0, -1) : base
    const res = await fetch(`${apiBase}/knowledge-graph/communities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ doc_id: docName, communities }),
      signal: timedSignal(10000),
    })
    if (res.ok) {
      onProgress?.(`社区报告生成完成（${communities.length} 个社区）`)
      console.log(`[Community] ✅ 上传 ${communities.length} 个社区到服务器: ${docName}`)
    } else {
      console.warn('[Community] 服务器上传失败:', res.status, '（本地已存储）')
      onProgress?.(`社区报告已本地保存（${communities.length} 个社区）`)
    }
  } catch (e) {
    console.warn('[Community] 服务器不可达（本地已存储）:', e instanceof Error ? e.message : String(e))
    onProgress?.(`社区报告已本地保存（${communities.length} 个社区）`)
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
 * 搜索本地知识图谱，返回与问题相关的实体关系上下文。
 * 策略：直接在图谱中查找「出现在问题里的实体」，再做 2 跳关系遍历。
 * 无需分词或 LLM，完全离线可用。
 */
export async function searchGraphContext(
  userId: number,
  sessionId: string | null,
  question: string
): Promise<string> {
  try {
    const docIds = await getGraphDocIdsForSession(userId, sessionId)
    if (docIds.length === 0) return ''

    // 直接查「问题中包含哪些已知实体名」
    const matched = await findEntitiesInText(docIds, question)
    if (matched.length === 0) return ''

    const uniqueEntities = [...new Set(matched.map(e => e.entityText))].slice(0, 10)

    // 第一跳关系
    const hop1Relations = await findRelationsForEntityNames(docIds, uniqueEntities)
    if (hop1Relations.length === 0) return ''

    // 第二跳：从第一跳发现的新实体出发
    const hop1Entities = new Set(uniqueEntities)
    const newEntities: string[] = []
    for (const r of hop1Relations) {
      if (!hop1Entities.has(r.source)) newEntities.push(r.source)
      if (!hop1Entities.has(r.target)) newEntities.push(r.target)
    }
    const hop2Relations = newEntities.length > 0
      ? await findRelationsForEntityNames(docIds, [...new Set(newEntities)].slice(0, 8))
      : []

    const allRelations = [...hop1Relations, ...hop2Relations].slice(0, 30)

    // 格式化
    const lines = ['【知识图谱上下文】', `查询实体：${uniqueEntities.join('、')}`, '关系链：']
    for (const r of allRelations) {
      lines.push(`  - ${r.source} --[${r.relation}]--> ${r.target}`)
    }
    return lines.join('\n')
  } catch (e) {
    console.warn('[GraphRAG] searchGraphContext error (skipped):', e)
    return ''
  }
}

/** 从查询语句中提取疑似文件名（含日期前缀或扩展名特征）*/
function _detectFilenameHint(query: string): string {
  const extMatch = query.match(/[\w\u4e00-\u9fff\-\.]+\.(pdf|xlsx?|csv|docx?|txt|pptx?)/i)
  if (extMatch) return extMatch[0]
  const dateMatch = query.match(/\d{8}[\w\u4e00-\u9fff_\-]+/)
  if (dateMatch) return dateMatch[0]
  return ''
}

/** 计算两个字符串的相似度（Dice 系数，字符级）*/
function _strSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  if (!a || !b) return 0.0
  const aL = a.toLowerCase()
  const bL = b.toLowerCase()
  const bArr = bL.split('')
  let common = 0
  for (const ch of aL) {
    const idx = bArr.indexOf(ch)
    if (idx !== -1) { common++; bArr.splice(idx, 1) }
  }
  return (2.0 * common) / (aL.length + bL.length)
}

/**
 * 搜索本地知识库，返回最相关的内容作为 AI 上下文。
 * 策略：
 *   1. 知识图谱关系检索（GraphRAG）
 *   2. 向量相似度搜索（如果有 embedding）+ filename 模糊 boost
 *   3. 降级到 FTS5 关键词搜索
 */
export async function searchKnowledge(
  userId: number,
  sessionId: string | null,
  query: string
): Promise<string> {
  let chunks: KnowledgeChunk[] = []

  const filenameHint = _detectFilenameHint(query)

  // ── 策略 1：知识图谱检索（GraphRAG）────────────────────────────────────────
  const graphContext = await searchGraphContext(userId, sessionId, query)

  // ── 策略 2：向量搜索 + filename boost ─────────────────────────────────────
  const embeddingConfig = await findEmbeddingKey(userId)
  if (embeddingConfig) {
    try {
      const queryVec = await generateEmbeddings([query], embeddingConfig.provider, embeddingConfig.apiKey)
      if (queryVec?.[0]) {
        const allChunks = await getChunksWithEmbeddings(userId, sessionId)
        if (allChunks.length > 0) {
          const BOOST = 0.3
          const scored = allChunks
            .map(c => {
              const vecScore = cosineSimilarity(queryVec[0], JSON.parse(c.embedding!))
              const fnRatio = filenameHint ? _strSimilarity(filenameHint, c.doc_name || '') : 0
              const finalScore = vecScore + (fnRatio > 0.4 ? BOOST * fnRatio : 0)
              return { chunk: c, score: finalScore }
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, RAG_TOP_K + 3) // 多取候选，boost 后再截
          chunks = scored.slice(0, RAG_TOP_K).map(s => s.chunk)
        }
      }
    } catch {
      // 向量搜索失败，降级
    }
  }

  // ── 策略 3：FTS5 降级 ───────────────────────────────────────────────────────
  if (chunks.length === 0) {
    const ftsChunks = await searchKnowledgeFTS(userId, sessionId, query, RAG_TOP_K + 3)
    if (filenameHint && ftsChunks.length > 0) {
      // FTS 无分数，对 filename 命中的 chunk 排到前面
      const boosted = ftsChunks.filter(c => _strSimilarity(filenameHint, c.doc_name || '') > 0.4)
      const rest = ftsChunks.filter(c => _strSimilarity(filenameHint, c.doc_name || '') <= 0.4)
      chunks = [...boosted, ...rest].slice(0, RAG_TOP_K)
    } else {
      chunks = ftsChunks.slice(0, RAG_TOP_K)
    }
  }

  const parts: string[] = []
  if (graphContext) parts.push(graphContext)
  if (chunks.length > 0) {
    const chunkContext = chunks
      .map((c, i) => `[${i + 1}] (来自《${c.doc_name}》)\n${c.content}`)
      .join('\n\n---\n\n')
    parts.push(`以下是从用户本地知识库中检索到的相关内容：\n\n${chunkContext}`)
  }

  return parts.join('\n\n')
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
