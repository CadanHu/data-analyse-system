/**
 * pdfExportService.ts — 报告导出/分享服务
 *
 * 将 HTML 报告导出为可分享的文件。
 * - Native：写入 Capacitor Filesystem.Cache，调用系统 Share 面板
 *   （接收方在浏览器打开，ECharts 图表保持交互性）
 * - Web：触发 HTML 文件浏览器下载
 *
 * 为什么用 HTML 而非 PDF：
 *   - 零依赖（不需要 jsPDF / html2canvas，避免 WKWebView 兼容问题）
 *   - 报告内嵌 ECharts，保留图表交互性
 *   - 文件体积小，分享快
 *   - 可一键在任意浏览器打开，无需 PDF 阅读器
 */

import { Capacitor } from '@capacitor/core'
import PdfExport from './pdfExportPlugin'
import { resolveEChartsInHtml, cacheECharts } from './fileCache'

/**
 * 注入打印专用 CSS：确保图表和内容铺满 A4 宽度
 */
function injectPrintCss(html: string): string {
  const css = `
<style>
  /* 打印时强制全宽，覆盖报告自带的 max-width 限制 */
  html, body {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 16px !important;
    box-sizing: border-box !important;
  }
  /* 所有容器铺满宽度 */
  div, section, article, main {
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  /* ECharts 图表容器强制全宽，固定高度避免塌缩 */
  div[id^="chart-"], [id*="chart"] {
    width: 100% !important;
    min-height: 380px !important;
    page-break-inside: avoid;
  }
  /* 表格全宽 */
  table { width: 100% !important; }
  @media print {
    html, body { width: 100% !important; }
    div[id^="chart-"], [id*="chart"] {
      width: 100% !important;
      min-height: 360px !important;
      page-break-inside: avoid;
    }
  }
</style>`
  // 插在 </head> 前，优先级最高
  if (html.includes('</head>')) {
    return html.replace('</head>', css + '\n</head>')
  }
  return css + html
}

/**
 * 导出报告
 * - Native (Android)：调用系统打印面板，用户选"另存为 PDF"保存真正的 PDF 文件
 * - Web：触发浏览器 HTML 文件下载
 */
export async function exportReport(html: string, title = 'Report'): Promise<void> {
  const safeTitle = title.replace(/[^\w\u4e00-\u9fa5\s-]/g, '').trim() || 'Report'

  if (Capacitor.isNativePlatform()) {
    // 确保 ECharts 已缓存，然后内联替换 CDN 脚本
    // 这样 WebView 不需要请求任何外网资源，不会卡死
    await cacheECharts().catch(() => {})
    const inlined = await resolveEChartsInHtml(html)
    const printHtml = injectPrintCss(inlined)
    await PdfExport.printHtml({ html: printHtml, title: safeTitle })
  } else {
    // Web：触发浏览器下载（HTML 格式，支持 ECharts 交互）
    const filename = `${safeTitle}_${Date.now()}.html`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}
