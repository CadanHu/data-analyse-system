/**
 * KnowledgeGraphModal.tsx
 * 全功能知识图谱可视化与管理组件
 *
 * 两种模式：
 *  - 查看模式（view）：传入 graph prop，展示单文档图谱
 *  - 管理模式（manage）：从 API 加载全局图谱，支持 CRUD / 搜索 / 过滤 / 统计 / 路径查询
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Network, List, BarChart2, Search, Filter, Download, Plus, Trash2,
  Edit2, GitBranch, RefreshCw, ChevronLeft, ChevronRight, ZoomIn,
  Layers, Share2, AlertCircle, CheckCircle2, Upload, FileSpreadsheet,
  AlertTriangle, ChevronDown, Eye
} from 'lucide-react'
import * as echarts from 'echarts'
import * as XLSX from 'xlsx'
import dagre from 'dagre'
import type { KnowledgeGraph } from '@/services/mobileKnowledgeService'
import { knowledgeGraphApi, type KGEntity, type KGRelation, type KGStats, type KGDocInfo, type KGCommunity } from '@/api/index'

// ─────────────────────────────────────
// 常量
// ─────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Person: '#6366f1',
  Organization: '#0ea5e9',
  Concept: '#10b981',
  Event: '#f59e0b',
  Location: '#ef4444',
  Other: '#8b5cf6',
}

const TYPE_LABELS: Record<string, string> = {
  Person: '人物',
  Organization: '组织',
  Concept: '概念',
  Event: '事件',
  Location: '地点',
  Other: '其他',
}

const ALL_TYPES = Object.keys(TYPE_COLORS)

// ─────────────────────────────────────
// 类型定义
// ─────────────────────────────────────

interface Props {
  graph?: KnowledgeGraph | null
  onClose: () => void
}

type ViewTab = 'graph' | 'list' | 'stats'
type Layout = 'force' | 'circular' | 'hierarchical'

// 大图谱阈值：超过此数量启用增量加载
const LARGE_GRAPH_THRESHOLD = 500
const LARGE_GRAPH_INITIAL = 200

interface ImportValidation {
  entities: Array<{ text: string; type: string; description: string }>
  relations: Array<{ source: string; target: string; label: string }>
  errors: string[]
  warnings: string[]
}

interface EditEntityForm {
  id: string
  text: string
  entity_class: string
  description: string
}

interface EditRelationForm {
  id: string
  source_text: string
  target_text: string
  relation_type: string
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

// ─────────────────────────────────────
// 工具函数
// ─────────────────────────────────────

/** 将 KnowledgeGraph（移动端格式）转为 KGEntity[] + KGRelation[] */
function normalizeGraph(graph: KnowledgeGraph): { entities: KGEntity[]; relations: KGRelation[] } {
  const idToText = new Map(graph.entities.map(e => [e.id, e.text]))
  return {
    entities: graph.entities.map(e => ({
      id: e.id,
      text: e.text,
      type: e.type,
      description: e.description,
      doc_id: graph.doc_name,
    })),
    relations: graph.relations.map(r => ({
      id: r.id,
      source: idToText.get(r.source) ?? r.source,
      target: idToText.get(r.target) ?? r.target,
      label: r.label,
      doc_id: graph.doc_name,
    })),
  }
}

// ─────────────────────────────────────
// 工具：导入数据校验
// ─────────────────────────────────────

function validateImportJSON(raw: unknown): ImportValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const entities: ImportValidation['entities'] = []
  const relations: ImportValidation['relations'] = []

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entities, relations, errors: ['根节点必须是 JSON 对象，包含 entities 和 relations 字段'], warnings }
  }
  const data = raw as Record<string, unknown>

  // ── 实体校验 ──
  if (!Array.isArray(data.entities)) {
    errors.push('缺少 entities 字段（应为数组）')
  } else {
    const seen = new Set<string>()
    ;(data.entities as unknown[]).forEach((e: unknown, i: number) => {
      if (!e || typeof e !== 'object') { errors.push(`实体 #${i + 1}：不是对象`); return }
      const obj = e as Record<string, unknown>
      const text = String(obj.text ?? obj.name ?? '').trim()
      if (!text) { errors.push(`实体 #${i + 1}：缺少 text/name 字段`); return }
      if (seen.has(text)) { warnings.push(`实体 "${text}" 重复，将跳过`); return }
      seen.add(text)
      const type = String(obj.type ?? obj.entity_class ?? 'Other')
      if (!ALL_TYPES.includes(type)) warnings.push(`实体 "${text}"：类型 "${type}" 不在预设范围，已归为 Other`)
      entities.push({ text, type: ALL_TYPES.includes(type) ? type : 'Other', description: String(obj.description ?? '') })
    })
  }

  // ── 关系校验 ──
  const entityTexts = new Set(entities.map(e => e.text))
  if (data.relations !== undefined && !Array.isArray(data.relations)) {
    errors.push('relations 字段应为数组')
  } else if (Array.isArray(data.relations)) {
    ;(data.relations as unknown[]).forEach((r: unknown, i: number) => {
      if (!r || typeof r !== 'object') { errors.push(`关系 #${i + 1}：不是对象`); return }
      const obj = r as Record<string, unknown>
      const source = String(obj.source ?? '').trim()
      const target = String(obj.target ?? '').trim()
      const label = String(obj.label ?? obj.relation_type ?? '').trim() || '关联'
      if (!source || !target) { errors.push(`关系 #${i + 1}：缺少 source 或 target`); return }
      if (!entityTexts.has(source)) warnings.push(`关系起点 "${source}" 不在实体列表中`)
      if (!entityTexts.has(target)) warnings.push(`关系终点 "${target}" 不在实体列表中`)
      relations.push({ source, target, label })
    })
  }

  return { entities, relations, errors, warnings }
}

function validateImportCSV(text: string): ImportValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const entities: ImportValidation['entities'] = []

  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { entities, relations: [], errors: ['CSV 文件至少需要标题行和一行数据'], warnings }

  const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
  const nameIdx = header.findIndex(h => ['名称', 'text', 'name'].includes(h))
  const typeIdx = header.findIndex(h => ['类型', 'type'].includes(h))
  const descIdx = header.findIndex(h => ['描述', 'description'].includes(h))

  if (nameIdx === -1) return { entities, relations: [], errors: ['CSV 缺少名称/text/name 列'], warnings }

  const seen = new Set<string>()
  lines.slice(1).forEach((line, i) => {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
    const text = cols[nameIdx] ?? ''
    if (!text) { warnings.push(`第 ${i + 2} 行：名称为空，已跳过`); return }
    if (seen.has(text)) { warnings.push(`"${text}" 重复，已跳过`); return }
    seen.add(text)
    const type = typeIdx >= 0 ? cols[typeIdx] ?? 'Other' : 'Other'
    const description = descIdx >= 0 ? cols[descIdx] ?? '' : ''
    if (!ALL_TYPES.includes(type)) warnings.push(`"${text}"：类型 "${type}" 未识别，已归为 Other`)
    entities.push({ text, type: ALL_TYPES.includes(type) ? type : 'Other', description })
  })

  if (entities.length === 0) errors.push('未能从 CSV 中解析出任何实体')
  return { entities, relations: [], errors, warnings }
}

// ─────────────────────────────────────
// 子组件：导入对话框
// ─────────────────────────────────────

