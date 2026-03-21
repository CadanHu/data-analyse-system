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
  let result = option

  // Fix visualMap
  if (result.visualMap) {
    const maps = Array.isArray(result.visualMap) ? result.visualMap : [result.visualMap]
    const valid = maps.filter((vm: any) => vm.type === 'continuous' || vm.type === 'piecewise')
    if (valid.length !== maps.length) {
      result = { ...result, visualMap: valid.length === 1 ? valid[0] : valid.length === 0 ? undefined : valid }
    }
  }

  // Convert geo map series to bar chart (ECharts 5 removed built-in map data;
  // without echarts.registerMap() the internal .regions access crashes)
  const seriesArr: any[] = Array.isArray(result.series)
    ? result.series
    : result.series
    ? [result.series]
    : []

  const hasMapSeries = seriesArr.some((s: any) => s?.type === 'map')
  const hasGeo = !!(result as any).geo

  if (hasMapSeries || hasGeo) {
    // Collect data from map series AND scatter/effectScatter on geo
    const mapData: { name: string; value: number }[] = []
    const nameSet = new Set<string>()

    for (const s of seriesArr) {
      // type: 'map' — data is [{name, value}]
      if (s?.type === 'map' && Array.isArray(s.data)) {
        for (const item of s.data) {
          if (item?.name && !nameSet.has(item.name)) {
            nameSet.add(item.name)
            mapData.push({ name: item.name, value: Number(item.value) || 0 })
          }
        }
      }
      // type: 'scatter'|'effectScatter' on geo — data is [lng, lat, val] or {name, value:[lng,lat,val]}
      if (
        (s?.type === 'scatter' || s?.type === 'effectScatter') &&
        s?.coordinateSystem === 'geo' &&
        Array.isArray(s.data)
      ) {
        for (const item of s.data) {
          const name: string = item?.name || ''
          const rawVal = Array.isArray(item?.value) ? item.value[2] : item?.value
          if (name && !nameSet.has(name)) {
            nameSet.add(name)
            mapData.push({ name, value: Number(rawVal) || 0 })
          }
        }
      }
    }

    mapData.sort((a, b) => b.value - a.value)
    const top = mapData.slice(0, 20)
    const seriesName =
      seriesArr.find((s: any) => s?.type === 'map' || s?.coordinateSystem === 'geo')?.name || '数值'

    if (top.length > 0) {
      result = {
        ...result,
        geo: undefined,
        visualMap: undefined,
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: top.map(d => d.name), axisLabel: { fontSize: 11 } },
        series: [{
          type: 'bar',
          name: seriesName,
          data: top.map(d => d.value),
          itemStyle: { borderRadius: [0, 4, 4, 0] },
        }],
      } as EChartsOption
    } else {
      // No extractable data — remove geo/map to at least prevent crash
      result = {
        ...result,
        geo: undefined,
        visualMap: undefined,
        series: seriesArr.filter(
          (s: any) => s?.type !== 'map' && s?.coordinateSystem !== 'geo'
        ),
      } as EChartsOption
    }
  }

  return result
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
