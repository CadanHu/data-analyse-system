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
  const { currentChartOption, currentChartType: defaultChartType, currentSqlResult, currentSql, setRightPanelVisible } = useChatStore()
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

  return (
    <div className="flex-none flex flex-col h-full">
      <div className="flex-none p-4 border-b border-white/30">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">数据可视化</h2>
          <div className="flex items-center gap-2">
            {currentSql && (
              <button
                onClick={handleExportSql}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] hover:from-[#9FEFC9] hover:to-[#C0EFFF] rounded-xl text-xs text-gray-700 transition-all shadow-[0_4px_12px_rgba(191,255,217,0.3)] hover:shadow-[0_6px_16px_rgba(191,255,217,0.4)]"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                导出 SQL
              </button>
            )}
            <button
              onClick={() => setRightPanelVisible(false)}
              className="flex items-center justify-center w-8 h-8 bg-white/60 hover:bg-white/80 rounded-xl text-gray-400 hover:text-gray-600 transition-all"
              title="关闭"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {CHART_TYPES.map((type) => (
            <button
              key={type.key}
              onClick={() => setActiveType(type.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all ${
                activeType === type.key
                  ? 'bg-gradient-to-r from-[#BFFFD9] to-[#E0FFFF] text-gray-700 shadow-[0_4px_12px_rgba(191,255,217,0.3)]'
                  : 'bg-white/60 text-gray-500 hover:bg-white/80 hover:text-gray-600'
              }`}
            >
              <span>{type.icon}</span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {hasData ? (
          activeType === 'table' ? (
            <DataTable sqlResult={currentSqlResult} onExportCsv={handleExportCsv} />
          ) : displayOption ? (
            <div className="w-full h-full p-4">
              <EChartsRenderer option={displayOption} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-lg">图表无法生成</p>
                <p className="text-sm mt-1">数据格式不支持此图表类型</p>
              </div>
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <p className="text-lg">图表区域</p>
              <p className="text-sm mt-1">提问后自动生成图表</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
