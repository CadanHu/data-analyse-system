/**
 * KnowledgeGraphModal.tsx
 * 知识图谱可视化弹窗，使用 ECharts Graph 布局展示实体和关系。
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { KnowledgeGraph } from '@/services/mobileKnowledgeService'

// ECharts 颜色方案：按实体类型区分
const TYPE_COLORS: Record<string, string> = {
  Person: '#6366f1',
  Organization: '#0ea5e9',
  Concept: '#10b981',
  Event: '#f59e0b',
  Location: '#ef4444',
  Other: '#8b5cf6',
}

interface Props {
  graph: KnowledgeGraph
  onClose: () => void
}

export default function KnowledgeGraphModal({ graph, onClose }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current || graph.entities.length === 0) return

    // 动态加载 ECharts（已全局缓存）
    const win = window as any
    const echarts = win.echarts
    if (!echarts) return

    const chart = echarts.init(chartRef.current, null, { renderer: 'canvas' })

    const nodes = graph.entities.map(e => ({
      id: e.id,
      name: e.text,
      value: e.description || e.type,
      category: e.type,
      symbolSize: 40,
      itemStyle: { color: TYPE_COLORS[e.type] || '#8b5cf6' },
      label: { show: true, fontSize: 11, color: '#1f2937' },
    }))

    const edges = graph.relations.map(r => ({
      source: r.source,
      target: r.target,
      label: { show: true, formatter: r.label, fontSize: 9, color: '#6b7280' },
      lineStyle: { color: '#d1d5db', curveness: 0.1 },
    }))

    chart.setOption({
      backgroundColor: '#fafafa',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (params.dataType === 'node') {
            return `<b>${params.data.name}</b><br/>${params.data.category}<br/>${params.data.value || ''}`
          }
          return `${params.data.source} → ${params.data.target}<br/>${params.data.label?.formatter || ''}`
        },
      },
      legend: {
        data: Object.keys(TYPE_COLORS).filter(t => graph.entities.some(e => e.type === t)),
        orient: 'vertical',
        right: 10,
        top: 10,
        textStyle: { fontSize: 11 },
        formatter: (name: string) => name,
      },
      series: [{
        type: 'graph',
        layout: 'force',
        data: nodes,
        edges,
        roam: true,
        draggable: true,
        force: {
          repulsion: 200,
          gravity: 0.05,
          edgeLength: [80, 200],
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 3 },
        },
        lineStyle: { opacity: 0.7, width: 1.5 },
      }],
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      chart.dispose()
      window.removeEventListener('resize', handleResize)
    }
  }, [graph])

  const legend = Object.entries(TYPE_COLORS).filter(([type]) =>
    graph.entities.some(e => e.type === type)
  )

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-2xl" style={{ height: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800">知识图谱</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              《{graph.doc_name}》· {graph.entities.length} 实体 · {graph.relations.length} 关系
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Legend */}
        {legend.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 py-2 border-b border-gray-50 flex-shrink-0">
            {legend.map(([type, color]) => (
              <span key={type} className="flex items-center gap-1 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                {type}
              </span>
            ))}
          </div>
        )}

        {/* Graph canvas */}
        <div ref={chartRef} className="flex-1 w-full" />

        {/* Entity list fallback if no echarts */}
        {graph.entities.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            暂无实体数据
          </div>
        )}

        {/* Footer hint */}
        <div className="px-5 py-2 border-t border-gray-50 text-[11px] text-gray-400 flex-shrink-0">
          拖拽节点可重新布局 · 滚轮缩放 · 点击节点高亮相邻关系
        </div>
      </div>
    </div>,
    document.body
  )
}
