import { useState, useMemo } from 'react'
import EChartsRenderer from './EChartsRenderer'
import { useChatStore } from '../stores/chatStore'

const CHART_TYPES = [
  { key: 'auto', label: '智能推荐', icon: '🧠' },
  { key: 'bar', label: '柱状图', icon: '📊' },
  { key: 'line', label: '折线图', icon: '📈' },
  { key: 'pie', label: '饼图', icon: '🥧' },
  { key: 'table', label: '表格', icon: '📋' }
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
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-white/80 to-[#BFFFD9]/20 backdrop-blur-md rounded-3xl border border-white/50 shadow-[0_8px_32px_rgba(191,255,217,0.15)]">
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
    
    // 如果用户手动切换了类型，则覆盖 AI 的建议
    const targetType = activeType === 'auto' ? (currentChartType || 'table') : activeType
    
    if (targetType === 'table') return { type: 'table' }
    
    // 如果是 card 模式（AI 建议或者是单行单列）
    if (targetType === 'card' || (currentSqlResult.rows.length === 1 && currentSqlResult.columns.length === 1)) {
      const col = currentSqlResult.columns[0]
      return {
        type: 'card',
        value: currentSqlResult.rows[0][col],
        label: col
      }
    }

    return { type: 'chart', option: currentChartOption }
  }, [currentSqlResult, currentChartOption, currentChartType, activeType])

  const renderInnerContent = () => {
    if (!displayConfig) return <div className="p-8 text-center text-gray-400">暂无分析数据</div>

    switch (displayConfig.type) {
      case 'card':
        return <MetricCard value={displayConfig.value} label={displayConfig.label} />
      case 'table':
        return <DataTable sqlResult={currentSqlResult} onExportCsv={() => {}} />
      case 'chart':
        return displayConfig.option ? <EChartsRenderer option={displayConfig.option} /> : <div className="p-8 text-center text-gray-400">该格式暂不支持图表</div>
      default:
        return null
    }
  }

  return (
    <div className="flex-none flex flex-col h-full bg-gradient-to-br from-[#f8f9fa] to-white">
      {/* 顶部控制栏 */}
      <div className="p-4 border-b border-white/30">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">数据透视</h2>
          <div className="flex gap-2">
            <button onClick={() => setFullScreen(!isFullScreen)} className="p-2 bg-white/80 rounded-xl border border-white shadow-sm hover:bg-white transition-all">
              {isFullScreen ? '↙️' : '⛶'}
            </button>
            <button onClick={() => setRightPanelVisible(false)} className="p-2 bg-white/80 rounded-xl border border-white shadow-sm text-gray-400">✕</button>
          </div>
        </div>

        <div className="flex gap-1.5 p-1.5 bg-gray-100/50 rounded-2xl">
          {CHART_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveType(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition-all ${
                activeType === t.key 
                  ? 'bg-white text-gray-800 shadow-sm' 
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
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
      <div className="flex-1 p-4 min-h-0 overflow-hidden">
        <div className="w-full h-full rounded-[2rem] overflow-hidden">
          {renderInnerContent()}
        </div>
      </div>
    </div>
  )
}
