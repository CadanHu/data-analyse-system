/**
 * fileCache.ts — 服务器文件本地缓存
 *
 * 场景：用户在家庭 Wi-Fi 上传 PDF → 离开家后仍能查看
 * 原理：文件上传成功后立即把文件下载到 Capacitor Filesystem（设备沙盒）
 *       存储映射 serverUrl → capacitor:// URI（可直接用于 <iframe src>）
 *       换 Wi-Fi / 断网后，resolveUrl() 返回本地 URI，无需服务器
 *
 * iOS/Android 均支持；Web 环境直接返回原始 URL（无需缓存）
 */

import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

const CACHE_MAP_KEY = 'dp_file_cache_map'

// ==================== 持久化映射 ====================

function getMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_MAP_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveMap(map: Record<string, string>) {
  try {
    localStorage.setItem(CACHE_MAP_KEY, JSON.stringify(map))
  } catch { /* quota exceeded, ignore */ }
}

// ==================== 核心 API ====================

/**
 * 下载 serverUrl 对应的文件并保存到设备本地。
 * 成功后返回可直接用于 <iframe src> 的本地 capacitor:// URI。
 * 如已缓存直接返回本地 URI，不重复下载。
 */
export async function cacheFile(serverUrl: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return serverUrl
  if (!serverUrl?.startsWith('http')) return serverUrl

  const map = getMap()

  // Already cached → verify file still exists
  if (map[serverUrl]) {
    try {
      const filename = urlToFilename(serverUrl)
      await Filesystem.stat({ path: filename, directory: Directory.Data })
      return map[serverUrl]
    } catch {
      // File missing (e.g. app reinstall) → re-download
      delete map[serverUrl]
    }
  }

  // Download
  const response = await fetch(serverUrl)
  if (!response.ok) throw new Error(`[FileCache] Download failed: ${response.status} ${serverUrl}`)

  const blob = await response.blob()
  const base64 = await blobToBase64(blob)

  const filename = urlToFilename(serverUrl)

  await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Data,
    recursive: true,
  })

  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Data })
  const localUri = Capacitor.convertFileSrc(uri)

  map[serverUrl] = localUri
  saveMap(map)

  console.log(`[FileCache] Cached: ${serverUrl} → ${localUri}`)
  return localUri
}

/**
 * 同步解析 URL：已缓存则返回 capacitor:// URI，否则返回原始 serverUrl。
 * 用于渲染时同步替换，不阻塞 UI。
 */
export function resolveUrl(serverUrl: string | null | undefined): string {
  if (!serverUrl) return ''
  if (!Capacitor.isNativePlatform()) return serverUrl
  if (!serverUrl.startsWith('http')) return serverUrl
  return getMap()[serverUrl] || serverUrl
}

/**
 * 检查某个 URL 是否已被本地缓存
 */
export function isCached(serverUrl: string): boolean {
  if (!Capacitor.isNativePlatform()) return false
  return !!getMap()[serverUrl]
}

// ==================== 工具函数 ====================

function urlToFilename(url: string): string {
  try {
    const { pathname } = new URL(url)
    // e.g. /uploads/report_abc123.pdf → filecache/_uploads_report_abc123.pdf
    const safe = pathname.replace(/[^a-zA-Z0-9._-]/g, '_')
    return `filecache/${safe}`
  } catch {
    return `filecache/${Date.now()}`
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
