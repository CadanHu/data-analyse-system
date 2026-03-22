/**
 * fileSaverService.ts — 文件保存服务（Web 端）
 *
 * 优先使用 File System Access API（showSaveFilePicker）让用户选择保存位置。
 * 当浏览器不支持（Safari、Firefox）时，自动降级为传统 <a download> 方式
 * 直接保存到浏览器默认下载目录。
 *
 * 支持情况：
 *   - showSaveFilePicker：Chrome 86+、Edge 86+
 *   - <a download> 降级：所有浏览器
 */

type MimeType =
  | 'text/plain'
  | 'text/markdown'
  | 'text/html'
  | 'application/pdf'
  | 'image/png'
  | string

interface SaveFileOptions {
  /** 文件内容 */
  blob: Blob
  /** 建议的文件名（含扩展名），用于文件选择框的默认名称 */
  suggestedName: string
  /** MIME 类型 */
  mimeType: MimeType
  /** 文件选择框标题（可选，部分浏览器支持） */
  description?: string
}

/**
 * 判断当前浏览器是否支持 File System Access API 的保存面板
 */
function supportsFilePicker(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

/**
 * 从文件名推导扩展名，用于 accept 配置
 */
function getExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/)
  return match ? `.${match[1]}` : ''
}

/**
 * 使用浏览器"另存为"对话框保存文件。
 *
 * - 支持 File System Access API 时：弹出系统保存对话框，用户可选择目录和文件名
 * - 不支持时：回退到 <a download>，保存至浏览器默认下载目录
 *
 * @returns `'picker'` 表示使用了文件选择框；`'fallback'` 表示使用了降级方案
 */
export async function saveFile(options: SaveFileOptions): Promise<'picker' | 'fallback'> {
  const { blob, suggestedName, mimeType, description } = options
  const ext = getExtension(suggestedName)

  if (supportsFilePicker()) {
    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: description || suggestedName,
            accept: { [mimeType]: ext ? [ext] : [] },
          },
        ],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'picker'
    } catch (err: any) {
      // 用户点击"取消"时 DOMException name 为 'AbortError'，静默处理
      if (err?.name === 'AbortError') {
        return 'picker' // 已取消，视为成功处理（不做降级下载）
      }
      // 其他错误（权限等）降级
      console.warn('[fileSaver] showSaveFilePicker failed, falling back:', err)
    }
  }

  // 降级方案：<a download>
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return 'fallback'
}