function ImportDialog({
  onConfirm, onClose,
}: {
  onConfirm: (v: ImportValidation) => Promise<void>
  onClose: () => void
}) {
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      let result: ImportValidation
      if (file.name.endsWith('.csv')) {
        result = validateImportCSV(text)
      } else {
        try {
          result = validateImportJSON(JSON.parse(text))
        } catch {
          result = { entities: [], relations: [], errors: ['JSON 解析失败，请检查文件格式'], warnings: [] }
        }
      }
      setValidation(result)
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleConfirm = async () => {
    if (!validation || validation.errors.length > 0) return
    setImporting(true)
    await onConfirm(validation)
    setImporting(false)
    onClose()
  }

  const canImport = validation && validation.errors.length === 0 && validation.entities.length > 0

  return (
    <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Upload size={16} className="text-indigo-500" /> 导入知识图谱数据
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} className="text-gray-400" /></button>
        </div>

        {/* 格式说明 */}
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 mb-4 leading-relaxed">
          <div className="font-medium text-gray-700 mb-1">支持格式：</div>
          <div>• <b>JSON</b>：<code className="bg-gray-100 px-1 rounded">{"{ entities: [{text, type, description}], relations: [{source, target, label}] }"}</code></div>
          <div className="mt-1">• <b>CSV</b>：列标题含 <code className="bg-gray-100 px-1 rounded">名称/text</code>、<code className="bg-gray-100 px-1 rounded">类型/type</code>、<code className="bg-gray-100 px-1 rounded">描述/description</code></div>
        </div>

        {/* 文件选择 */}
        <button onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors mb-4">
          <Upload size={20} className="mx-auto mb-1 text-gray-400" />
          <div className="text-sm text-gray-500">{fileName || '点击选择 JSON / CSV 文件'}</div>
        </button>
        <input ref={fileRef} type="file" accept=".json,.csv" onChange={handleFile} className="hidden" />

        {/* 校验结果 */}
        {validation && (
          <div className="flex flex-col gap-2 mb-4">
            {validation.errors.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-red-600 font-medium text-xs mb-1.5">
                  <AlertCircle size={13} /> 格式错误（{validation.errors.length} 项）
                </div>
                {validation.errors.map((e, i) => <div key={i} className="text-xs text-red-500 pl-4">• {e}</div>)}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-amber-600 font-medium text-xs mb-1.5">
                  <AlertTriangle size={13} /> 注意事项（{validation.warnings.length} 项，不影响导入）
                </div>
                {validation.warnings.slice(0, 5).map((w, i) => <div key={i} className="text-xs text-amber-600 pl-4">• {w}</div>)}
                {validation.warnings.length > 5 && <div className="text-xs text-amber-400 pl-4">... 还有 {validation.warnings.length - 5} 条</div>}
              </div>
            )}
            {validation.errors.length === 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-xs mb-1">
                  <CheckCircle2 size={13} /> 校验通过
                </div>
                <div className="text-xs text-emerald-600 pl-4">
                  将导入 <b>{validation.entities.length}</b> 个实体、<b>{validation.relations.length}</b> 条关系
                </div>
              </div>
            )}

            {/* 数据预览 */}
            {validation.entities.length > 0 && (
              <button onClick={() => setShowPreview(v => !v)}
                className="flex items-center gap-1 text-xs text-indigo-500 hover:underline">
                <Eye size={12} />
                {showPreview ? '收起预览' : '展开数据预览'}
                <ChevronDown size={12} className={`transition-transform ${showPreview ? 'rotate-180' : ''}`} />
              </button>
            )}
            {showPreview && (
              <div className="border border-gray-100 rounded-xl overflow-hidden text-xs max-h-48 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-gray-500 font-medium">名称</th>
                      <th className="text-left px-3 py-1.5 text-gray-500 font-medium">类型</th>
                      <th className="text-left px-3 py-1.5 text-gray-500 font-medium">描述</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.entities.slice(0, 20).map((e, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-1 text-gray-800 font-medium">{e.text}</td>
                        <td className="px-3 py-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px]"
                            style={{ background: `${TYPE_COLORS[e.type]}20`, color: TYPE_COLORS[e.type] }}>
                            {TYPE_LABELS[e.type]}
                          </span>
                        </td>
                        <td className="px-3 py-1 text-gray-500 truncate max-w-[140px]">{e.description}</td>
                      </tr>
                    ))}
                    {validation.entities.length > 20 && (
                      <tr><td colSpan={3} className="px-3 py-1 text-gray-400">... 共 {validation.entities.length} 个实体</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            取消
          </button>
          <button onClick={handleConfirm} disabled={!canImport || importing}
            className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 transition-colors">
            {importing ? '导入中...' : `确认导入`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// 子组件：Toast 提示
// ─────────────────────────────────────

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-6 right-6 z-[10010] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-auto
            ${t.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
        >
          {t.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {t.message}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────
// 子组件：统计面板
// ─────────────────────────────────────

function StatsPanel({ stats, entities, relations }: {
  stats?: KGStats | null
  entities: KGEntity[]
  relations: KGRelation[]
}) {
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    entities.forEach(e => { m[e.type] = (m[e.type] || 0) + 1 })
    return m
  }, [entities])

  const totalEntities = stats?.total_entities ?? entities.length
  const totalRelations = stats?.total_relations ?? relations.length
  const totalDocs = stats?.total_docs ?? new Set(entities.map(e => e.doc_id).filter(Boolean)).size

  // 度数统计
  const degrees = useMemo(() => {
    const m: Record<string, number> = {}
    relations.forEach(r => {
      m[r.source] = (m[r.source] || 0) + 1
      m[r.target] = (m[r.target] || 0) + 1
    })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [relations])

  return (
    <div className="flex flex-col gap-4 overflow-y-auto h-full px-1">
      {/* 核心指标 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '实体', value: totalEntities, color: 'text-indigo-600' },
          { label: '关系', value: totalRelations, color: 'text-sky-600' },
          { label: '文档', value: totalDocs, color: 'text-emerald-600' },
        ].map(m => (
          <div key={m.label} className="bg-gray-50 rounded-xl p-3 text-center">
            <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* 实体类型分布 */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">实体类型分布</div>
        <div className="flex flex-col gap-1.5">
          {ALL_TYPES.map(type => {
            const count = (stats?.entity_type_counts ?? typeCounts)[type] || 0
            if (count === 0) return null
            const max = Math.max(...Object.values(stats?.entity_type_counts ?? typeCounts))
            const pct = max > 0 ? Math.round((count / max) * 100) : 0
            return (
              <div key={type} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[type] }} />
                <span className="text-xs text-gray-600 w-14 flex-shrink-0">{TYPE_LABELS[type]}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: TYPE_COLORS[type] }} />
                </div>
                <span className="text-xs text-gray-500 w-5 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 常见关系类型 */}
      {(stats?.top_relation_types?.length ?? 0) > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">常见关系类型</div>
          <div className="flex flex-col gap-1">
            {(stats!.top_relation_types).slice(0, 6).map(({ type, count }) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate max-w-[120px]">{type}</span>
                <span className="text-gray-400 ml-2">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 高连通节点 */}
      {degrees.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">高连通节点</div>
          <div className="flex flex-col gap-1">
            {degrees.map(([name, deg]) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate max-w-[130px]">{name}</span>
                <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full text-[10px]">{deg} 连接</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// 子组件：列表视图
// ─────────────────────────────────────

function ListView({
  entities, relations,
  onEditEntity, onDeleteEntity,
  onEditRelation, onDeleteRelation,
  onBatchDeleteEntities, onBatchDeleteRelations,
}: {
  entities: KGEntity[]
  relations: KGRelation[]
  onEditEntity: (e: KGEntity) => void
  onDeleteEntity: (id: string) => void
  onEditRelation: (r: KGRelation) => void
  onDeleteRelation: (id: string) => void
  onBatchDeleteEntities: (ids: string[]) => void
  onBatchDeleteRelations: (ids: string[]) => void
}) {
  const [listTab, setListTab] = useState<'entities' | 'relations'>('entities')
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [selectedRelationIds, setSelectedRelationIds] = useState<Set<string>>(new Set())

  const toggleEntity = (id: string) => setSelectedEntityIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const toggleAllEntities = () => setSelectedEntityIds(
    selectedEntityIds.size === entities.length ? new Set() : new Set(entities.map(e => e.id))
  )
  const toggleRelation = (id: string) => setSelectedRelationIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const toggleAllRelations = () => setSelectedRelationIds(
    selectedRelationIds.size === relations.length ? new Set() : new Set(relations.map(r => r.id))
  )

  const allEntitiesSelected = entities.length > 0 && selectedEntityIds.size === entities.length
  const allRelationsSelected = relations.length > 0 && selectedRelationIds.size === relations.length

  return (
    <div className="flex flex-col h-full">
      {/* Tab + 批量操作栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 flex-shrink-0 flex-wrap">
        <div className="flex gap-1">
          {(['entities', 'relations'] as const).map(t => (
            <button key={t} onClick={() => { setListTab(t); setSelectedEntityIds(new Set()); setSelectedRelationIds(new Set()) }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
                ${listTab === t ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t === 'entities' ? `实体 (${entities.length})` : `关系 (${relations.length})`}
            </button>
          ))}
        </div>

        {listTab === 'entities' && selectedEntityIds.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">已选 {selectedEntityIds.size} 项</span>
            <button
              onClick={() => { onBatchDeleteEntities([...selectedEntityIds]); setSelectedEntityIds(new Set()) }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
            >
              <Trash2 size={11} /> 批量删除
            </button>
          </div>
        )}
        {listTab === 'relations' && selectedRelationIds.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">已选 {selectedRelationIds.size} 项</span>
            <button
              onClick={() => { onBatchDeleteRelations([...selectedRelationIds]); setSelectedRelationIds(new Set()) }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
            >
              <Trash2 size={11} /> 批量删除
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {listTab === 'entities' ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={allEntitiesSelected} onChange={toggleAllEntities}
                    className="accent-indigo-500 cursor-pointer" />
                </th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">名称</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">类型</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">描述</th>
                <th className="px-3 py-2 w-20 text-center text-gray-500 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {entities.map(e => (
                <tr key={e.id}
                  className={`border-t border-gray-50 hover:bg-gray-50 transition-colors
                    ${selectedEntityIds.has(e.id) ? 'bg-indigo-50/60' : ''}`}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selectedEntityIds.has(e.id)} onChange={() => toggleEntity(e.id)}
                      className="accent-indigo-500 cursor-pointer" />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800">{e.text}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ background: `${TYPE_COLORS[e.type]}20`, color: TYPE_COLORS[e.type] }}>
                      {TYPE_LABELS[e.type] || e.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 hidden sm:table-cell max-w-[200px] truncate">{e.description}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => onEditEntity(e)} title="编辑"
                        className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-400 hover:text-indigo-600 transition-colors">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => onDeleteEntity(e.id)} title="删除"
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={allRelationsSelected} onChange={toggleAllRelations}
                    className="accent-indigo-500 cursor-pointer" />
                </th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">起点</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">关系类型</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">终点</th>
                <th className="px-3 py-2 w-20 text-center text-gray-500 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {relations.map(r => (
                <tr key={r.id}
                  className={`border-t border-gray-50 hover:bg-gray-50 transition-colors
                    ${selectedRelationIds.has(r.id) ? 'bg-indigo-50/60' : ''}`}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selectedRelationIds.has(r.id)} onChange={() => toggleRelation(r.id)}
                      className="accent-indigo-500 cursor-pointer" />
                  </td>
                  <td className="px-3 py-2 text-indigo-600 font-medium">{r.source}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {r.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sky-600 font-medium">{r.target}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => onEditRelation(r)} title="编辑"
                        className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-400 hover:text-indigo-600 transition-colors">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => onDeleteRelation(r.id)} title="删除"
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// 子组件：详情面板（右侧）
// ─────────────────────────────────────

function DetailPanel({
  selectedNode, selectedEdge, relations,
  onEditEntity, onDeleteEntity, onEditRelation, onDeleteRelation,
  onFindPath,
}: {
  selectedNode: KGEntity | null
  selectedEdge: KGRelation | null
  relations: KGRelation[]
  onEditEntity: (e: KGEntity) => void
  onDeleteEntity: (id: string) => void
  onEditRelation: (r: KGRelation) => void
  onDeleteRelation: (id: string) => void
  onFindPath: (from: string) => void
}) {
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
        <Network size={28} className="opacity-30" />
        <p className="text-xs text-center">点击节点或边<br />查看详情</p>
      </div>
    )
  }

  if (selectedNode) {
    const connectedEdges = relations.filter(
      r => r.source === selectedNode.text || r.target === selectedNode.text
    )
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto h-full">
        <div className="flex items-start gap-2">
          <span className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0"
            style={{ background: TYPE_COLORS[selectedNode.type] || '#8b5cf6' }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-800 text-sm break-words">{selectedNode.text}</div>
            <div className="text-xs mt-0.5" style={{ color: TYPE_COLORS[selectedNode.type] || '#8b5cf6' }}>
              {TYPE_LABELS[selectedNode.type] || selectedNode.type}
            </div>
          </div>
        </div>

        {selectedNode.description && (
          <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 leading-relaxed">
            {selectedNode.description}
          </div>
        )}

        {selectedNode.doc_id && (
          <div className="text-[10px] text-gray-400 truncate">来源：{selectedNode.doc_id}</div>
        )}

        {connectedEdges.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              关联关系 ({connectedEdges.length})
            </div>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {connectedEdges.map(e => (
                <div key={e.id} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 leading-snug">
                  {e.source === selectedNode.text
                    ? <><span className="text-indigo-600 font-medium">{e.source}</span> →{e.label}→ <span className="text-sky-600">{e.target}</span></>
                    : <><span className="text-indigo-600">{e.source}</span> →{e.label}→ <span className="text-sky-600 font-medium">{e.target}</span></>
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5 mt-auto pt-2 border-t border-gray-100">
          <button onClick={() => onEditEntity(selectedNode)}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
            <Edit2 size={12} /> 编辑实体
          </button>
          <button onClick={() => onFindPath(selectedNode.text)}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
            <GitBranch size={12} /> 查找路径
          </button>
          <button onClick={() => onDeleteEntity(selectedNode.id)}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
            <Trash2 size={12} /> 删除实体
          </button>
        </div>
      </div>
    )
  }

  // 边详情
  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto h-full">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">关系详情</div>
      <div className="bg-gray-50 rounded-xl p-3 text-sm">
        <div className="flex flex-col gap-1">
          <div className="font-medium text-indigo-600">{selectedEdge!.source}</div>
          <div className="text-center text-xs text-gray-400">↓ {selectedEdge!.label}</div>
          <div className="font-medium text-sky-600">{selectedEdge!.target}</div>
        </div>
      </div>
      {selectedEdge!.doc_id && (
        <div className="text-[10px] text-gray-400 truncate">来源：{selectedEdge!.doc_id}</div>
      )}
      <div className="flex flex-col gap-1.5 mt-auto pt-2 border-t border-gray-100">
        <button onClick={() => onEditRelation(selectedEdge!)}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100">
          <Edit2 size={12} /> 编辑关系
        </button>
        <button onClick={() => onDeleteRelation(selectedEdge!.id)}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
          <Trash2 size={12} /> 删除关系
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// 子组件：路径查找对话框
// ─────────────────────────────────────

function PathFinderDialog({
  initialSource,
  entityNames,
  relations,
  onClose,
}: {
  initialSource: string
  entityNames: string[]
  relations: KGRelation[]
  onClose: () => void
}) {
  const [source, setSource] = useState(initialSource)
  const [target, setTarget] = useState('')
  const [maxHops, setMaxHops] = useState(5)
  const [result, setResult] = useState<any | null>(null)

  const handleFind = () => {
    if (!source.trim() || !target.trim()) return
    setResult(null)

    // BFS 本地计算，直接用已加载的 relations，不依赖 API
    const adj: Record<string, Array<{ neighbor: string; rel: string }>> = {}
    for (const r of relations) {
      adj[r.source] = adj[r.source] || []
      adj[r.source].push({ neighbor: r.target, rel: r.label })
      adj[r.target] = adj[r.target] || []
      adj[r.target].push({ neighbor: r.source, rel: r.label })
    }

    if (!adj[source]) {
      setResult({ found: false, path: [], hops: 0 })
      return
    }

    // BFS
    const visited = new Set<string>([source])
    const queue: Array<{ node: string; path: any[] }> = [{ node: source, path: [] }]

    while (queue.length > 0) {
      const { node, path } = queue.shift()!
      if (node === target) {
        setResult({ found: true, path, hops: path.length })
        return
      }
      if (path.length >= maxHops) continue
      for (const { neighbor, rel } of adj[node] || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push({
            node: neighbor,
            path: [...path, { from: node, relation: rel, to: neighbor }],
          })
        }
      }
    }

    setResult({ found: false, path: [], hops: 0 })
  }

  return (
    <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <GitBranch size={16} className="text-amber-500" /> 路径查找
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">起点实体</label>
            <select value={source} onChange={e => setSource(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-indigo-400">
              <option value="">请选择起点实体</option>
              {entityNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">终点实体</label>
            <select value={target} onChange={e => setTarget(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-indigo-400">
              <option value="">请选择终点实体</option>
              {entityNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">最大跳数：{maxHops}</label>
            <input type="range" min={1} max={8} value={maxHops}
              onChange={e => setMaxHops(Number(e.target.value))}
              className="w-full accent-indigo-500" />
          </div>

          <button onClick={handleFind} disabled={!source || !target}
            className="w-full py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
            开始查找
          </button>
        </div>

        {result && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            {result.found ? (
              <div>
                <div className="text-xs font-semibold text-emerald-600 mb-2">
                  找到路径（{result.hops} 跳）
                </div>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {result.path.map((step: any, i: number) => (
                    <div key={i} className="text-xs flex items-center gap-1">
                      <span className="text-indigo-600 font-medium">{step.from}</span>
                      <span className="text-gray-400 shrink-0">—{step.relation}→</span>
                      <span className="text-sky-600 font-medium">{step.to}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-400 text-center py-2">
                未找到连接路径（可尝试增加跳数）
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// 子组件：新增/编辑实体对话框
// ─────────────────────────────────────

function EntityDialog({
  initial,
  onSave,
  onClose,
  isSaving,
}: {
  initial?: EditEntityForm | null
  onSave: (data: EditEntityForm) => void
  onClose: () => void
  isSaving: boolean
}) {
  const [form, setForm] = useState<EditEntityForm>(
    initial || { id: '', text: '', entity_class: 'Other', description: '' }
  )
  const isEdit = Boolean(initial?.id)

  return (
    <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">{isEdit ? '编辑实体' : '新增实体'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">名称 *</label>
            <input value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="实体名称" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">类型</label>
            <select value={form.entity_class}
              onChange={e => setForm(f => ({ ...f, entity_class: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white">
              {ALL_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]} ({t})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">描述</label>
            <textarea value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
              placeholder="（可选）实体描述" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              取消
            </button>
            <button onClick={() => onSave(form)}
              disabled={!form.text.trim() || isSaving}
              className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-50">
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// 子组件：新增/编辑关系对话框
// ─────────────────────────────────────

function RelationDialog({
  initial,
  entityNames,
  onSave,
  onClose,
  isSaving,
}: {
  initial?: EditRelationForm | null
  entityNames: string[]
  onSave: (data: EditRelationForm) => void
  onClose: () => void
  isSaving: boolean
}) {
  const [form, setForm] = useState<EditRelationForm>(
    initial || { id: '', source_text: '', target_text: '', relation_type: '' }
  )
  const isEdit = Boolean(initial?.id)

  return (
    <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">{isEdit ? '编辑关系' : '新增关系'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {(['source_text', 'target_text', 'relation_type'] as const).map(field => (
            <div key={field}>
              <label className="text-xs text-gray-500 mb-1 block">
                {field === 'source_text' ? '起点实体 *' : field === 'target_text' ? '终点实体 *' : '关系类型 *'}
              </label>
              <input
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                placeholder={field === 'relation_type' ? '如：属于、包含、领导…' : '输入实体名称'}
                list={field !== 'relation_type' ? 'rel-entity-list' : undefined}
              />
            </div>
          ))}
          <datalist id="rel-entity-list">
            {entityNames.map(n => <option key={n} value={n} />)}
          </datalist>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              取消
            </button>
            <button
              onClick={() => onSave(form)}
              disabled={!form.source_text.trim() || !form.target_text.trim() || !form.relation_type.trim() || isSaving}
              className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-50">
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// 主组件
// ─────────────────────────────────────

export default function KnowledgeGraphModal({ graph, onClose }: Props) {
  // ── 移动端检测（仅用于 UI 适配，不影响 Web 端逻辑）──
  // window.innerWidth < 1024 与 App.tsx 保持同一判断标准
  const isMobileInit = typeof window !== 'undefined' && window.innerWidth < 1024
  const getOrientation = () =>
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
  const [isMobile, setIsMobile] = useState(isMobileInit)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(getOrientation())
  // 移动端次要工具栏（导入/导出/新增等）展开状态，默认收起
  const [showMobileTools, setShowMobileTools] = useState(false)

  // ── 视图状态 ──
  const [viewTab, setViewTab] = useState<ViewTab>('graph')
  const [layout, setLayout] = useState<Layout>('force')
  // 移动端默认关闭侧边栏，避免侧栏把图谱区域压缩成 0 高度导致竖线问题
  const [leftOpen, setLeftOpen] = useState(!isMobileInit)
  const [rightOpen, setRightOpen] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [showEdges, setShowEdges] = useState(true)

  // ── 数据状态 ──
  const [entities, setEntities] = useState<KGEntity[]>([])
  const [relations, setRelations] = useState<KGRelation[]>([])
  const [stats, setStats] = useState<KGStats | null>(null)
  const [docs, setDocs] = useState<KGDocInfo[]>([])
  const [loading, setLoading] = useState(false)

  // ── 社区状态 ──
  const [communities, setCommunities] = useState<KGCommunity[]>([])
  const [activeCommunity, setActiveCommunity] = useState<KGCommunity | null>(null)
  // 左侧面板 tab：'filter' | 'community'
  const [leftTab, setLeftTab] = useState<'filter' | 'community'>('filter')

  // ── 大图谱增量加载 ──
  const [showAllNodes, setShowAllNodes] = useState(false)

  // ── 导入对话框 ──
  const [showImport, setShowImport] = useState(false)

  // ── 筛选状态 ──
  const [searchText, setSearchText] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(ALL_TYPES))
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  // ── 选中状态 ──
  const [selectedNode, setSelectedNode] = useState<KGEntity | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<KGRelation | null>(null)

  // ── 对话框状态 ──
  const [entityDialog, setEntityDialog] = useState<{ mode: 'add' | 'edit'; initial?: EditEntityForm } | null>(null)
  const [relationDialog, setRelationDialog] = useState<{ mode: 'add' | 'edit'; initial?: EditRelationForm } | null>(null)
  const [pathSource, setPathSource] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // ── Toast ──
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  // ── ECharts ref ──
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)

  // ─── Toast 工具 ───
  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  // ── 监听屏幕尺寸与方向变化，更新移动端状态并驱动 ECharts resize ──
  // orientationchange 在旋转动画结束前触发，需延迟 400ms 等浏览器完成重排
  useEffect(() => {
    const handleLayoutChange = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape')
      setTimeout(() => chartInstance.current?.resize(), 400)
    }
    window.addEventListener('resize', handleLayoutChange)
    window.addEventListener('orientationchange', handleLayoutChange)
    return () => {
      window.removeEventListener('resize', handleLayoutChange)
      window.removeEventListener('orientationchange', handleLayoutChange)
    }
  }, [])

  // ─── 初始化：从 prop 或 API 加载数据 ───
  useEffect(() => {
    if (!manageMode && graph) {
      const { entities: e, relations: r } = normalizeGraph(graph)
      setEntities(e)
      setRelations(r)
      // view 模式也加载该文档的社区数据
      knowledgeGraphApi.getCommunities(graph.doc_name)
        .then(res => setCommunities(res.communities))
        .catch(() => {/* 社区加载失败不影响主流程 */})
    }
  }, [graph, manageMode])

  const loadFullGraph = useCallback(async () => {
    setLoading(true)
    try {
      const [graphData, statsData, docsData, communitiesData] = await Promise.all([
        knowledgeGraphApi.getFullGraph(selectedDocId || undefined),
        knowledgeGraphApi.getStats(),
        knowledgeGraphApi.listDocs(),
        knowledgeGraphApi.getCommunities(selectedDocId || undefined),
      ])
      setEntities(graphData.entities)
      setRelations(graphData.relations)
      setStats(statsData)
      setDocs(docsData.docs)
      setCommunities(communitiesData.communities)
    } catch (e) {
      showToast('error', '加载图谱数据失败')
    } finally {
      setLoading(false)
    }
  }, [selectedDocId, showToast])

  useEffect(() => {
    if (manageMode) {
      loadFullGraph()
    }
  }, [manageMode, loadFullGraph])

  // ─── 筛选后的数据 ───
  const filteredEntities = useMemo(() => {
    let result = entities
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      result = result.filter(e =>
        e.text.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q)
      )
    }
    result = result.filter(e => selectedTypes.has(e.type))
    if (selectedDocId) {
      result = result.filter(e => e.doc_id === selectedDocId)
    }
    return result
  }, [entities, searchText, selectedTypes, selectedDocId])

  const filteredEntityTexts = useMemo(
    () => new Set(filteredEntities.map(e => e.text)),
    [filteredEntities]
  )

  const filteredRelations = useMemo(() =>
    relations.filter(r =>
      filteredEntityTexts.has(r.source) && filteredEntityTexts.has(r.target)
    ),
    [relations, filteredEntityTexts]
  )

  // ─── 节点度数（用于大小计算 + 增量加载排序）───
  const degreeMap = useMemo(() => {
    const m: Record<string, number> = {}
    filteredRelations.forEach(r => {
      m[r.source] = (m[r.source] || 0) + 1
      m[r.target] = (m[r.target] || 0) + 1
    })
    return m
  }, [filteredRelations])

  // ─── 大图谱增量加载：超阈值时只显示连接最多的前 N 个节点 ───
  const isLargeGraph = filteredEntities.length > LARGE_GRAPH_THRESHOLD
  const visibleEntities = useMemo(() => {
    if (!isLargeGraph || showAllNodes) return filteredEntities
    return [...filteredEntities]
      .sort((a, b) => (degreeMap[b.text] || 0) - (degreeMap[a.text] || 0))
      .slice(0, LARGE_GRAPH_INITIAL)
  }, [filteredEntities, isLargeGraph, showAllNodes, degreeMap])

  const visibleEntityTexts = useMemo(() => new Set(visibleEntities.map(e => e.text)), [visibleEntities])
  const visibleRelations = useMemo(() =>
    filteredRelations.filter(r => visibleEntityTexts.has(r.source) && visibleEntityTexts.has(r.target)),
    [filteredRelations, visibleEntityTexts]
  )

  // ─── 构建 ECharts option ───
  const buildOption = useCallback(() => {
    // 注意：节点不设置 id，让 ECharts 用 name 匹配边的 source/target
    // 层次布局：用 dagre 计算坐标后使用 layout:'none'
    let dagrePositions: Map<string, { x: number; y: number }> | null = null
    if (layout === 'hierarchical' && visibleEntities.length > 0) {
      try {
        const g = new dagre.graphlib.Graph()
        g.setDefaultEdgeLabel(() => ({}))
        g.setGraph({ rankdir: 'TB', ranksep: 90, nodesep: 55, marginx: 40, marginy: 40 })
        visibleEntities.forEach(e => g.setNode(e.text, { width: 80, height: 36 }))
        visibleRelations.forEach(r => { try { g.setEdge(r.source, r.target) } catch {} })
        dagre.layout(g)
        dagrePositions = new Map()
        visibleEntities.forEach(e => {
          const pos = g.node(e.text)
          if (pos) dagrePositions!.set(e.text, { x: pos.x, y: pos.y })
        })
      } catch { dagrePositions = null }
    }

    const communityNodeSet = activeCommunity ? new Set(activeCommunity.entity_texts) : null

    const nodes = visibleEntities.map(e => {
      const pos = dagrePositions?.get(e.text)
      const inCommunity = communityNodeSet ? communityNodeSet.has(e.text) : true
      return {
        name: e.text,
        value: e.type,
        category: e.type,
        symbolSize: Math.min(14 + (degreeMap[e.text] || 0) * 5, 52),
        itemStyle: {
          color: TYPE_COLORS[e.type] || '#8b5cf6',
          opacity: inCommunity ? 1 : 0.15,
          ...(inCommunity && communityNodeSet ? { borderWidth: 2, borderColor: '#f59e0b' } : {}),
        },
        label: {
          show: showLabels,
          fontSize: 10,
          color: inCommunity ? '#1f2937' : '#cbd5e1',
          position: 'right',
          distance: 4,
        },
        tooltip: { formatter: `${e.text}\n${TYPE_LABELS[e.type] || e.type}` },
        ...(pos ? { x: pos.x, y: pos.y, fixed: true } : {}),
      }
    })

    const edges = visibleRelations.map(r => ({
      id: r.id,
      source: r.source,
      target: r.target,
      value: r.label,
      lineStyle: {
        color: '#94a3b8',
        curveness: layout === 'hierarchical' ? 0 : 0.15,
        width: showEdges ? 1.2 : 0,
        opacity: showEdges ? 0.8 : 0,
      },
      label: { show: false, formatter: r.label, fontSize: 9, color: '#64748b' },
      emphasis: {
        label: { show: showEdges },
        lineStyle: { color: '#6366f1', width: showEdges ? 2.5 : 0 },
      },
    }))

    const echartsLayout = layout === 'hierarchical' ? 'none' : layout

    return {
      backgroundColor: '#f8fafc',
      tooltip: { show: true },
      series: [{
        type: 'graph',
        layout: echartsLayout,
        force: {
          repulsion: 200,
          gravity: 0.08,
          edgeLength: [80, 250],
          layoutAnimation: true,
          friction: 0.65,
        },
        circular: { rotateLabel: true },
        data: nodes,
        edges,
        roam: true,
        draggable: layout !== 'hierarchical',
        animation: layout === 'force',
        label: {
          show: showLabels,
          position: 'right',
          fontSize: 10,
          color: '#1f2937',
        },
        lineStyle: { opacity: 0.7 },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 2.5 },
        },
        selectedMode: 'single',
        select: {
          itemStyle: { borderWidth: 2, borderColor: '#6366f1' },
        },
      }],
    }
  }, [visibleEntities, visibleRelations, degreeMap, layout, showLabels, showEdges, activeCommunity])

  // ─── 初始化并更新 ECharts ───
  useEffect(() => {
    if (viewTab !== 'graph' || !chartRef.current) return
    // 没有数据时容器是 display:none（0x0），等有数据再初始化，防止画布尺寸为 0
    if (visibleEntities.length === 0) return

    const container = chartRef.current
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(container, null, { renderer: 'canvas' })

      chartInstance.current.on('click', (params: any) => {
        if (params.dataType === 'node') {
          const entity = entities.find(e => e.text === params.data.name)
          setSelectedNode(entity || null)
          setSelectedEdge(null)
          setRightOpen(true)
        } else if (params.dataType === 'edge') {
          const rel = relations.find(r => r.id === params.data.id)
          setSelectedEdge(rel || null)
          setSelectedNode(null)
          setRightOpen(true)
        }
      })

      // 点击图谱空白处取消选中节点并关闭详情面板
      chartInstance.current.getZr().on('click', (event: any) => {
        if (!event.target) {
          setSelectedNode(null)
          setSelectedEdge(null)
          setRightOpen(false)
          
          if (chartInstance.current) {
            chartInstance.current.dispatchAction({
              type: 'unselect',
              seriesIndex: 0
            })
          }
        }
      })
    }

    try {
      chartInstance.current.setOption(buildOption(), { notMerge: true })
    } catch (err) {
      console.error('[KG] setOption error:', err)
    }
    // 初始化或切回图谱 tab 时，容器可能刚从 display:none 变为可见，
    // 需要 resize 让 ECharts 重新测量容器尺寸，否则画布仍为 0x0。
    // 移动端使用 300ms 延迟，等 fixed 容器完成 dvh 布局计算；Web 端 0ms 即可。
    const resizeDelay = window.innerWidth < 1024 ? 300 : 0
    setTimeout(() => chartInstance.current?.resize(), resizeDelay)
  }, [viewTab, buildOption, entities, relations, visibleEntities])

  useEffect(() => {
    // 这里只保留 Web 端的 resize 监听（orientationchange 已在移动端专属 useEffect 里处理）
    const handleResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chartInstance.current?.dispose()
      chartInstance.current = null
    }
  }, [])

  // 当侧边栏开关时触发 resize
  useEffect(() => {
    setTimeout(() => chartInstance.current?.resize(), 300)
  }, [leftOpen, rightOpen])

  // ─── CRUD 处理 ───

  const handleSaveEntity = useCallback(async (form: EditEntityForm) => {
    setIsSaving(true)
    try {
      if (form.id) {
        await knowledgeGraphApi.updateEntity(form.id, {
          text: form.text,
          entity_class: form.entity_class,
          description: form.description,
        })
        setEntities(prev => prev.map(e =>
          e.id === form.id
            ? { ...e, text: form.text, type: form.entity_class, description: form.description }
            : e
        ))
        showToast('success', '实体已更新')
      } else {
        const created = await knowledgeGraphApi.createEntity({
          text: form.text,
          entity_class: form.entity_class,
          description: form.description,
        })
        setEntities(prev => [...prev, created])
        showToast('success', '实体已创建')
      }
      setEntityDialog(null)
    } catch {
      showToast('error', '操作失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }, [showToast])

  const handleDeleteEntity = useCallback(async (id: string) => {
    if (!window.confirm('确认删除此实体？')) return
    try {
      await knowledgeGraphApi.deleteEntity(id)
      setEntities(prev => prev.filter(e => e.id !== id))
      setRelations(prev => {
        const entity = entities.find(e => e.id === id)
        if (!entity) return prev
        return prev.filter(r => r.source !== entity.text && r.target !== entity.text)
      })
      setSelectedNode(null)
      setRightOpen(false)
      showToast('success', '实体已删除')
    } catch {
      showToast('error', '删除失败')
    }
  }, [entities, showToast])

  const handleSaveRelation = useCallback(async (form: EditRelationForm) => {
    // 重复关系检测：相同起点+终点+关系类型（新增时才检测）
    if (!form.id) {
      const duplicate = relations.some(r =>
        r.source === form.source_text &&
        r.target === form.target_text &&
        r.label === form.relation_type
      )
      if (duplicate) {
        showToast('error', '该关系已存在（起点、终点和关系类型完全相同）')
        return
      }
    }
    setIsSaving(true)
    try {
      if (form.id) {
        await knowledgeGraphApi.updateRelation(form.id, {
          source_text: form.source_text,
          target_text: form.target_text,
          relation_type: form.relation_type,
        })
        setRelations(prev => prev.map(r =>
          r.id === form.id
            ? { ...r, source: form.source_text, target: form.target_text, label: form.relation_type }
            : r
        ))
        showToast('success', '关系已更新')
      } else {
        const created = await knowledgeGraphApi.createRelation({
          source_text: form.source_text,
          target_text: form.target_text,
          relation_type: form.relation_type,
        })
        setRelations(prev => [...prev, created])
        showToast('success', '关系已创建')
      }
      setRelationDialog(null)
    } catch {
      showToast('error', '操作失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }, [showToast])

  const handleDeleteRelation = useCallback(async (id: string) => {
    if (!window.confirm('确认删除此关系？')) return
    try {
      await knowledgeGraphApi.deleteRelation(id)
      setRelations(prev => prev.filter(r => r.id !== id))
      setSelectedEdge(null)
      setRightOpen(false)
      showToast('success', '关系已删除')
    } catch {
      showToast('error', '删除失败')
    }
  }, [showToast])

  // ─── 批量删除 ───

  const handleBatchDeleteEntities = useCallback(async (ids: string[]) => {
    if (!window.confirm(`确认删除选中的 ${ids.length} 个实体？相关联的关系也将被移除。`)) return
    try {
      await Promise.all(ids.map(id => knowledgeGraphApi.deleteEntity(id)))
      const deletedTexts = new Set(
        ids.map(id => entities.find(e => e.id === id)?.text).filter(Boolean) as string[]
      )
      setEntities(prev => prev.filter(e => !ids.includes(e.id)))
      setRelations(prev => prev.filter(r => !deletedTexts.has(r.source) && !deletedTexts.has(r.target)))
      setSelectedNode(null)
      showToast('success', `已删除 ${ids.length} 个实体`)
    } catch {
      showToast('error', '批量删除失败，请重试')
    }
  }, [entities, showToast])

  const handleBatchDeleteRelations = useCallback(async (ids: string[]) => {
    if (!window.confirm(`确认删除选中的 ${ids.length} 条关系？`)) return
    try {
      await Promise.all(ids.map(id => knowledgeGraphApi.deleteRelation(id)))
      setRelations(prev => prev.filter(r => !ids.includes(r.id)))
      setSelectedEdge(null)
      showToast('success', `已删除 ${ids.length} 条关系`)
    } catch {
      showToast('error', '批量删除失败，请重试')
    }
  }, [showToast])

  // ─── 导出 ───

  const handleExportJSON = useCallback(() => {
    const data = { entities: filteredEntities, relations: filteredRelations }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `knowledge_graph_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('success', '已导出 JSON 文件')
  }, [filteredEntities, filteredRelations, showToast])

  const handleExportImage = useCallback(() => {
    if (!chartInstance.current) return
    const url = chartInstance.current.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#f8fafc' })
    const a = document.createElement('a')
    a.href = url
    a.download = `knowledge_graph_${Date.now()}.png`
    a.click()
    showToast('success', '已导出图片')
  }, [showToast])

  const handleExportPDF = useCallback(() => {
    const imgUrl = chartInstance.current
      ? chartInstance.current.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
      : null

    const typeCounts: Record<string, number> = {}
    filteredEntities.forEach(e => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1 })
    const typeRows = ALL_TYPES
      .filter(t => typeCounts[t] > 0)
      .map(t => `<tr><td style="padding:6px 12px">${TYPE_LABELS[t]}</td><td style="padding:6px 12px;color:${TYPE_COLORS[t]};font-weight:600">${typeCounts[t]}</td></tr>`)
      .join('')
    const relationRows = filteredRelations.slice(0, 60)
      .map(r => `<tr><td style="padding:5px 10px;color:#4f46e5">${r.source}</td><td style="padding:5px 10px;color:#6b7280">${r.label}</td><td style="padding:5px 10px;color:#0284c7">${r.target}</td></tr>`)
      .join('')

    const win = window.open('', '_blank')
    if (!win) { showToast('error', '请允许弹出窗口后重试'); return }
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>知识图谱分析报告</title>
<style>
  body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;margin:32px;color:#1f2937;line-height:1.6}
  h1{font-size:20px;font-weight:700;color:#4f46e5;margin:0 0 4px}
  h2{font-size:14px;font-weight:600;color:#374151;margin:24px 0 10px;border-left:3px solid #4f46e5;padding-left:8px}
  .meta{color:#9ca3af;font-size:12px;margin-bottom:20px}
  .stats{display:flex;gap:12px;margin-bottom:20px}
  .stat{background:#f5f3ff;border-radius:8px;padding:10px 20px;text-align:center}
  .stat-v{font-size:22px;font-weight:700;color:#4f46e5}
  .stat-l{font-size:11px;color:#9ca3af}
  img{max-width:100%;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:8px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  thead tr{background:#f3f4f6}
  th{text-align:left;padding:8px 12px;color:#6b7280;font-weight:500}
  tbody tr:nth-child(even){background:#f9fafb}
  @media print{@page{margin:15mm}}
</style></head>
<body>
  <h1>知识图谱分析报告</h1>
  <div class="meta">生成时间：${new Date().toLocaleString('zh-CN')} &nbsp;·&nbsp; 数据来源：${manageMode ? '全局图谱' : (graph?.doc_name ?? '知识图谱')}</div>
  <div class="stats">
    <div class="stat"><div class="stat-v">${filteredEntities.length}</div><div class="stat-l">实体数量</div></div>
    <div class="stat"><div class="stat-v">${filteredRelations.length}</div><div class="stat-l">关系数量</div></div>
    <div class="stat"><div class="stat-v">${new Set(filteredEntities.map(e => e.doc_id).filter(Boolean)).size}</div><div class="stat-l">文档来源</div></div>
  </div>
  ${imgUrl ? `<h2>图谱可视化</h2><img src="${imgUrl}" />` : ''}
  <h2>实体类型分布</h2>
  <table><thead><tr><th>类型</th><th>数量</th></tr></thead><tbody>${typeRows}</tbody></table>
  <h2>关系列表${filteredRelations.length > 60 ? `（前 60 / 共 ${filteredRelations.length} 条）` : ''}</h2>
  <table><thead><tr><th>起点实体</th><th>关系类型</th><th>终点实体</th></tr></thead><tbody>${relationRows}</tbody></table>
  <script>setTimeout(()=>window.print(),600)</script>
</body></html>`)
    win.document.close()
    showToast('success', '已打开打印预览，请选择另存为 PDF')
  }, [filteredEntities, filteredRelations, manageMode, graph, showToast])

  // ─── Excel / CSV 导出 ───

  const handleExportExcel = useCallback(() => {
    const entitiesSheet = XLSX.utils.json_to_sheet(
      filteredEntities.map(e => ({
        '名称': e.text,
        '类型': TYPE_LABELS[e.type] || e.type,
        '描述': e.description || '',
        '来源文档': e.doc_id || '',
      }))
    )
    const relationsSheet = XLSX.utils.json_to_sheet(
      filteredRelations.map(r => ({
        '起点': r.source,
        '关系类型': r.label,
        '终点': r.target,
        '来源文档': r.doc_id || '',
      }))
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, entitiesSheet, '实体')
    XLSX.utils.book_append_sheet(wb, relationsSheet, '关系')
    XLSX.writeFile(wb, `knowledge_graph_${Date.now()}.xlsx`)
    showToast('success', '已导出 Excel 文件（实体+关系两张工作表）')
  }, [filteredEntities, filteredRelations, showToast])

  const handleExportCSV = useCallback(() => {
    // 导出实体 CSV（BOM for Excel UTF-8）
    const header = '名称,类型,描述,来源文档\n'
    const rows = filteredEntities.map(e => {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
      return [esc(e.text), esc(TYPE_LABELS[e.type] || e.type), esc(e.description || ''), esc(e.doc_id || '')].join(',')
    }).join('\n')
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `entities_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('success', '已导出实体 CSV 文件')
  }, [filteredEntities, showToast])

  // ─── 导入处理 ───

  const handleImportConfirm = useCallback(async (v: ImportValidation) => {
    let created = 0
    for (const e of v.entities) {
      try {
        const result = await knowledgeGraphApi.createEntity({
          text: e.text,
          entity_class: e.type,
          description: e.description,
        })
        setEntities(prev => [...prev, result])
        created++
      } catch { /* 跳过已存在 */ }
    }
    for (const r of v.relations) {
      try {
        const result = await knowledgeGraphApi.createRelation({
          source_text: r.source,
          target_text: r.target,
          relation_type: r.label,
        })
        setRelations(prev => [...prev, result])
      } catch { /* 跳过 */ }
    }
    showToast('success', `成功导入 ${created} 个实体、${v.relations.length} 条关系`)
  }, [showToast])

  // ─── 类型过滤 toggle ───
  const toggleType = useCallback((type: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }, [])

  const docTitle = graph?.doc_name
    ? `《${graph.doc_name}》`
    : manageMode
      ? (selectedDocId ? `文档：${selectedDocId.length > 20 ? selectedDocId.slice(0, 20) + '…' : selectedDocId}` : '全局图谱')
      : '知识图谱'

  const entityNames = useMemo(() => entities.map(e => e.text), [entities])

  // ─── 渲染 ───
  return createPortal(
    <>
      {/* 移动端用 height:100dvh 排除浏览器工具栏高度，避免底部被截断；
          safe-area-inset 保证刘海屏/底部横条不遮挡内容；Web 端不附加 style */}
      <div
        className="fixed inset-0 z-[9999] flex flex-col bg-white"
        style={isMobile ? {
          height: '100dvh',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        } : {}}
      >
        {/* ── 顶部工具栏 ── */}
        {/* 移动端：两行布局（主行+次要工具行）；Web 端：原有单行 */}
        <div className={`border-b border-gray-100 bg-white flex-shrink-0 select-none ${isMobile ? '' : 'flex items-center gap-2 px-4 h-12'}`}>
          {/* ══ Web 端工具栏（单行，isMobile=false 时渲染）══ */}
          {!isMobile && (
            <div className="flex items-center gap-2 px-4 h-12 w-full">
              {/* 左侧面板 toggle */}
              <button onClick={() => setLeftOpen(v => !v)} className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0">
                {leftOpen ? <ChevronLeft size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
              </button>
              <h2 className="font-bold text-gray-800 text-sm flex items-center gap-1.5 flex-shrink-0">
                <Network size={15} className="text-indigo-500" />
                <span className="hidden sm:inline">{docTitle}</span>
                <span className="text-xs text-gray-400 font-normal hidden sm:inline">
                  · {filteredEntities.length} 实体 · {filteredRelations.length} 关系
                </span>
              </h2>
              {/* 视图 Tab */}
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                {([
                  { tab: 'graph' as const, icon: <Network size={13} />, label: '图谱' },
                  { tab: 'list' as const, icon: <List size={13} />, label: '列表' },
                  { tab: 'stats' as const, icon: <BarChart2 size={13} />, label: '统计' },
                ]).map(({ tab, icon, label }) => (
                  <button key={tab} onClick={() => setViewTab(tab)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                      ${viewTab === tab ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {icon} <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
              {/* 布局切换 */}
              {viewTab === 'graph' && (
                <button
                  onClick={() => setLayout(l => l === 'force' ? 'circular' : l === 'circular' ? 'hierarchical' : 'force')}
                  title={`当前：${layout === 'force' ? '力导向' : layout === 'circular' ? '圆形' : '层次'}布局，点击切换`}
                  className={`p-1.5 rounded-lg flex-shrink-0 transition-colors
                    ${layout !== 'force' ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100 text-gray-500'}`}>
                  <Layers size={15} />
                </button>
              )}
              {/* 标签显示 */}
              {viewTab === 'graph' && (
                <button onClick={() => setShowLabels(v => !v)} title="切换节点标签"
                  className={`p-1.5 rounded-lg flex-shrink-0 transition-colors
                    ${showLabels ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100 text-gray-400'}`}>
                  <ZoomIn size={15} />
                </button>
              )}
              {/* 连接线 */}
              {viewTab === 'graph' && (
                <button onClick={() => setShowEdges(v => !v)} title={showEdges ? '隐藏连接线' : '显示连接线'}
                  className={`p-1.5 rounded-lg flex-shrink-0 transition-colors
                    ${showEdges ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100 text-gray-400'}`}>
                  <GitBranch size={15} />
                </button>
              )}
              {/* 搜索框 */}
              <div className="flex-1 flex items-center max-w-xs">
                <div className="relative w-full">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="搜索节点…"
                    className="w-full pl-7 pr-3 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 border border-transparent focus:border-indigo-300"
                  />
                </div>
              </div>
              {/* 新增 */}
              <button onClick={() => setEntityDialog({ mode: 'add' })} title="新增实体"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-100 flex-shrink-0">
                <Plus size={12} /> 实体
              </button>
              <button onClick={() => setRelationDialog({ mode: 'add' })} title="新增关系"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-50 text-sky-600 rounded-lg text-xs font-medium hover:bg-sky-100 flex-shrink-0">
                <Plus size={12} /> 关系
              </button>
              {/* 全图谱 / 刷新 */}
              {!manageMode ? (
                <button onClick={() => setManageMode(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 flex-shrink-0">
                  <RefreshCw size={12} /> 全图谱
                </button>
              ) : (
                <button onClick={loadFullGraph} disabled={loading} title="刷新图谱数据"
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 flex-shrink-0">
                  <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-500' : ''} />
                </button>
              )}
              {/* 导入 */}
              <button onClick={() => setShowImport(true)} title="导入 JSON / CSV"
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 flex-shrink-0">
                <Upload size={14} />
              </button>
              {/* 导出 */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={handleExportJSON} title="导出 JSON" className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><Download size={14} /></button>
                <button onClick={handleExportExcel} title="导出 Excel" className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><FileSpreadsheet size={14} /></button>
                <button onClick={handleExportCSV} title="导出 CSV" className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 text-[10px] font-bold leading-none">CSV</button>
                {viewTab === 'graph' && (
                  <button onClick={handleExportImage} title="导出图片 (PNG)" className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><Share2 size={14} /></button>
                )}
                <button onClick={handleExportPDF} title="导出分析报告 (PDF)" className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><BarChart2 size={14} /></button>
              </div>
              {/* 右侧面板 toggle */}
              <button onClick={() => setRightOpen(v => !v)} className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0">
                {rightOpen ? <ChevronRight size={15} className="text-gray-400" /> : <ChevronLeft size={15} className="text-gray-400" />}
              </button>
              {/* 关闭 */}
              <button onClick={onClose} className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-gray-400 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          )}

          {/* ══ 移动端工具栏（两行，isMobile=true 时渲染）══ */}
          {isMobile && (
            <div className="flex flex-col">
              {/* 第一行：关闭（左，最突出）+ 标题 + Tab + 更多（右）
                  关闭按钮放最左侧，用红色背景保证视觉优先级，永远可见 */}
              <div className="flex items-center gap-2 px-3 h-12">
                {/* 关闭按钮 - 最左、最显眼，红色圆角背景，手指易点 */}
                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-9 h-9 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl flex-shrink-0 active:scale-95 transition-transform"
                >
                  <X size={18} />
                </button>

                {/* 标题（截断防溢出） */}
                <h2 className="font-bold text-gray-800 text-sm flex items-center gap-1 flex-1 min-w-0">
                  <Network size={14} className="text-indigo-500 flex-shrink-0" />
                  <span className="truncate text-xs">{docTitle}</span>
                </h2>

                {/* 视图 Tab */}
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                  {([
                    { tab: 'graph' as const, icon: <Network size={13} />, label: '图谱' },
                    { tab: 'list' as const, icon: <List size={13} />, label: '列表' },
                    { tab: 'stats' as const, icon: <BarChart2 size={13} />, label: '统计' },
                  ]).map(({ tab, icon, label }) => (
                    <button key={tab} onClick={() => setViewTab(tab)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors
                        ${viewTab === tab ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                    >
                      {icon}
                      {/* 横屏时显示文字，竖屏仅图标节省空间 */}
                      {orientation === 'landscape' && <span>{label}</span>}
                    </button>
                  ))}
                </div>

                {/* 布局切换（图谱模式下显示） */}
                {viewTab === 'graph' && (
                  <button
                    onClick={() => setLayout(l => l === 'force' ? 'circular' : l === 'circular' ? 'hierarchical' : 'force')}
                    className={`p-2 rounded-xl flex-shrink-0 transition-colors
                      ${layout !== 'force' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}
                  >
                    <Layers size={15} />
                  </button>
                )}

                {/* 更多按钮：展开/收起次要工具行 */}
                <button
                  onClick={() => setShowMobileTools(v => !v)}
                  className={`p-2 rounded-xl flex-shrink-0 transition-colors
                    ${showMobileTools ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}
                >
                  {/* 用三个横线表示"更多"，比省略号更直观 */}
                  <Filter size={15} />
                </button>
              </div>

              {/* 第二行：次要工具（可收起），默认隐藏 */}
              {showMobileTools && (
                <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap border-t border-gray-100 pt-2">
                  {/* 搜索框占满整行 */}
                  <div className="relative w-full mb-1">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      placeholder="搜索节点…"
                      className="w-full pl-7 pr-3 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-300 border border-transparent focus:border-indigo-300"
                    />
                  </div>
                  {/* 标签 / 连接线 toggle */}
                  {viewTab === 'graph' && (
                    <>
                      <button onClick={() => setShowLabels(v => !v)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors
                          ${showLabels ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                        <ZoomIn size={13} /> 标签
                      </button>
                      <button onClick={() => setShowEdges(v => !v)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors
                          ${showEdges ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                        <GitBranch size={13} /> 连接线
                      </button>
                    </>
                  )}
                  {/* 过滤面板 toggle */}
                  <button onClick={() => setLeftOpen(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors
                      ${leftOpen ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                    <Filter size={13} /> 过滤
                  </button>
                  {/* 新增实体/关系 */}
                  <button onClick={() => setEntityDialog({ mode: 'add' })}
                    className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs">
                    <Plus size={12} /> 实体
                  </button>
                  <button onClick={() => setRelationDialog({ mode: 'add' })}
                    className="flex items-center gap-1 px-2 py-1 bg-sky-50 text-sky-600 rounded-lg text-xs">
                    <Plus size={12} /> 关系
                  </button>
                  {/* 全图谱 / 刷新 */}
                  {!manageMode ? (
                    <button onClick={() => setManageMode(true)}
                      className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs">
                      <RefreshCw size={12} /> 全图谱
                    </button>
                  ) : (
                    <button onClick={loadFullGraph} disabled={loading}
                      className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs">
                      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 刷新
                    </button>
                  )}
                  {/* 导入 */}
                  <button onClick={() => setShowImport(true)}
                    className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">
                    <Upload size={12} /> 导入
                  </button>
                  {/* 导出 */}
                  <button onClick={handleExportJSON}
                    className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">
                    <Download size={12} /> JSON
                  </button>
                  {viewTab === 'graph' && (
                    <button onClick={handleExportImage}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">
                      <Share2 size={12} /> PNG
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 主内容区 ── */}
        {/* 移动端横屏时：点击侧边面板标题区可收起；点击图谱主区可收起两侧面板实现全屏 */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧面板
              移动端竖屏：点击顶部栏的"过滤"按钮控制开关（在工具栏第二行）
              移动端横屏：点击面板顶部标题行可快速收起，节省空间 */}
          {leftOpen && (
            <div className={`flex-shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/50 overflow-hidden
              ${isMobile ? 'w-44' : 'w-56'}`}>
              {/* 移动端横屏：面板顶部加收起按钮 */}
              {isMobile && orientation === 'landscape' && (
                <button
                  onClick={() => setLeftOpen(false)}
                  className="flex items-center justify-between w-full px-3 py-1.5 bg-gray-100 text-gray-500 text-xs border-b border-gray-200 hover:bg-gray-200 active:bg-gray-300"
                >
                  <span>{leftTab === 'filter' ? '过滤面板' : '社区'}</span>
                  <ChevronLeft size={13} />
                </button>
              )}

              {/* Tab 切换行 */}
              <div className="flex border-b border-gray-100 flex-shrink-0">
                <button
                  onClick={() => setLeftTab('filter')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors
                    ${leftTab === 'filter' ? 'text-indigo-600 border-b-2 border-indigo-500 bg-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  过滤
                </button>
                <button
                  onClick={() => setLeftTab('community')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1
                    ${leftTab === 'community' ? 'text-indigo-600 border-b-2 border-indigo-500 bg-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  社区
                  {communities.length > 0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-600 rounded-full px-1">{communities.length}</span>
                  )}
                </button>
              </div>

              {/* 过滤面板内容 */}
              {leftTab === 'filter' && (
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                  {/* 实体类型过滤 */}
                  <div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      <Filter size={11} /> 实体类型
                    </div>
                    <div className="flex flex-col gap-1">
                      {ALL_TYPES.map(type => {
                        const count = entities.filter(e => e.type === type).length
                        if (count === 0 && !manageMode) return null
                        return (
                          <button key={type} onClick={() => toggleType(type)}
                            className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-colors text-left
                              ${selectedTypes.has(type) ? 'bg-white shadow-sm' : 'text-gray-400'}`}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0 transition-opacity"
                              style={{ background: TYPE_COLORS[type], opacity: selectedTypes.has(type) ? 1 : 0.3 }} />
                            <span className={selectedTypes.has(type) ? 'text-gray-700' : 'text-gray-400'}>
                              {TYPE_LABELS[type]}
                            </span>
                            <span className="ml-auto text-gray-400">{count}</span>
                          </button>
                        )
                      })}
                      <button onClick={() => setSelectedTypes(new Set(ALL_TYPES))}
                        className="text-[10px] text-indigo-500 text-left px-2 mt-1 hover:underline">
                        全选
                      </button>
                    </div>
                  </div>

                  {/* 文档过滤（管理模式） */}
                  {manageMode && docs.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">文档</div>
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => { setSelectedDocId(null); loadFullGraph() }}
                          className={`text-xs text-left px-2 py-1 rounded-lg truncate
                            ${!selectedDocId ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}`}>
                          全部文档
                        </button>
                        {docs.map(d => (
                          <button key={d.doc_id}
                            onClick={() => setSelectedDocId(d.doc_id)}
                            className={`text-xs text-left px-2 py-1 rounded-lg truncate
                              ${selectedDocId === d.doc_id ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}`}>
                            <div className="truncate">{d.doc_id}</div>
                            <div className="text-[10px] text-gray-400">{d.entity_count} 实体 · {d.relation_count} 关系</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 布局信息 */}
                  {viewTab === 'graph' && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">布局</div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <div>当前：{layout === 'force' ? '力导向' : layout === 'circular' ? '圆形' : '层次（dagre）'}</div>
                        <div>节点大小：连接数</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 社区面板内容 */}
              {leftTab === 'community' && (
                <div className="flex-1 overflow-y-auto flex flex-col">
                  {communities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 p-4">
                      <Layers size={24} className="opacity-30" />
                      <div className="text-xs text-center">暂无社区数据<br />上传文档后自动生成</div>
                    </div>
                  ) : (
                    <>
                      {/* 清除高亮按钮 */}
                      {activeCommunity && (
                        <button
                          onClick={() => setActiveCommunity(null)}
                          className="mx-3 mt-2 mb-1 text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1 hover:bg-amber-100 flex items-center gap-1"
                        >
                          <X size={10} /> 取消高亮
                        </button>
                      )}
                      <div className="flex flex-col gap-2 p-3">
                        {communities.map(c => (
                          <button
                            key={c.id}
                            onClick={() => setActiveCommunity(activeCommunity?.id === c.id ? null : c)}
                            className={`text-left rounded-xl p-2.5 border transition-all text-xs
                              ${activeCommunity?.id === c.id
                                ? 'border-amber-400 bg-amber-50 shadow-sm'
                                : 'border-gray-100 bg-white hover:border-amber-200 hover:bg-amber-50/50'}`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className={`font-semibold truncate ${activeCommunity?.id === c.id ? 'text-amber-700' : 'text-gray-700'}`}>
                                {c.title}
                              </span>
                              <span className="text-[10px] text-gray-400 flex-shrink-0">{c.size} 节点</span>
                            </div>
                            <div className={`text-[10px] text-gray-500 leading-relaxed ${activeCommunity?.id === c.id ? '' : 'line-clamp-3'}`}>
                              {c.summary}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 快捷提示（仅过滤 tab 显示） */}
              {leftTab === 'filter' && viewTab === 'graph' && (
                <div className="px-3 py-2 border-t border-gray-100 text-[10px] text-gray-400 leading-relaxed">
                  点击节点查看详情<br />
                  拖拽节点重新布局<br />
                  滚轮缩放
                </div>
              )}
            </div>
          )}

          {/* 中间：主内容
              移动端横屏：两侧面板都展开时，图谱区右上角显示"全屏"按钮，
              点击同时收起两侧面板，让图谱占满全部宽度 */}
          <div className="flex-1 min-w-0 relative">
            {/* 横屏全屏快捷按钮：仅在移动端横屏且至少有一侧面板展开时显示 */}
            {isMobile && orientation === 'landscape' && (leftOpen || rightOpen) && viewTab === 'graph' && (
              <button
                onClick={() => { setLeftOpen(false); setRightOpen(false) }}
                className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 bg-white/90 border border-gray-200 rounded-lg text-xs text-gray-600 shadow-sm active:scale-95"
              >
                <Eye size={12} /> 全屏图谱
              </button>
            )}
            {/* 横屏全屏时：图谱区左/右边缘各有一个细长的展开按钮，方便重新打开面板 */}
            {isMobile && orientation === 'landscape' && !leftOpen && (
              <button
                onClick={() => setLeftOpen(true)}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-5 h-16 bg-gray-100/80 hover:bg-indigo-50 border border-gray-200 rounded-r-lg flex items-center justify-center text-gray-400 hover:text-indigo-500"
              >
                <ChevronRight size={12} />
              </button>
            )}
            {isMobile && orientation === 'landscape' && !rightOpen && (
              <button
                onClick={() => setRightOpen(true)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-5 h-16 bg-gray-100/80 hover:bg-indigo-50 border border-gray-200 rounded-l-lg flex items-center justify-center text-gray-400 hover:text-indigo-500"
              >
                <ChevronLeft size={12} />
              </button>
            )}

            {loading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <RefreshCw size={16} className="animate-spin text-indigo-500" />
                  加载中...
                </div>
              </div>
            )}

            {/* 图谱 canvas 容器：始终保留在 DOM，避免切换 tab 后 ECharts 实例失效 */}
            <div
              ref={chartRef}
              className="w-full h-full"
              style={{ display: viewTab === 'graph' && visibleEntities.length > 0 ? 'block' : 'none' }}
            />

            {/* 大图谱警告 Banner */}
            {viewTab === 'graph' && isLargeGraph && !showAllNodes && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3
                bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 shadow-sm text-xs text-amber-700">
                <AlertTriangle size={13} className="flex-shrink-0" />
                <span>
                  共 <b>{filteredEntities.length}</b> 个节点，当前仅显示连接最多的 <b>{visibleEntities.length}</b> 个
                </span>
                <button onClick={() => setShowAllNodes(true)}
                  className="flex-shrink-0 px-2.5 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium">
                  显示全部（可能较慢）
                </button>
              </div>
            )}
            {viewTab === 'graph' && isLargeGraph && showAllNodes && (
              <div className="absolute top-2 right-2 z-10">
                <button onClick={() => setShowAllNodes(false)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 shadow-sm">
                  <ChevronDown size={11} /> 收起（仅显示 top {LARGE_GRAPH_INITIAL})
                </button>
              </div>
            )}

            {viewTab === 'graph' && visibleEntities.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                <Network size={40} className="opacity-20" />
                <p className="text-sm">
                  {searchText ? `未找到包含"${searchText}"的节点` : '暂无实体数据'}
                </p>
              </div>
            )}

            {viewTab === 'list' && (
              <ListView
                entities={filteredEntities}
                relations={filteredRelations}
                onEditEntity={e => setEntityDialog({ mode: 'edit', initial: { id: e.id, text: e.text, entity_class: e.type, description: e.description || '' } })}
                onDeleteEntity={handleDeleteEntity}
                onEditRelation={r => setRelationDialog({ mode: 'edit', initial: { id: r.id, source_text: r.source, target_text: r.target, relation_type: r.label } })}
                onDeleteRelation={handleDeleteRelation}
                onBatchDeleteEntities={handleBatchDeleteEntities}
                onBatchDeleteRelations={handleBatchDeleteRelations}
              />
            )}

            {viewTab === 'stats' && (
              <div className="p-4 h-full overflow-y-auto">
                <StatsPanel stats={stats} entities={filteredEntities} relations={filteredRelations} />
              </div>
            )}
          </div>

          {/* 右侧详情面板 */}
          {rightOpen && (
            <div className={`flex-shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-hidden
              ${isMobile ? 'w-52' : 'w-64'}`}>
              {/* 面板标题行：移动端显示收起按钮 */}
              <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0 flex items-center justify-between">
                <span>{selectedNode ? '节点详情' : selectedEdge ? '关系详情' : '详情'}</span>
                {/* 移动端始终显示收起按钮，方便一键关闭详情面板 */}
                {isMobile && (
                  <button onClick={() => setRightOpen(false)} className="p-0.5 hover:bg-gray-100 rounded text-gray-400">
                    <ChevronRight size={13} />
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                <DetailPanel
                  selectedNode={selectedNode}
                  selectedEdge={selectedEdge}
                  relations={filteredRelations}
                  onEditEntity={e => setEntityDialog({ mode: 'edit', initial: { id: e.id, text: e.text, entity_class: e.type, description: e.description || '' } })}
                  onDeleteEntity={handleDeleteEntity}
                  onEditRelation={r => setRelationDialog({ mode: 'edit', initial: { id: r.id, source_text: r.source, target_text: r.target, relation_type: r.label } })}
                  onDeleteRelation={handleDeleteRelation}
                  onFindPath={name => setPathSource(name)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 对话框层 ── */}
      {entityDialog && (
        <EntityDialog
          initial={entityDialog.initial}
          onSave={handleSaveEntity}
          onClose={() => setEntityDialog(null)}
          isSaving={isSaving}
        />
      )}

      {relationDialog && (
        <RelationDialog
          initial={relationDialog.initial}
          entityNames={entityNames}
          onSave={handleSaveRelation}
          onClose={() => setRelationDialog(null)}
          isSaving={isSaving}
        />
      )}

      {pathSource !== null && (
        <PathFinderDialog
          initialSource={pathSource}
          entityNames={entityNames}
          relations={relations}
          onClose={() => setPathSource(null)}
        />
      )}

      {showImport && (
        <ImportDialog
          onConfirm={handleImportConfirm}
          onClose={() => setShowImport(false)}
        />
      )}

      <ToastContainer toasts={toasts} />
    </>,
    document.body
  )
}
