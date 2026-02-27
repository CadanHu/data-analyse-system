import { useState, useMemo } from 'react'
import EChartsRenderer from './EChartsRenderer'
import { useChatStore } from '../stores/chatStore'

const CHART_TYPES = [
  { key: 'auto', label: '智能推荐', icon: '🧠' },
  { key: 'line', label: '折线图', icon: '📈' },
  { key: 'area', label: '面积图', icon: '🌊' },
  { key: 'bar', label: '柱状/条形', icon: '📊' },
  { key: 'pie', label: '饼图/环形', icon: '🥧' },
  { key: 'scatter', label: '散点/气泡', icon: '✨' },
  { key: 'radar', label: '雷达图', icon: '🕸️' },
  { key: 'funnel', label: '漏斗图', icon: '⏳' },
  { key: 'gauge', label: '仪表盘', icon: '⏲️' },
  { key: 'candlestick', label: '蜡烛图', icon: '🕯️' },
  { key: 'heatmap', label: '热力图', icon: '🔥' },
  { key: 'treemap', label: '树状图', icon: '🌳' },
  { key: 'sankey', label: '桑基图', icon: '🔀' },
  { key: 'boxplot', label: '箱线图', icon: '📦' },
  { key: 'waterfall', label: '瀑布图', icon: '⛲' },
  { key: 'map', label: '地理地图', icon: '🗺️' },
  { key: 'gantt', label: '甘特图', icon: '📅' },
  { key: 'table', label: '原始表格', icon: '📋' }
]

/**
 * 指标卡片组件 - 用于展示单一核心数值
 */
