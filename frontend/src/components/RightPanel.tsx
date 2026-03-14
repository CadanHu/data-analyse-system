import { useState, useMemo } from 'react'
import EChartsRenderer from './EChartsRenderer'
import { useChatStore } from '../stores/chatStore'
import { useTranslation } from '../hooks/useTranslation'

/**
 * 指标卡片组件 - 用于展示单一核心数值
 */
function MetricCard({ value, label }: { value: any; label: string; unit?: string }) {
  const formattedValue = typeof value === 'number' 
    ? new Intl.NumberFormat('en-US').format(value)
    : value;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-white/80 to-[#BFFFD9]/20 backdrop-blur-md rounded-3xl border border-white/50 shadow-[0_8px_32px_rgba(191,255,217,0.15)] min-h-[300px] select-text">
      <div className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-widest">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-5xl md:text-6xl font-black bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
          {formattedValue}
        </span>
      </div>
      <div className="mt-6 w-12 h-1 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] rounded-full opacity-60" />
    </div>
  );
}

/**
 * 数据表格组件
 */
function DataTable({ sqlResult, onExportCsv }: { sqlResult: any; onExportCsv: () => void }) {
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [filterText, setFilterText] = useState('')
  const { t } = useTranslation()

  const columns = sqlResult?.columns || []
  const rows = sqlResult?.rows || []

  const filteredRows = useMemo(() => {
    if (!filterText) return rows
    return rows.filter((row: any) =>
      Object.values(row).some(val =>
        String(val).toLowerCase().includes(filterText.toLowerCase())
      )
    )
  }, [rows, filterText])

  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows
    return [...filteredRows].sort((a: any, b: any) => {
      const aVal = a[sortColumn]; const bVal = b[sortColumn]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortOrder === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })
  }, [filteredRows, sortColumn, sortOrder])

  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRows = sortedRows.slice(startIndex, startIndex + itemsPerPage)

  return (
    <div className="h-full flex flex-col">
      <div className="flex-none p-4 border-b border-white/30 flex items-center justify-between gap-2">
        <input
          type="text"
          placeholder={t('panel.filter')}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="flex-1 px-4 py-2 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm"
        />
        <button onClick={onExportCsv} className="px-4 py-2 bg-white/80 rounded-xl text-sm shadow-sm border border-white hover:bg-gray-50 transition-colors">{t('panel.export')}</button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm select-text">
          <thead className="bg-white/40 sticky top-0">
            <tr>
              {columns.map((col: string) => (
                <th key={col} className="px-4 py-3 text-left font-semibold text-gray-500">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row: any, idx: number) => (
              <tr key={idx} className="border-b border-white/10 hover:bg-white/20">
                {columns.map((col: string) => (
                  <td key={col} className="px-4 py-2 text-gray-600">{String(row[col] ?? '-')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * 降级方案：自动生成图表配置
 */
function fallbackGenerateChart(sqlResult: any, type: string, t: any) {
  if (!sqlResult?.rows?.length || !sqlResult?.columns?.length) return null;
  const columns = sqlResult.columns;
  const rows = sqlResult.rows;
  
  const numericCols = columns.filter((c: string) => typeof rows[0][c] === 'number');
  const categoryCols = columns.filter((c: string) => !numericCols.includes(c));
  
  const x = categoryCols[0] || columns[0];
  const y = numericCols[0] || columns[1] || columns[0];

  const base = {
    title: { 
      text: t('common.success'), 
      left: 'center', 
      top: 10, 
      textStyle: { fontSize: 14, color: '#374151', fontWeight: 'bold' } 
    },
    tooltip: { 
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderWidth: 0,
      shadowBlur: 10,
      shadowColor: 'rgba(0, 0, 0, 0.1)',
      textStyle: { color: '#1f2937' }
    },
    grid: { 
      top: 80, 
      bottom: 100, 
      left: 80,    
      right: 50, 
      containLabel: true 
    },
    xAxis: { 
      type: 'category', 
      data: rows.map((r: any) => String(r[x])),
      axisLabel: { 
        rotate: 45,      
        fontSize: 10, 
        interval: 0,     
        color: '#6b7280',
        hideOverlap: true 
      },
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      boundaryGap: true 
    },
    yAxis: { 
      type: 'value', 
      axisLabel: { fontSize: 10, color: '#6b7280' },
      axisLine: { show: false },
      splitLine: { lineStyle: { type: 'dashed', color: '#f3f4f6' } }
    },
  };

  switch (type) {
    case 'bar':
      return { ...base, series: [{ name: y, type: 'bar', data: rows.map((r: any) => r[y]), itemStyle: { borderRadius: [4, 4, 0, 0] }, barMaxWidth: 40 }] };
    case 'line':
      return { ...base, series: [{ name: y, type: 'line', data: rows.map((r: any) => r[y]), smooth: true, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3 } }] };
    case 'area':
      return { ...base, series: [{ name: y, type: 'line', data: rows.map((r: any) => r[y]), smooth: true, areaStyle: { opacity: 0.2 }, symbolSize: 6 }] };
    case 'scatter':
      return { ...base, xAxis: { type: 'value', axisLabel: { fontSize: 10 } }, series: [{ type: 'scatter', data: rows.map((r: any) => [r[columns[0]], r[columns[1]]]), symbolSize: 15, itemStyle: { opacity: 0.7 } }] };
    case 'pie':
      return { 
        title: base.title, 
        tooltip: { trigger: 'item' }, 
        series: [{ 
          type: 'pie', 
          radius: ['35%', '65%'], 
          avoidLabelOverlap: true, 
          label: { fontSize: 10 },
          data: rows.map((r: any) => ({ name: String(r[x]), value: r[y] })) 
        }] 
      };
    case 'radar':
      const indicators = numericCols.map((col: string) => ({ name: col, max: Math.max(...rows.map((r: any) => r[col])) * 1.2 }));
      return {
        title: base.title,
        tooltip: {},
        radar: { 
          indicator: indicators, 
          center: ['50%', '58%'], 
          radius: '55%',
          axisName: { color: '#6b7280', fontSize: 10 } 
        },
        series: [{
          type: 'radar',
          areaStyle: { opacity: 0.1 },
          data: rows.slice(0, 3).map((r: any) => ({
            value: numericCols.map((col: string) => r[col]),
            name: String(r[x])
          }))
        }]
      };
    case 'funnel':
      return {
        title: base.title,
        tooltip: { trigger: 'item' },
        series: [{
          type: 'funnel',
          left: '15%', top: 100, bottom: 40, width: '70%',
          label: { position: 'inside', fontSize: 10 }, 
          data: rows.map((r: any) => ({ name: String(r[x]), value: r[y] }))
        }]
      };
    case 'gauge':
      return {
        title: base.title,
        series: [{
          type: 'gauge',
          center: ['50%', '60%'],
          radius: '85%',
          startAngle: 200,
          endAngle: -20,
          pointer: { width: 4 },
          progress: { show: true, width: 8 },
          axisLine: { lineStyle: { width: 8 } },
          axisTick: { show: false },
          splitLine: { length: 10, lineStyle: { width: 2, color: '#999' } }, 
          axisLabel: { distance: 15, color: '#999', fontSize: 9 },
          detail: { 
            valueAnimation: true, 
            formatter: '{value}%', 
            fontSize: 20, 
            offsetCenter: [0, '70%'],
            color: '#1f2937'
          },
          data: [{ value: rows[0][y], name: String(rows[0][x]) }]
        }]
      };
    case 'heatmap':
      const xData = Array.from(new Set(rows.map((r: any) => String(r[columns[0]]))))
      const yData = Array.from(new Set(rows.map((r: any) => String(r[columns[1]]))))
      return {
        title: base.title,
        tooltip: { position: 'top' },
        grid: { top: 100, bottom: 100, left: 100, right: 50, containLabel: true },
        xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10, rotate: 30 } },
        yAxis: { type: 'category', data: yData, axisLabel: { fontSize: 10 } },
        visualMap: { 
          min: 0, 
          max: Math.max(...rows.map((r: any) => r[y])), 
          calculable: true, 
          orient: 'horizontal', 
          left: 'center', 
          bottom: 20, 
          itemHeight: 120,
          textStyle: { fontSize: 10 }
        },
        series: [{ 
          type: 'heatmap', 
          data: rows.map((r: any) => [String(r[columns[0]]), String(r[columns[1]]), r[y]]), 
          label: { show: rows.length < 20, fontSize: 9 } 
        }]
      };
    case 'treemap':
      return {
        title: base.title,
        series: [{
          type: 'treemap',
          top: 80, bottom: 20,
          breadcrumb: { show: false },
          label: { fontSize: 10 },
          data: rows.map((r: any) => ({ name: String(r[x]), value: r[y] }))
        }]
      };
    case 'candlestick':
      return {
        title: base.title,
        grid: { ...base.grid, bottom: 120 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        xAxis: { ...base.xAxis, axisLabel: { ...base.xAxis.axisLabel, rotate: 45 } },
        yAxis: { scale: true, axisLabel: { fontSize: 10 } },
        series: [{
          type: 'candlestick',
          data: rows.map((r: any) => [
            r['open'] || r[columns[1]], 
            r['close'] || r[columns[2]], 
            r['low'] || r[columns[3]], 
            r['high'] || r[columns[4]]
          ])
        }]
      };
    case 'waterfall':
      return {
        title: base.title,
        grid: { top: 80, bottom: 120, left: 80, right: 50, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: { ...base.xAxis, axisLabel: { rotate: 45, fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
        series: [
          {
            name: 'Placeholder',
            type: 'bar',
            stack: 'Total',
            itemStyle: { borderColor: 'transparent', color: 'transparent' },
            emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } },
            data: rows.map((r: any, i: number) => {
              let sum = 0;
              for (let j = 0; j < i; j++) {
                const val = rows[j][y];
                if (val > 0) sum += val;
              }
              return sum;
            })
          },
          {
            name: 'Value',
            type: 'bar',
            stack: 'Total',
            label: { show: true, position: 'top', fontSize: 9, color: '#374151' },
            data: rows.map((r: any) => r[y])
          }
        ]
      };
    case 'gantt':
      return {
        title: base.title,
        tooltip: { 
          formatter: (params: any) => {
            const data = rows[params.dataIndex];
            return `${params.name}<br/>Start: ${data.start_date}<br/>End: ${data.end_date}`;
          }
        },
        grid: { left: 120, top: 80, bottom: 60, right: 50, containLabel: true },
        xAxis: { type: 'time', axisLabel: { fontSize: 10, rotate: 30 } },
        yAxis: { type: 'category', data: rows.map((r: any) => String(r[x])), axisLabel: { fontSize: 10 } },
        series: [{
          type: 'bar',
          itemStyle: { borderRadius: 5, color: '#06d6a0' },
          data: rows.map((r: any, idx: number) => ({
            name: String(r[x]),
            value: [idx, r['start_date'] || r[columns[1]], r['end_date'] || r[columns[2]]]
          }))
        }]
      };
    default:
      return null;
  }
}

export default function RightPanel() {
  const { t } = useTranslation()
  const { 
    currentChartOption, 
    currentChartType, 
    currentSqlResult, 
    currentSql, 
    setRightPanelVisible,
    isFullScreen,
    setFullScreen
  } = useChatStore()
  
  const [activeType, setActiveType] = useState<string>('auto')

  const CHART_TYPES = [
    { key: 'auto', label: t('panel.auto'), icon: '🧠' },
    { key: 'line', label: t('panel.line'), icon: '📈' },
    { key: 'area', label: t('panel.area'), icon: '🌊' },
    { key: 'bar', label: t('panel.bar'), icon: '📊' },
    { key: 'pie', label: t('panel.pie'), icon: '🥧' },
    { key: 'scatter', label: t('panel.scatter'), icon: '✨' },
    { key: 'radar', label: t('panel.radar'), icon: '🕸️' },
    { key: 'funnel', label: t('panel.funnel'), icon: '⏳' },
    { key: 'gauge', label: t('panel.gauge'), icon: '⏲️' },
    { key: 'candlestick', label: t('panel.candlestick'), icon: '🕯️' },
    { key: 'heatmap', label: t('panel.heatmap'), icon: '🔥' },
    { key: 'treemap', label: t('panel.treemap'), icon: '🌳' },
    { key: 'sankey', label: t('panel.sankey'), icon: '🔀' },
    { key: 'boxplot', label: t('panel.boxplot'), icon: '📦' },
    { key: 'waterfall', label: t('panel.waterfall'), icon: '⛲' },
    { key: 'map', label: t('panel.map'), icon: '🗺️' },
    { key: 'gantt', label: t('panel.gantt'), icon: '📅' },
    { key: 'table', label: t('panel.table'), icon: '📋' }
  ]

  const displayConfig = useMemo(() => {
    if (!currentSqlResult) return null
    
    const targetType = activeType === 'auto' ? (currentChartType || 'table') : activeType
    
    if (targetType === 'table') return { type: 'table' }
    
    if (targetType === 'card' || (currentSqlResult.rows.length === 1 && currentSqlResult.columns.length === 1)) {
      const col = currentSqlResult.columns[0]
      return {
        type: 'card',
        value: currentSqlResult.rows[0][col],
        label: col
      }
    }

    if (activeType === 'auto' && currentChartOption) {
      return { type: 'chart', option: currentChartOption }
    }

    const generatedOption = fallbackGenerateChart(currentSqlResult, targetType, t)
    return { type: 'chart', option: generatedOption }
  }, [currentSqlResult, currentChartOption, currentChartType, activeType, t])

  const renderInnerContent = () => {
    if (!displayConfig) return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
        <div className="text-4xl opacity-20">📊</div>
        <p className="text-sm font-medium">{t('panel.noData')}</p>
      </div>
    )

    switch (displayConfig.type) {
      case 'card':
        return <MetricCard value={displayConfig.value} label={displayConfig.label} />
      case 'table':
        return <DataTable sqlResult={currentSqlResult} onExportCsv={() => {}} />
      case 'chart':
        return displayConfig.option 
          ? <EChartsRenderer option={displayConfig.option} /> 
          : <div className="p-8 text-center text-gray-400">{t('panel.unsupported')} {activeType}</div>
      default:
        return null
    }
  }

  return (
    <div className="flex-none flex flex-col h-full bg-gradient-to-br from-[#f8f9fa] to-white overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-3 sm:p-4 border-b border-white/30">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 tracking-tight truncate mr-2">{t('panel.dataPivot')}</h2>
            <div className="flex gap-1.5 sm:gap-2 flex-none">
              <button 
                onClick={() => setFullScreen(!isFullScreen)} 
                className={`p-2 rounded-xl border transition-all shadow-sm flex items-center justify-center ${
                  isFullScreen 
                    ? 'bg-blue-500 text-white border-blue-200' 
                    : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'
                }`}
                title={isFullScreen ? t('panel.exitFullscreen') : t('panel.fullscreen')}
              >
                {isFullScreen ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0M4 4l0 5m11 0l5-5m0 0l-5 0m5 0l0 5m-5 11l5 5m0 0l-5 0m5 0l0-5m-11 0l-5 5m0 0l5 0m-5 0l0-5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
              <button onClick={() => setRightPanelVisible(false)} className="p-2 bg-white text-gray-400 rounded-xl border border-gray-100 shadow-sm hover:text-gray-600 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-1 bg-gray-100/50 rounded-2xl">
            <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 lg:grid-cols-6 gap-1">
              {CHART_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveType(t.key)}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg text-[9px] font-bold transition-all ${
                    activeType === t.key 
                      ? 'bg-white text-blue-600 shadow-sm border-white scale-105 z-10' 
                      : 'text-gray-400 hover:text-gray-600 border-transparent'
                  } border`}
                >
                  <span className="text-sm">{t.icon}</span>
                  <span className="truncate w-full text-center scale-90">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {currentSql && (
          <details className="mx-4 mt-4 group">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">
              <span className="group-open:rotate-90 transition-transform">▶</span> {t('panel.executedSql')}
            </summary>
            <pre className="mt-2 p-4 bg-gray-900 rounded-2xl text-[11px] text-emerald-400 font-mono overflow-auto border border-white/10 shadow-inner select-text">
              {currentSql}
            </pre>
          </details>
        )}

        <div className="p-4 min-h-[400px]">
          <div className="w-full h-full rounded-[2rem] overflow-hidden">
            {renderInnerContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
