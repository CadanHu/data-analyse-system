/**
 * chartExportService.ts — ECharts 图表导出服务
 *
 * 将已渲染的 ECharts 实例导出为 PNG 图片。
 * - Native：写入 Capacitor Filesystem.Cache，调用 Share 分享
 * - Web：触发浏览器下载
 */

import * as echarts from 'echarts'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * 将 ECharts 实例导出为 base64 PNG 字符串（不含 data:image/png;base64, 前缀）
 */
export function chartInstanceToBase64(instance: echarts.ECharts): string {
  const dataUrl = instance.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#fff',
  })
  // 去除前缀 "data:image/png;base64,"
  return dataUrl.replace(/^data:image\/png;base64,/, '')
}

/**
 * 导出图表图片
 * - Native：保存到设备相册/文件并调起系统分享面板
 * - Web：触发 <a download> 下载
 */
export async function exportChartImage(
  instance: echarts.ECharts,
  filename = `chart_${Date.now()}.png`
): Promise<void> {
  const dataUrl = instance.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#fff',
  })
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')

  if (Capacitor.isNativePlatform()) {
    const path = `charts/${filename}`
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    })
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
    await Share.share({
      title: 'Chart',
      url: uri,
      dialogTitle: '分享图表',
    })
  } else {
    // Web：触发下载
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    a.click()
  }
}