function MetricCard({ value, label, unit }: { value: any; label: string; unit?: string }) {
  // 简单的数值格式化
  const formattedValue = typeof value === 'number' 
    ? new Intl.NumberFormat('zh-CN').format(value)
    : value;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-white/80 to-[#BFFFD9]/20 backdrop-blur-md rounded-3xl border border-white/50 shadow-[0_8px_32px_rgba(191,255,217,0.15)] min-h-[300px]">
      <div className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-widest">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-5xl md:text-6xl font-black bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
          {formattedValue}
        </span>
        {unit && <span className="text-lg font-bold text-gray-400">{unit}</span>}
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
          placeholder="过滤数据..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="flex-1 px-4 py-2 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm"
        />
        <button onClick={onExportCsv} className="px-4 py-2 bg-white/80 rounded-xl text-sm shadow-sm border border-white">导出</button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
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
function fallbackGenerateChart(sqlResult: any, type: string) {
  if (!sqlResult?.rows?.length || !sqlResult?.columns?.length) return null;
  const columns = sqlResult.columns;
  const rows = sqlResult.rows;
  
  // 识别数值列
  const numericCols = columns.filter((c: string) => typeof rows[0][c] === 'number');
  const categoryCols = columns.filter((c: string) => !numericCols.includes(c));
  
  const x = categoryCols[0] || columns[0];
  const y = numericCols[0] || columns[1] || columns[0];

  const base = {
    title: { text: '分析结果', left: 'center', top: 10, textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { top: 60, bottom: 80, left: 60, right: 40, containLabel: true },
    xAxis: { 
      type: 'category', 
      data: rows.map((r: any) => String(r[x])),
      axisLabel: { rotate: 35, fontSize: 10, interval: 'auto' }
    },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
  };

  switch (type) {
    case 'bar':
      return { ...base, series: [{ name: y, type: 'bar', data: rows.map((r: any) => r[y]), itemStyle: { borderRadius: [4, 4, 0, 0] } }] };
    case 'line':
      return { ...base, series: [{ name: y, type: 'line', data: rows.map((r: any) => r[y]), smooth: true, symbol: 'circle', symbolSize: 8 }] };
    case 'area':
      return { ...base, series: [{ name: y, type: 'line', data: rows.map((r: any) => r[y]), smooth: true, areaStyle: { opacity: 0.3 } }] };
    case 'scatter':
      return { ...base, xAxis: { type: 'value' }, series: [{ type: 'scatter', data: rows.map((r: any) => [r[columns[0]], r[columns[1]]]), symbolSize: 12 }] };
    case 'pie':
      return { title: base.title, tooltip: { trigger: 'item' }, series: [{ type: 'pie', radius: ['40%', '70%'], avoidLabelOverlap: true, data: rows.map((r: any) => ({ name: String(r[x]), value: r[y] })) }] };
    case 'radar':
      const indicators = numericCols.map((col: string) => ({ name: col, max: Math.max(...rows.map((r: any) => r[col])) * 1.2 }));
      return {
        title: base.title,
        tooltip: {},
        radar: { indicator: indicators, center: ['50%', '55%'], radius: '60%' },
        series: [{
          type: 'radar',
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
          left: '10%', top: 80, bottom: 40, width: '80%',
          data: rows.map((r: any) => ({ name: String(r[x]), value: r[y] }))
        }]
      };
    case 'gauge':
      return {
        series: [{
          type: 'gauge',
          detail: { formatter: '{value}%', fontSize: 18 },
          data: [{ value: rows[0][y], name: String(rows[0][x]) }]
        }]
      };
    case 'heatmap':
      const xData = Array.from(new Set(rows.map((r: any) => String(r[columns[0]]))))
      const yData = Array.from(new Set(rows.map((r: any) => String(r[columns[1]]))))
      return {
        title: base.title,
        tooltip: { position: 'top' },
        grid: { top: 80, bottom: 80, left: 80, right: 40, containLabel: true },
        xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'category', data: yData, axisLabel: { fontSize: 10 } },
        visualMap: { 
          min: 0, 
          max: Math.max(...rows.map((r: any) => r[y])), 
          calculable: true, 
          orient: 'horizontal', 
          left: 'center', 
          bottom: 10,
          inRange: { color: ['#e0ffff', '#06d6a0', '#ff5f56'] }
        },
        series: [{ type: 'heatmap', data: rows.map((r: any) => [String(r[columns[0]]), String(r[columns[1]]), r[y]]), label: { show: rows.length < 50 } }]
      };
    case 'treemap':
      return {
        title: base.title,
        series: [{
          type: 'treemap',
          breadcrumb: { show: false },
          data: rows.map((r: any) => ({ name: String(r[x]), value: r[y] }))
        }]
      };
    case 'candlestick':
      return {
        title: base.title,
        grid: base.grid,
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        xAxis: base.xAxis,
        yAxis: { scale: true, axisLabel: { fontSize: 10 } },
        series: [{
          type: 'candlestick',
          data: rows.map((r: any) => [r['open'] || r[columns[1]], r['close'] || r[columns[2]], r['low'] || r[columns[3]], r['high'] || r[columns[4]]])
        }]
      };
    case 'waterfall':
      return {
        title: base.title,
        grid: { top: 80, bottom: 100, left: 60, right: 40, containLabel: true },
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
            label: { show: true, position: 'top', fontSize: 9 },
            data: rows.map((r: any) => r[y])
          }
        ]
      };
    case 'gantt':
      return {
        title: base.title,
        tooltip: { formatter: (params: any) => params.name + ': ' + params.value[1] + ' to ' + params.value[2] },
        grid: { left: 100, top: 80, bottom: 40 },
        xAxis: { type: 'time', axisLabel: { fontSize: 10 } },
        yAxis: { type: 'category', data: rows.map((r: any) => String(r[x])), axisLabel: { fontSize: 10 } },
        series: [{
          type: 'bar',
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
  const { 
    currentChartOption, 
    currentChartType, 
    currentSqlResult, 
    currentSql, 
    setRightPanelVisible,
    isFullScreen,
    setFullScreen
  } = useChatStore()
  
  // 状态：当前选中的 Tab。'auto' 表示尊重 AI 建议
  const [activeType, setActiveType] = useState<string>('auto')

  // 计算最终要展示的内容
  const displayConfig = useMemo(() => {
    if (!currentSqlResult) return null
    
    // 目标类型：如果用户选了 auto，则用 AI 建议；否则用用户选的
    const targetType = activeType === 'auto' ? (currentChartType || 'table') : activeType
    
    if (targetType === 'table') return { type: 'table' }
    
    // 如果是 card 模式
    if (targetType === 'card' || (currentSqlResult.rows.length === 1 && currentSqlResult.columns.length === 1)) {
      const col = currentSqlResult.columns[0]
      return {
        type: 'card',
        value: currentSqlResult.rows[0][col],
        label: col
      }
    }

    // 关键逻辑：如果用户手动切换了类型，且该类型与 AI 建议的类型不同，则必须走 fallback 生成逻辑
    // 只有在 activeType === 'auto' 且有 currentChartOption 时才使用 AI 的原始配置
    if (activeType === 'auto' && currentChartOption) {
      return { type: 'chart', option: currentChartOption }
    }

    // 否则，基于当前 SQL 结果手动生成对应类型的配置
    const generatedOption = fallbackGenerateChart(currentSqlResult, targetType)
    return { type: 'chart', option: generatedOption }
  }, [currentSqlResult, currentChartOption, currentChartType, activeType])

  const renderInnerContent = () => {
    if (!displayConfig) return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
        <div className="text-4xl opacity-20">📊</div>
        <p className="text-sm font-medium">暂无分析数据</p>
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
          : <div className="p-8 text-center text-gray-400">该数据格式不适合展示为 {activeType}</div>
      default:
        return null
    }
  }

  return (
    <div className="flex-none flex flex-col h-full bg-gradient-to-br from-[#f8f9fa] to-white overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* 顶部控制栏 */}
        <div className="p-3 sm:p-4 border-b border-white/30">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 tracking-tight truncate mr-2">数据透视</h2>
            <div className="flex gap-1.5 sm:gap-2 flex-none">
              <button onClick={() => setFullScreen(!isFullScreen)} className="p-1.5 sm:p-2 bg-white/80 rounded-xl border border-white shadow-sm hover:bg-white transition-all text-sm">
                {isFullScreen ? '↙️' : '⛶'}
              </button>
              <button onClick={() => setRightPanelVisible(false)} className="p-1.5 sm:p-2 bg-white/80 rounded-xl border border-white shadow-sm text-gray-400 hover:text-gray-600 transition-all text-sm">✕</button>
            </div>
          </div>

          {/* 优化的图表类型选择器：网格布局 + 自动换行，确保所有按钮都可见 */}
          <div className="p-1.5 bg-gray-100/50 rounded-2xl">
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {CHART_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveType(t.key)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10px] font-semibold transition-all ${
                    activeType === t.key 
                      ? 'bg-white text-gray-800 shadow-sm border-white' 
                      : 'text-gray-400 hover:text-gray-600 border-transparent'
                  } border`}
                >
                  <span className="text-sm">{t.icon}</span>
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SQL 查看器 (默认收起) */}
        {currentSql && (
          <details className="mx-4 mt-4 group">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">
              <span className="group-open:rotate-90 transition-transform">▶</span> 执行的 SQL
            </summary>
            <pre className="mt-2 p-4 bg-gray-900 rounded-2xl text-[11px] text-emerald-400 font-mono overflow-auto border border-white/10 shadow-inner">
              {currentSql}
            </pre>
          </details>
        )}

        {/* 主画布 */}
        <div className="p-4 min-h-[400px]">
          <div className="w-full h-full rounded-[2rem] overflow-hidden">
            {renderInnerContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
