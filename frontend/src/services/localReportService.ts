/**
 * localReportService.ts — 本地 HTML 报告生成服务
 *
 * 在手机本地直接调用 AI API 生成与后端相同格式的深度分析报告，
 * 无需联网访问后端 /chat/generate_report 接口。
 *
 * 输出格式与后端 VISUALIZATION_REPORT_PROMPT 完全一致：
 * { title: string, summary: string, html: string }
 */

import { streamDirectAi } from './directAiService'
import type { LocalApiKey } from './db'

export interface LocalReportOptions {
  userQuery: string
  sqlResult: { columns: string[]; rows: any[] }
  sql: string
  language: 'zh' | 'en'
  provider: string
  model: string
  apiKey: LocalApiKey
  signal?: AbortSignal
  onProgress?: (chunk: string) => void
}

export interface LocalReportResult {
  title: string
  summary: string
  html: string
}

// 与后端 VISUALIZATION_REPORT_PROMPT_ZH 完全一致
const REPORT_PROMPT_ZH = `你是资深财务与数据分析专家。请基于需求与数据上下文生成一份正式的【深度分析报告】。

输出必须是包含三个字段的 JSON 对象：
1. "title": 报告标题
2. "summary": 业务洞察摘要（3-6条，用 \\n 分隔）
3. "html": 报告正文 HTML。

排版规范 (专为网页查看与 PDF 打印设计)：
- 整体布局：采取顶层 <h1> 标题，各章节 <h2> 标题的清晰层级。
- 视觉风格：浅色商务风（白底黑字），使用简单的边框和间距。
- 响应式：确保在 800px 宽度下显示完美。

【极度重要: HTML/JS 规范】
- "html" 必须是完整的 <html><head><body> 结构。
- head 必须引入: <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
- 每个分析模块必须包含：
  1. <h2 style="color:#1a5f7a; border-bottom:2px solid #eee; padding-bottom:10px;">章节名称</h2>
  2. <p style="font-size:14px; color:#666;">章节分析说明内容...</p>
  3. <div id="chart-唯一ID" style="width:100%; height:420px; margin:20px 0;"></div>
  4. <div style="margin-top:10px; overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">...数据详情表格...</table></div>
- **必须**在 body 末尾的 <script> 中手写 JavaScript，使用 \`echarts.init\` 并注入真实的上下文数据。
- **字体兼容要求 (非常关键)**：所有图表的 title、legend、xAxis.name、yAxis.name、series.name **必须且只能使用英文**。
- **严禁**使用占位符！如果没有数据，请在文字中说明，不要生成空的图表容器。
- 确保 JavaScript 中的引号正确转义，防止破坏 JSON 结构。
- **输出长度限制**：最多生成 2 个图表模块，报告保持简洁，HTML 总长度控制在合理范围内。

输入：
- 需求：{user_query}
- 数据上下文：{knowledge_base}`

const REPORT_PROMPT_EN = `You are a Senior Financial & Data Expert. Generate a professional [Deep Analysis Report] based on requirements and context.

Return JSON with three fields:
1. "title": Report Title
2. "summary": Key business insights (3-6 items, separated by \\n)
3. "html": Full HTML report content.

Layout Standards:
- Use <h1> for main title and <h2> for sections.
- Business style: White background, black text, clean borders.
- Responsive: Perfect display at 800px width.

[CRITICAL: HTML/JS Specs]
- "html" must be full <html><head><body>.
- Head must include: <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
- Each section MUST have: <h2> heading, textual analysis, chart div, data table.
- Use JavaScript in <script> tags at end of body to initialize ECharts with REAL data.
- NO placeholders. All chart labels must be in English.

Input:
- Query: {user_query}
- Context: {knowledge_base}`

function buildPrompt(opts: LocalReportOptions): string {
  const template = opts.language === 'zh' ? REPORT_PROMPT_ZH : REPORT_PROMPT_EN

  // 构建数据上下文：SQL + 前20行数据（紧凑格式，控制 token 用量）
  const previewRows = opts.sqlResult.rows.slice(0, 20)
  const knowledgeBase = [
    `SQL: ${opts.sql}`,
    `Columns: ${opts.sqlResult.columns.join(', ')}`,
    `Total rows: ${opts.sqlResult.rows.length}`,
    `Data (first ${previewRows.length} rows):`,
    JSON.stringify(previewRows),
  ].join('\n')

  return template
    .replace('{user_query}', opts.userQuery)
    .replace('{knowledge_base}', knowledgeBase)
}

/**
 * 本地生成深度分析报告（HTML 格式）
 * 与后端 /chat/generate_report 接口输出完全兼容
 */
export async function generateLocalReport(opts: LocalReportOptions): Promise<LocalReportResult> {
  const prompt = buildPrompt(opts)
  let accumulated = ''

  await streamDirectAi({
    provider: opts.provider,
    model: opts.model,
    messages: [{ role: 'user', content: prompt }],
    enableThinking: false,
    maxTokens: 8000,
    apiKey: opts.apiKey,
    signal: opts.signal,
    onSummary: (chunk) => {
      accumulated += chunk
      opts.onProgress?.(chunk)
    },
    onDone: () => {},
    onError: (err) => { throw new Error(err) },
  })

  // 解析 JSON 响应
  const jsonMatch = accumulated.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('AI 未返回有效的 JSON 报告格式')
  }

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.html || !parsed.title) {
    throw new Error('报告格式不完整，缺少 title 或 html 字段')
  }

  return {
    title: parsed.title || '',
    summary: parsed.summary || '',
    html: parsed.html || '',
  }
}
