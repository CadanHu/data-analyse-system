import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

interface EChartsRendererProps {
  option: EChartsOption | null
  style?: React.CSSProperties
  onChartReady?: (instance: echarts.ECharts) => void
}

// Remove invalid visualMap types (only "continuous" and "piecewise" are valid in ECharts)
function sanitizeOption(option: EChartsOption): EChartsOption {
  if (!option.visualMap) return option
  const maps = Array.isArray(option.visualMap) ? option.visualMap : [option.visualMap]
  const valid = maps.filter((vm: any) => vm.type === 'continuous' || vm.type === 'piecewise')
  if (valid.length === maps.length) return option
  return { ...option, visualMap: valid.length === 1 ? valid[0] : valid.length === 0 ? undefined : valid }
}

export default function EChartsRenderer({ option, style, onChartReady }: EChartsRendererProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    chartInstanceRef.current = echarts.init(chartRef.current)
    onChartReady?.(chartInstanceRef.current)

    const handleResize = () => {
      chartInstanceRef.current?.resize()
    }
    
    // 使用 ResizeObserver 监听容器大小变化
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(chartRef.current)

    window.addEventListener('resize', handleResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      chartInstanceRef.current?.dispose()
      chartInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (chartInstanceRef.current && option) {
      const safeOption = sanitizeOption(option)
      chartInstanceRef.current.setOption(safeOption, true)
    }
  }, [option])

  return (
    <div
      ref={chartRef}
      className="w-full h-full min-h-[450px]"
      style={{
        ...style
      }}
    />
  )
}
