import { useState, useMemo } from 'react'
import EChartsRenderer from './EChartsRenderer'
import { useChatStore } from '../stores/chatStore'
import type { ChartOption } from '../types/message'

const CHART_TYPES = [
  { key: 'bar', label: '柱状图', icon: '📊' },
  { key: 'line', label: '折线图', icon: '📈' },
  { key: 'pie', label: '饼图', icon: '🥧' },
  { key: 'table', label: '表格', icon: '📋' }
]

function generateChartOption(sqlResult: any, chartType: string): ChartOption | null {
  if (!sqlResult || !sqlResult.rows || sqlResult.rows.length === 0) {
    return null
  }

  const columns = sqlResult.columns || []
  const rows = sqlResult.rows || []

  if (columns.length < 2) {
    return null
  }

  const numericCols: string[] = []
  const categoryCols: string[] = []

  for (const col of columns) {
    const val = rows[0]?.[col]
    if (typeof val === 'number') {
      numericCols.push(col)
    } else {
      categoryCols.push(col)
    }
  }

  const xAxis = categoryCols[0] || columns[0]
  const yAxis = numericCols[0] || (columns[1] || columns[0])

  if (chartType === 'bar') {
    return {
      title: { text: '数据分析', left: 'center' },
      xAxis: { type: 'category', data: rows.map((row: any) => String(row[xAxis])) },
      yAxis: { type: 'value' },
      series: [{ name: yAxis, type: 'bar', data: rows.map((row: any) => row[yAxis]) }]
    }
  } else if (chartType === 'line') {
    return {
      title: { text: '数据分析', left: 'center' },
      xAxis: { type: 'category', data: rows.map((row: any) => String(row[xAxis])) },
      yAxis: { type: 'value' },
      series: [{ name: yAxis, type: 'line', data: rows.map((row: any) => row[yAxis]), smooth: true }]
    }
  } else if (chartType === 'pie') {
    return {
      title: { text: '数据分析', left: 'center' },
      tooltip: { trigger: 'item' },
      series: [{
        name: yAxis,
        type: 'pie',
        radius: '50%',
        data: rows.map((row: any) => ({ value: row[yAxis], name: String(row[xAxis]) }))
      }]
    }
  }

  return null
}

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
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal || '')
      const bStr = String(bVal || '')
      return sortOrder === 'asc' 
        ? aStr.localeCompare(bStr) 
        : bStr.localeCompare(aStr)
    })
  }, [filteredRows, sortColumn, sortOrder])

  const totalPages = Math.ceil(sortedRows.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRows = sortedRows.slice(startIndex, startIndex + itemsPerPage)

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortOrder('asc')
    }
  }

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1)
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1)
  }

  if (!sqlResult || !columns || !rows) {
    return null
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-none p-4 border-b border-white/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <input
            type="text"
            placeholder="搜索表格..."
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value)
              setCurrentPage(1)
            }}
            className="flex-1 px-4 py-2 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#BFFFD9]/70 transition-all"
          />
        </div>
        <button
          onClick={onExportCsv}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] rounded-xl text-sm text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)]"
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          导出 CSV
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-white/60 backdrop-blur-sm text-gray-500 sticky top-0">
            <tr>
              {columns.map((col: string) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-white/40 select-none transition-colors"
                >
                  <div className="flex items-center gap-1">
                    {col}
                    {sortColumn === col && (
                      <svg
                        className={`w-3.5 h-3.5 ${sortOrder === 'desc' ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row: any, idx: number) => (
              <tr key={idx} className="border-b border-white/20 hover:bg-white/30 transition-colors">
                {columns.map((col: string) => (
                  <td key={col} className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-none p-4 border-t border-white/30 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          显示 {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedRows.length)} / 共 {sortedRows.length} 条
        </div>
        <div className="flex items-center gap-2">
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="px-3 py-1.5 bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-[#BFFFD9]/70"
          >
            <option value={5}>5条/页</option>
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 bg-white/60 hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm text-gray-600 transition-all"
          >
            上一页
          </button>
          <span className="text-sm text-gray-400">
            {currentPage} / {totalPages || 1}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 bg-white/60 hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm text-gray-600 transition-all"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RightPanel() {
  const { 
    currentChartOption, 
    currentChartType: defaultChartType, 
    currentSqlResult, 
    currentSql, 
    setRightPanelVisible,
    isFullScreen,
    setFullScreen
  } = useChatStore()
  const [activeType, setActiveType] = useState<string>(defaultChartType || 'bar')

  const displayOption = useMemo(() => {
    if (activeType === 'table') {
      return null
    }
    if (currentSqlResult) {
      return generateChartOption(currentSqlResult, activeType)
    }
    return currentChartOption
  }, [currentSqlResult, currentChartOption, activeType])

  const hasData = currentSqlResult && currentSqlResult.rows && currentSqlResult.rows.length > 0

  const handleExportCsv = () => {
    if (!currentSqlResult) return
    const { columns, rows } = currentSqlResult
    const csvContent = [
      columns.join(','),
      ...rows.map((row: any) => columns.map((col: string) => {
        const val = row[col]
        return val === null || val === undefined ? '' : `"${String(val).replace(/"/g, '""')}"`
      }).join(','))
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `data_export_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExportSql = () => {
    if (!currentSql) return
    const blob = new Blob([currentSql], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `query_${new Date().toISOString().slice(0, 10)}.sql`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // 渲染图表内容
  const renderContent = (full: boolean = false) => (
    <div className={`w-full ${full ? 'h-full' : 'h-[350px] md:h-full'} p-4`}>
      {hasData ? (
        activeType === 'table' ? (
          <div className={full ? 'h-full' : ''}>
            <DataTable sqlResult={currentSqlResult} onExportCsv={handleExportCsv} />
          </div>
        ) : displayOption ? (
          <EChartsRenderer option={displayOption} />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-8 text-gray-400">
            图表无法生成
          </div>
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center p-8 text-gray-400">
          暂无数据
        </div>
      )}
    </div>
  )

  return (
    <div className="flex-none flex flex-col h-full relative overflow-hidden">
      {/* 全屏模态层：使用极高层级固定定位 */}
      {isFullScreen && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="flex-none flex justify-between items-center p-4 border-b bg-white shadow-sm" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
            <h3 className="font-bold text-gray-700">全屏查看分析</h3>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFullScreen(false);
              }}
              className="w-12 h-12 flex items-center justify-center bg-gray-100 active:bg-gray-200 rounded-full text-gray-900 shadow-md border border-gray-200"
              style={{ WebkitAppearance: 'none' }}
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-white">
            {renderContent(true)}
          </div>
        </div>
      )}

      {/* 顶部标题栏 */}
      <div className="flex-none p-3 border-b border-white/30 landscape:p-2">
        <div className="flex items-center justify-between mb-2 landscape:mb-1">
          <h2 className="text-lg font-semibold text-gray-700 landscape:text-sm">数据可视化</h2>
          <div className="flex items-center gap-2">
            {hasData && (
              <button
                onClick={() => setFullScreen(true)}
                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg active:bg-blue-100 shadow-sm"
                title="全屏查看"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setRightPanelVisible(false)}
              className="w-8 h-8 flex items-center justify-center bg-white/60 rounded-xl text-gray-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* 类型切换按钮：横屏下更紧凑 */}
        <div className="flex gap-2 flex-wrap">
          {CHART_TYPES.map((type) => (
            <button
              key={type.key}
              onClick={() => setActiveType(type.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs transition-all ${
                activeType === type.key
                  ? 'bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] text-gray-700 shadow-sm'
                  : 'bg-white/60 text-gray-500'
              }`}
            >
              <span>{type.icon}</span>
              <span className="landscape:hidden">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="min-h-full">
          {/* SQL 区域：横屏下自动收起/变小 */}
          {currentSql && (
            <div className="p-4 border-b border-white/30 bg-white/10 landscape:p-2">
              <details className="group">
                <summary className="list-none flex items-center justify-between cursor-pointer">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">查看 SQL 语句</h3>
                  <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <pre className="mt-2 bg-gray-800 text-green-400 p-3 rounded-lg text-[10px] overflow-x-auto font-mono">
                  {currentSql}
                </pre>
              </details>
            </div>
          )}

          {/* 主要内容区 */}
          {renderContent(false)}
        </div>
      </div>
    </div>
  )
}
