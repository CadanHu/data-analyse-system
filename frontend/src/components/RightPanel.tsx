import { useState, useMemo } from 'react'
import * as echarts from 'echarts'
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
  const y = numericCols.find(c => c !== x) || numericCols[0] || columns[1] || columns[0];

  const base = {
    title: { 
      text: '分析结果', 
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
      bottom: 100, // 增加底部空间
      left: 80,    // 增加左侧空间
      right: 50, 
      containLabel: true 
    },
    xAxis: { 
      type: 'category', 
      data: rows.map((r: any) => String(r[x])),
      axisLabel: { 
        rotate: 45,      // 旋转标签
        fontSize: 10, 
        interval: 0,     // 强制显示所有标签
        color: '#6b7280',
        hideOverlap: true // 自动隐藏重叠
      },
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      boundaryGap: true // 留出边缘间距
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
      const isXNumeric = typeof rows[0][x] === 'number';
      return { 
        ...base, 
        xAxis: { 
          ...base.xAxis,
          type: isXNumeric ? 'value' : 'category', 
          data: isXNumeric ? undefined : rows.map((r: any) => String(r[x])),
          axisLabel: { ...base.xAxis.axisLabel, fontSize: 10 } 
        }, 
        series: [{ 
          name: y,
          type: 'scatter', 
          data: rows.map((r: any) => isXNumeric ? [r[x], r[y]] : r[y]), 
          symbolSize: 15, 
          itemStyle: { opacity: 0.7 } 
        }] 
      };
    case 'pie':
      return { 
        title: base.title, 
        tooltip: { trigger: 'item' }, 
        series: [{ 
          type: 'pie', 
          radius: ['35%', '65%'], 
          avoidLabelOverlap: true, // 开启防重叠
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
          label: { position: 'inside', fontSize: 10 }, // 强制内部展示
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
          splitLine: { length: 10, lineStyle: { width: 2, color: '#999' } }, // 缩短刻度线
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
          bottom: 20, // 移到底部，防止遮挡
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
        yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 } },
        series: [{
          name: 'K线',
          type: 'candlestick',
          itemStyle: {
            color: '#ef4444',
            color0: '#22c55e',
            borderColor: '#ef4444',
            borderColor0: '#22c55e'
          },
          data: rows.map((r: any) => {
            const open = Number(r['open'] || r['开盘价'] || r[columns[1]] || 0);
            const close = Number(r['close'] || r['收盘价'] || r[columns[2]] || 0);
            const v3 = Number(r['low'] || r['最低价'] || r[columns[4]] || r[columns[3]] || 0);
            const v4 = Number(r['high'] || r['最高价'] || r[columns[3]] || r[columns[4]] || 0);
            // 确保 low <= high
            return [open, close, Math.min(v3, v4), Math.max(v3, v4)];
          })
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
            const start = data.start_date || data['开始日期'] || rows[params.dataIndex][columns[1]];
            const end = data.end_date || data['结束日期'] || rows[params.dataIndex][columns[2]];
            return `<b>${params.name}</b><br/>开始: ${start}<br/>结束: ${end}<br/>进度: ${data.progress || data.progress_pct || 0}%`;
          }
        },
        grid: { left: 150, top: 80, bottom: 60, right: 50, containLabel: true },
        xAxis: { 
          type: 'time', 
          position: 'top',
          splitLine: { lineStyle: { type: 'dashed' } },
          axisLabel: { fontSize: 10, color: '#6b7280' }
        },
        yAxis: { 
          type: 'category', 
          data: rows.map((r: any) => String(r[x])), 
          axisLabel: { fontSize: 10, color: '#374151' },
          inverse: true
        },
        series: [{
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const categoryIndex = api.value(0);
            const start = api.coord([api.value(1), categoryIndex]);
            const end = api.coord([api.value(2), categoryIndex]);
            const height = api.size([0, 1])[1] * 0.6;

            const rectShape = echarts.graphic.clipRectByRect({
              x: start[0],
              y: start[1] - height / 2,
              width: end[0] - start[0],
              height: height
            }, {
              x: params.coordSys.x,
              y: params.coordSys.y,
              width: params.coordSys.width,
              height: params.coordSys.height
            });

            return rectShape && {
              type: 'rect',
              transition: ['shape'],
              shape: rectShape,
              style: api.style({
                fill: '#06d6a0',
                stroke: '#05b386',
                lineWidth: 1
              })
            };
          },
          itemStyle: { opacity: 0.8 },
          encode: {
            x: [1, 2],
            y: 0
          },
          data: rows.map((r: any, idx: number) => {
            const s = new Date(r.start_date || r['开始日期'] || r[columns[1]]).getTime();
            const e = new Date(r.end_date || r['结束日期'] || r[columns[2]]).getTime();
            return [idx, s, e];
          })
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
              <button 
                onClick={() => setFullScreen(!isFullScreen)} 
                className={`p-2 rounded-xl border transition-all shadow-sm flex items-center justify-center ${
                  isFullScreen 
                    ? 'bg-blue-500 text-white border-blue-200' 
                    : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'
                }`}
                title={isFullScreen ? "退出全屏" : "全屏展示"}
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

          {/* 优化的图表类型选择器：6列紧凑布局 */}
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
