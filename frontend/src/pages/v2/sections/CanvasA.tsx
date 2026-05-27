import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { v2Api, databaseApi, type V2Workspace, type V2Session, type V2CanvasNode, type V2Board, type V2Profile } from '../../../api'
import EChartsRenderer from '../../../components/EChartsRenderer'
import { useV2Ask } from './useV2Ask'
import { v2Urls } from './urlProtocol'

type ChartKind = 'bar' | 'area' | 'funnel' | 'funnel2' | 'compare'

type Branch = {
  id: string
  label: string
  title: string
  tag: string
  chart: ChartKind
  q: string
}

type Node = {
  id: string
  who: string
  q: string
  steps: number
  elapsed: string
  title: string
  tag: string
  chart: ChartKind | null     // null = 纯对话，无图表
  chartOption?: any | null    // 真实 ECharts option (优先于 chart kind)
  thinking: string[]
  sql?: string
  pinnedToBoardId?: string | null   // 已钉的看板 id（real-data 节点才有）
  userNodeId?: string               // 配对的 user 节点 id (删此回合用)
  createdAt?: string                // 真实创建时间 (ISO),render 成 HH:MM
  branches?: Branch[]
}

type Scenario = {
  title: string
  who: string
  avatar: string
  chips: string[]
  placeholder: string
  nodes: Node[]
}

type RoleId = 'exec' | 'sales' | 'pm' | 'ops' | 'analyst' | 'admin'

/* ---------- Tiny SVG charts ---------- */
export function AreaChart({ label, data, stroke = 'var(--amber-deep)' }: { label: string; data?: number[]; stroke?: string }) {
  const points = data ?? [22, 28, 26, 35, 41, 38, 48, 55, 52, 64, 70, 78]
  const max = Math.max(...points), min = Math.min(...points)
  const W = 320, H = 140, P = 8
  const xs = points.map((_, i) => P + (i / (points.length - 1)) * (W - 2 * P))
  const ys = points.map(v => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P))
  const path = xs.map((x, i) => `${i ? 'L' : 'M'}${x},${ys[i]}`).join(' ')
  const area = `${path} L${xs[xs.length - 1]},${H - P} L${xs[0]},${H - P} Z`
  const gid = `g-${label}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.16 65 / 0.35)" />
          <stop offset="100%" stopColor="oklch(0.78 0.16 65 / 0)" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1={P} x2={W - P} y1={H * t} y2={H * t} stroke="oklch(0.85 0.018 60)" strokeDasharray="2 4" strokeWidth="0.8" />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3.5" fill={stroke} stroke="var(--paper)" strokeWidth="2" />
    </svg>
  )
}

export function BarChart({ stroke = 'var(--terracotta)' }: { stroke?: string }) {
  const data = [42, 56, 38, 71, 64, 88, 52]
  const labels = ['抖音', '小红书', '微信', '微博', '快手', '私域', '搜索']
  const max = Math.max(...data)
  const W = 320, H = 140, P = 8, GAP = 6
  const bw = (W - 2 * P - GAP * (data.length - 1)) / data.length
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="chart-svg" preserveAspectRatio="none">
      <line x1={P} x2={W - P} y1={H * 0.5} y2={H * 0.5} stroke="oklch(0.85 0.018 60)" strokeDasharray="2 4" strokeWidth="0.8" />
      {data.map((v, i) => {
        const h = (v / max) * (H - 2 * P)
        const x = P + i * (bw + GAP)
        const y = H - P - h
        return <rect key={i} x={x} y={y} width={bw} height={h} fill={stroke} opacity={0.55 + 0.4 * (v / max)} rx="2" />
      })}
      {labels.map((l, i) => (
        <text key={i} x={P + i * (bw + GAP) + bw / 2} y={H + 8} textAnchor="middle" fontSize="8" fill="var(--ink-4)" fontFamily="var(--font-mono)">{l}</text>
      ))}
    </svg>
  )
}

export function FunnelChart({ ratios }: { ratios?: number[] }) {
  const r = ratios ?? [100, 62, 38, 14]
  const labels = ['访问', '注册', '激活', '付费']
  const colors = ['oklch(0.78 0.16 65)', 'oklch(0.70 0.16 55)', 'oklch(0.62 0.18 45)', 'oklch(0.55 0.16 35)']
  const W = 320, H = 140
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
      {r.map((v, i) => {
        const top = (i / r.length) * H + 4
        const bot = ((i + 1) / r.length) * H - 2
        const tw = (v / 100) * (W - 40)
        const tx = (W - tw) / 2
        const nv = i < r.length - 1 ? r[i + 1] : v
        const bw = (nv / 100) * (W - 40)
        const bx = (W - bw) / 2
        return (
          <g key={i}>
            <path d={`M${tx},${top} L${tx + tw},${top} L${bx + bw},${bot} L${bx},${bot} Z`} fill={colors[i]} opacity="0.85" />
            <text x={W / 2} y={(top + bot) / 2 + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="600">{labels[i]} · {v}%</text>
          </g>
        )
      })}
    </svg>
  )
}

export function LineCompareChart() {
  const a = [22, 28, 26, 35, 41, 38, 48, 55, 52, 64, 70, 78]
  const b = [30, 32, 34, 33, 38, 41, 44, 46, 48, 51, 53, 55]
  const W = 320, H = 140, P = 10, max = 80, min = 20
  const toPath = (arr: number[]) => arr.map((v, i) => {
    const x = P + (i / (arr.length - 1)) * (W - 2 * P)
    const y = H - P - ((v - min) / (max - min)) * (H - 2 * P)
    return `${i ? 'L' : 'M'}${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1={P} x2={W - P} y1={H * t} y2={H * t} stroke="oklch(0.85 0.018 60)" strokeDasharray="2 4" strokeWidth="0.8" />
      ))}
      <path d={toPath(a)} fill="none" stroke="var(--amber-deep)" strokeWidth="2" strokeLinecap="round" />
      <path d={toPath(b)} fill="none" stroke="var(--terracotta)" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />
      <text x={W - 12} y={28} textAnchor="end" fontSize="10" fill="var(--amber-deep)" fontFamily="var(--font-mono)">抖音</text>
      <text x={W - 12} y={42} textAnchor="end" fontSize="10" fill="var(--terracotta)" fontFamily="var(--font-mono)">私域</text>
    </svg>
  )
}

function ChartFor({ chart, label }: { chart: ChartKind | null; label: string }) {
  if (!chart) return null
  if (chart === 'bar') return <BarChart />
  if (chart === 'area') return <AreaChart label={label} />
  if (chart === 'funnel') return <FunnelChart />
  if (chart === 'funnel2') return <FunnelChart ratios={[100, 78, 56, 31]} />
  if (chart === 'compare') return <LineCompareChart />
  return null
}

function highlightSql(s: string) {
  return s
    .replace(/('[^']*')/g, '<span style="color:oklch(0.75 0.13 35)">$1</span>')
    .replace(/\b(\d+)\b/g, '<span style="color:oklch(0.7 0.16 145)">$1</span>')
    .replace(/\b(SELECT|FROM|WHERE|AND|OR|GROUP BY|ORDER BY|BETWEEN|AS|COUNT|DISTINCT|JOIN|ON|LIMIT|HAVING)\b/g, '<span style="color:oklch(0.78 0.16 65)">$1</span>')
}

/* ---------- Node card ---------- */
type Mode = 'business' | 'analyst'

function NodeCard({
  n, isCurrent, mode, onBranch, onAsk, onFocus, onPin, onUnpin, onDeleteTurn,
}: {
  n: Node
  isCurrent: boolean
  mode: Mode
  onBranch: () => void
  onAsk: () => void
  onFocus: () => void
  onPin: () => void
  onUnpin: () => void
  onDeleteTurn: () => void
}) {
  const [thinkOpen, setThinkOpen] = useState(false)
  const [sqlOpen, setSqlOpen] = useState(false)
  return (
    <div className={`card ${isCurrent ? 'is-current' : ''}`}>
      <div className="q">
        <span className="who">{n.who || '运营'}</span>
        <span className="text">{n.q}</span>
      </div>
      <div className="think" onClick={() => setThinkOpen(!thinkOpen)} style={{ cursor: 'pointer' }}>
        <span className="chev" style={{ display: 'inline-block', transform: thinkOpen ? 'rotate(90deg)' : '', transition: 'transform 200ms' }}>▸</span>
        已思考 <span className="count">{n.steps} 步</span>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>{n.elapsed}</span>
      </div>
      {thinkOpen && (
        <div style={{ padding: '10px 20px', background: 'var(--paper-2)', borderBottom: '1px solid var(--line-2)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', lineHeight: 1.7 }}>
          {n.thinking.map((t, i) => <div key={i}>{i + 1}. {t}</div>)}
        </div>
      )}
      {n.chartOption?.series ? (
        <div className="chart">
          <div className="chart-meta">
            <span className="title">{n.title}</span>
            <span className="tag">{n.tag}</span>
          </div>
          <div style={{ width: '100%', height: 200, borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            <EChartsRenderer option={n.chartOption} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      ) : n.chart ? (
        <div className="chart">
          <div className="chart-meta">
            <span className="title">{n.title}</span>
            <span className="tag">{n.tag}</span>
          </div>
          <ChartFor chart={n.chart} label={n.id} />
        </div>
      ) : (
        <div className="chart" style={{ padding: 'var(--s-4) var(--s-5)' }}>
          <div className="chart-meta" style={{ marginBottom: 0 }}>
            <span className="tag">{n.tag || '对话'}</span>
            <span className="tag" style={{ color: 'var(--ink-4)' }}>{n.elapsed}</span>
          </div>
          <div style={{
            marginTop: 8, fontSize: 14, lineHeight: 1.6,
            color: 'var(--ink-1)', whiteSpace: 'pre-wrap',
          }}>{n.title}</div>
        </div>
      )}
      {mode === 'analyst' && n.sql && (
        <div className="sql">
          {n.sql.split('\n').map((line, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: highlightSql(line) }} />
          ))}
        </div>
      )}
      <div className="actions">
        {mode === 'business' && n.sql && (
          <button onClick={() => setSqlOpen(!sqlOpen)}>{sqlOpen ? '收起 SQL' : '查看 SQL'}</button>
        )}
        <button onClick={onBranch}>＋ 分支</button>
        <button onClick={onAsk}>追问</button>
        <button onClick={onFocus}>放大</button>
        <Link to={v2Urls.nodeDetail(n.id)} style={{ padding: '4px 10px', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 12, color: 'var(--ink-1)', textDecoration: 'none', background: 'transparent' }}>查看详情 →</Link>
        {n.pinnedToBoardId ? (
          <button onClick={onUnpin} title="从看板取消钉" style={{ background: 'var(--paper-2)', color: 'var(--ink-2)', border: '1px solid var(--line-1)' }}>★ 已钉 · 取消</button>
        ) : (
          <button className="primary" onClick={onPin}>钉到看板 →</button>
        )}
        <button
          onClick={onDeleteTurn}
          title="删除此回合 (问 + 答 + 子分支 + 评论 + 看板组件)"
          style={{ marginLeft: 'auto', color: 'var(--terracotta)', border: '1px solid var(--line-1)', background: 'transparent' }}
        >✕ 删此回合</button>
      </div>
      {mode === 'business' && sqlOpen && n.sql && (
        <div className="sql">
          {n.sql.split('\n').map((line, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: highlightSql(line) }} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Real-data adapters: V2CanvasNode[] -> Node[] ---------- */
function parseCfg(cfg: unknown): any {
  if (!cfg) return null
  if (typeof cfg === 'string') {
    try { return JSON.parse(cfg) } catch { return null }
  }
  return cfg
}
function chartKindFromCfg(cfg: unknown): ChartKind | null {
  const p = parseCfg(cfg)
  const t = p?.series?.[0]?.type
  if (t === 'bar') return 'bar'
  if (t === 'line') return 'area'
  if (t === 'funnel') return 'funnel'
  return null     // 不识别 / 无 series → 纯对话，不渲染图表
}
function titleFromCfg(cfg: unknown, fallback: string): string {
  const p = parseCfg(cfg)
  return p?.title?.text || (typeof p?.title === 'string' ? p.title : '') || fallback
}
const TAG_BY_KIND: Record<ChartKind, string> = {
  bar: '柱状图', area: '面积图', funnel: '漏斗图', funnel2: '漏斗图', compare: '对比折线',
}

function canvasNodesToNodes(cn: V2CanvasNode[]): Node[] {
  // 按 position_index 升序成对消费 user → assistant
  const sorted = [...cn].sort((a, b) => a.position_index - b.position_index)
  const nodes: Node[] = []
  let lastAssistantNodeId: string | null = null  // 最近一个 assistant 的 node_id，用于判断分支
  for (let i = 0; i < sorted.length; i++) {
    const u = sorted[i]
    if (u.role !== 'user') continue
    // 分支判定：user 的 parent_node_id 不是上一个 assistant 节点（说明从历史节点叉出来）
    const isBranch = !!u.parent_node_id && lastAssistantNodeId !== null && u.parent_node_id !== lastAssistantNodeId
    const a = sorted[i + 1]
    if (!a || a.role !== 'assistant') {
      // 流式中 / LLM 失败 — user 已落但 assistant 还没来
      nodes.push({
        id: u.node_id, who: '你', q: u.content || '',
        steps: 0, elapsed: '—',
        title: '等待回答', tag: '', chart: 'bar',
        thinking: [],
        userNodeId: u.node_id,
        createdAt: u.created_at,
      })
      continue
    }
    const chart = chartKindFromCfg(a.chart_cfg_json)
    const elapsed = a.elapsed_ms && a.elapsed_ms > 0
      ? `${(a.elapsed_ms / 1000).toFixed(1)}s`
      : '—'
    const thinkingLines = Array.isArray(a.thinking_steps_json) ? a.thinking_steps_json : []
    const isChat = !chart && !a.sql
    nodes.push({
      id: a.node_id,
      who: '你',
      q: (isBranch ? '↳ ' : '') + (u.content || ''),
      steps: thinkingLines.length,
      elapsed,
      title: chart ? titleFromCfg(a.chart_cfg_json, '分析结果') : (a.content || '回答'),
      tag: isBranch ? '分支' : (chart ? (TAG_BY_KIND[chart] || '') : (isChat ? '对话' : '')),
      chart,
      chartOption: parseCfg(a.chart_cfg_json),
      thinking: thinkingLines,
      sql: a.sql || undefined,
      pinnedToBoardId: a.pinned_to_board_id,
      userNodeId: u.node_id,
      createdAt: a.created_at || u.created_at,
    })
    lastAssistantNodeId = a.node_id
    i += 1
  }
  return nodes
}

/* ---------- Role-specific seed canvases (kept for empty-demo fallback) ---------- */
export const ROLE_SCENARIOS: Record<RoleId, Scenario> = {
  exec: {
    title: 'Q3 营收复盘',
    who: '高管',
    avatar: '高',
    chips: ['▸ 与去年同期对比', '▸ 哪个渠道贡献最大', '▸ 给我一个执行摘要'],
    placeholder: "问点什么? 试试 '这周营收为什么创新高'...",
    nodes: [
      { id: 'n1', who: '高管', q: '这周营收怎么样?', steps: 4, elapsed: '0.5s',
        title: '12 周营收走势', tag: '面积图 · 同比', chart: 'area',
        thinking: ['识别意图 → 营收概览', '默认时间窗 → 12 周', '加入同比对照', '渲染面积图'],
        sql: "SELECT week, SUM(revenue) AS rev\nFROM orders\nWHERE week BETWEEN '2026-W05' AND '2026-W17'\nGROUP BY 1 ORDER BY 1" },
      { id: 'n2', who: '高管', q: '是谁带动的?按渠道看', steps: 6, elapsed: '0.9s',
        title: '渠道 GMV 占比', tag: '柱状 · 7 渠道', chart: 'bar',
        thinking: ['解析 → 拆解到渠道维度', '复用上一节点时间窗', '按 GMV 排序', '渲染柱状图', '..2 步'],
        sql: "SELECT channel, SUM(gmv) AS gmv\nFROM orders\nWHERE week = '2026-W17'\nGROUP BY channel ORDER BY gmv DESC" },
      { id: 'n3', who: '高管', q: '抖音和私域哪个 ROI 更高?', steps: 9, elapsed: '1.4s',
        title: '抖音 vs 私域 · ROI 对比', tag: '对比折线', chart: 'compare',
        thinking: ['识别意图 → ROI 对比', '选择渠道 → tiktok, private', '计算 ROI = GMV / 投放成本', '..6 步'],
        sql: "SELECT channel, week, SUM(gmv)/SUM(cost) AS roi\nFROM ad_spend JOIN orders USING(channel, week)\nWHERE channel IN ('tiktok','private')\nGROUP BY 1,2",
        branches: [
          { id: 'n3a', label: '分支 A · 仅抖音', title: '抖音 ROI', tag: '已分支', chart: 'area', q: '只看抖音' },
          { id: 'n3b', label: '分支 B · 仅私域', title: '私域 ROI', tag: '已分支 · 对比', chart: 'area', q: '只看私域' },
        ] },
    ],
  },
  sales: {
    title: '销售管线诊断',
    who: '销售',
    avatar: '销',
    chips: ['▸ 卡住最久的单子', '▸ 华东 vs 华南成交速度', '▸ 本周我该拜访谁'],
    placeholder: "问点什么? 试试 '把华东漏斗和华南漏斗放一起'...",
    nodes: [
      { id: 'n1', who: '销售', q: '本周新签和回款情况', steps: 5, elapsed: '0.7s',
        title: '本周新签 / 回款', tag: '柱状 · 7 天', chart: 'bar',
        thinking: ['识别意图 → 业绩看板', '聚合 daily', '分别取 new / collect', '渲染柱状', '..1 步'],
        sql: "SELECT day, SUM(amount) FILTER (WHERE type='new') AS new_signed,\n  SUM(amount) FILTER (WHERE type='collect') AS collect\nFROM deals WHERE week = current_week GROUP BY 1" },
      { id: 'n2', who: '销售', q: '各阶段漏斗,哪一段在掉单?', steps: 7, elapsed: '1.0s',
        title: '销售漏斗 · 本季', tag: '漏斗 · 5 阶段', chart: 'funnel',
        thinking: ['识别意图 → 阶段流失分析', '取 5 个标准阶段', '统计各阶段进入数', '渲染漏斗', '..3 步'],
        sql: "SELECT stage, COUNT(DISTINCT deal_id) AS deals\nFROM deal_stage_log\nWHERE quarter = '2026-Q1' GROUP BY stage" },
      { id: 'n3', who: '销售', q: '华东和华南漏斗放一起对比', steps: 10, elapsed: '1.5s',
        title: '区域漏斗对比', tag: '漏斗 × 2', chart: 'funnel',
        thinking: ['锁定区域 → east, south', '并行算两段漏斗', '计算阶段差值', '..7 步'],
        sql: "SELECT region, stage, COUNT(*) FROM deals\nWHERE region IN ('east','south') GROUP BY 1,2",
        branches: [
          { id: 'n3a', label: '分支 A · 华东', title: '华东漏斗', tag: '已分支', chart: 'funnel', q: '只看华东' },
          { id: 'n3b', label: '分支 B · 华南', title: '华南漏斗', tag: '已分支 · 对比', chart: 'funnel2', q: '只看华南' },
        ] },
    ],
  },
  pm: {
    title: 'D7 留存下滑排查',
    who: '产品',
    avatar: '产',
    chips: ['▸ 下滑发生在哪一天', '▸ 新老用户分别看', '▸ 关联 EXP-014 实验'],
    placeholder: "问点什么? 试试 '看下激活后 7 天的核心动作完成率'...",
    nodes: [
      { id: 'n1', who: '产品', q: 'D7 留存最近怎么样?', steps: 5, elapsed: '0.6s',
        title: 'D7 留存 · 28 天', tag: '折线 · 4 周', chart: 'area',
        thinking: ['识别意图 → 留存曲线', '取 28 天窗口', '计算 D7', '渲染折线', '..1 步'],
        sql: "SELECT cohort_day, AVG(d7_retained) FROM cohorts\nWHERE cohort_day BETWEEN current_date-28 AND current_date GROUP BY 1" },
      { id: 'n2', who: '产品', q: '新用户激活漏斗,看断点', steps: 7, elapsed: '1.1s',
        title: '新用户激活漏斗', tag: '漏斗 · 4 阶段', chart: 'funnel',
        thinking: ['锁定新用户群体', '拆 4 个激活步骤', '算转化率', '..4 步'],
        sql: "SELECT step, COUNT(DISTINCT user_id) FROM activation_log\nWHERE registered_at >= current_date - 28 GROUP BY step" },
      { id: 'n3', who: '产品', q: '新用户 vs 老用户的核心动作完成率', steps: 9, elapsed: '1.4s',
        title: '核心动作完成率 · 新 vs 老', tag: '对比折线', chart: 'compare',
        thinking: ['区分群体 → cohort flag', '统计每日完成率', '并行画两条线', '..6 步'],
        sql: "SELECT day, cohort, AVG(completed) FROM action_log\nWHERE day >= current_date - 28 GROUP BY 1,2",
        branches: [
          { id: 'n3a', label: '分支 A · 新用户', title: '新用户完成率', tag: '已分支', chart: 'area', q: '只看新用户' },
          { id: 'n3b', label: '分支 B · 老用户', title: '老用户完成率', tag: '已分支 · 对比', chart: 'area', q: '只看老用户' },
        ] },
    ],
  },
  ops: {
    title: 'Q3 渠道效果复盘',
    who: '运营',
    avatar: '运',
    chips: ['▸ 加一条同期对比线', '▸ 按城市拆分', '▸ 预测下季度'],
    placeholder: "问点什么? 试试 '把抖音和私域的漏斗放一起对比'...",
    nodes: [
      { id: 'n1', who: '运营', q: 'Q3 各渠道带来的新用户数', steps: 5, elapsed: '0.8s',
        title: '各渠道新用户', tag: '柱状图 · 7 项', chart: 'bar',
        thinking: ['识别意图 → 渠道对比', '锁定时间窗口 → 2026-Q3', '选择维度 → channel', '生成 GROUP BY SQL', '渲染柱状图'],
        sql: "SELECT channel, COUNT(DISTINCT user_id) AS new_users\nFROM users\nWHERE registered_at BETWEEN '2026-07-01' AND '2026-09-30'\nGROUP BY channel ORDER BY new_users DESC" },
      { id: 'n2', who: '运营', q: '把它按月拆开,看 7-9 月的趋势', steps: 8, elapsed: '1.2s',
        title: '月度新用户走势', tag: '面积图 · 12 周', chart: 'area',
        thinking: ['解析"按月拆开" → 时间维度', '保留 channel 分组', '改用 DATE_TRUNC 月聚合', '增加同比对照', '检测异常波动', '渲染面积图', '..2 步'],
        sql: "SELECT DATE_TRUNC('week', registered_at) AS w,\n  COUNT(DISTINCT user_id) AS new_users\nFROM users\nWHERE registered_at BETWEEN '2026-07-01' AND '2026-09-30'\nGROUP BY 1 ORDER BY 1" },
      { id: 'n3', who: '运营', q: '主力渠道是抖音和私域,看下这两个渠道的转化漏斗', steps: 11, elapsed: '1.6s',
        title: '渠道 · 转化漏斗(主)', tag: '漏斗图 · 4 阶段', chart: 'funnel',
        thinking: ['识别意图 → 漏斗分析', '锁定渠道 → tiktok, private', '选择阶段 → visit/signup/active/paid', '拼接两段 SQL', '检查阶段顺序', '..6 步'],
        sql: "SELECT stage, COUNT(DISTINCT user_id) AS users\nFROM events\nWHERE channel IN ('tiktok','private')\n  AND ts BETWEEN '2026-07-01' AND '2026-09-30'\nGROUP BY stage ORDER BY stage",
        branches: [
          { id: 'n3a', label: '分支 A · 抖音', title: '抖音漏斗', tag: '已分支', chart: 'funnel', q: '只看抖音' },
          { id: 'n3b', label: '分支 B · 私域', title: '私域漏斗', tag: '已分支 · 对比', chart: 'funnel2', q: '只看私域' },
        ] },
    ],
  },
  analyst: {
    title: '自由探索',
    who: '分析师',
    avatar: '析',
    chips: ['▸ 写一段 SQL 看 7 日活跃', '▸ 自定义查询: 上月 GMV TOP10', '▸ 跑一个 cohort'],
    placeholder: "你是分析师，写 SQL / 跑查询 / 看血缘 都行...",
    nodes: [],
  },
  admin: {
    title: '管理 · 数据治理',
    who: '管理员',
    avatar: '管',
    chips: ['▸ 谁本周改过看板', '▸ API Key 用量 TOP', '▸ 模型路由统计'],
    placeholder: "你是管理员，看审计 / 调路由 / 管账单 都行...",
    nodes: [],
  },
}

const ROLES: { id: RoleId; label: string }[] = [
  { id: 'exec', label: '高管' },
  { id: 'sales', label: '销售' },
  { id: 'pm', label: '产品' },
  { id: 'ops', label: '运营' },
  { id: 'analyst', label: '分析师' },
  { id: 'admin', label: '管理员' },
]

export function RoleSwitcher({ value, onChange }: { value: RoleId; onChange: (r: RoleId) => void }) {
  return (
    <div className="role-switcher" role="tablist" aria-label="角色">
      <span className="rs-label">视角</span>
      {ROLES.map(r => (
        <button
          key={r.id}
          role="tab"
          aria-selected={value === r.id}
          className={value === r.id ? 'on' : ''}
          onClick={() => onChange(r.id)}
        >{r.label}</button>
      ))}
    </div>
  )
}

/* ---------- Page ---------- */
function CanvasEmpty({
  hasSession,
  sessions,
  loading,
  workspace,
  onPick,
  onCreate,
}: {
  hasSession: boolean
  sessions: V2Session[]
  loading: boolean
  workspace: V2Workspace | null
  onPick: (id: string) => void
  onCreate: () => void
}) {
  return (
    <div className="v2-root" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>
      <div style={{ textAlign: 'center', maxWidth: 520, padding: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>DataPulse · v2 画布</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, margin: '0 0 12px', color: 'var(--ink-1)' }}>
          {hasSession ? '这个会话还没有消息' : '挑一个会话开始'}
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
          {hasSession ? '直接在底部提问即可。' : '选一个已有的 v2 会话，或新建一个。'}
        </p>
        {workspace && (
          <p style={{ color: 'var(--ink-4)', fontSize: 12, marginBottom: 24 }}>
            工作区：{workspace.name}
          </p>
        )}

        {!hasSession && (
          <div style={{ marginBottom: 20, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            {loading ? (
              <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>正在加载 v2 会话列表…</div>
            ) : (
              <>
                {sessions.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={e => e.target.value && onPick(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 14,
                      background: 'var(--paper)',
                      color: 'var(--ink-1)',
                      border: '1px solid var(--line-1)',
                      borderRadius: 'var(--r-lg)',
                      minWidth: 280,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled>选会话…（共 {sessions.length} 个）</option>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>{s.title || '未命名'} · {s.id.slice(0, 8)}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={onCreate}
                  style={{
                    padding: '10px 20px',
                    background: 'var(--amber-deep)',
                    color: 'var(--paper)',
                    border: 0,
                    borderRadius: 999,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >＋ 新建会话</button>
              </>
            )}
          </div>
        )}

        <Link
          to="/v2-preview"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            background: 'transparent',
            color: 'var(--ink-2)',
            borderRadius: 999,
            fontSize: 13,
            border: '1px solid var(--line-1)',
            textDecoration: 'none',
          }}
        >← 返回 v2 索引</Link>
      </div>
    </div>
  )
}

function roleIdFrom(profile: V2Profile | null): RoleId {
  const r = profile?.role
  if (r === 'exec' || r === 'sales' || r === 'pm' || r === 'ops' || r === 'analyst' || r === 'admin') return r
  return 'ops' // 默认运营（最常见场景）
}

export function CanvasA() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [profile, setProfile] = useState<V2Profile | null>(null)
  const [workspace, setWorkspace] = useState<V2Workspace | null>(null)
  const [sessions, setSessions] = useState<V2Session[]>([])
  const [currentSession, setCurrentSession] = useState<V2Session | null>(null)
  const [canvasNodes, setCanvasNodes] = useState<V2CanvasNode[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const roleId = roleIdFrom(profile)
  const roleScenario = ROLE_SCENARIOS[roleId]
  const roleLabel = ROLES.find(r => r.id === roleId)?.label ?? ''

  const realNodes = useMemo(() => canvasNodesToNodes(canvasNodes), [canvasNodes])
  const hasSession = !!currentSession

  const [mode, setMode] = useState<Mode>('business')
  const [modeManuallySet, setModeManuallySet] = useState(false)
  // 数据源桥(临时,阶段 8 语义层落地后改走 v2 自己的)
  type DbItem = { key: string; name: string; type: string; is_current: boolean; source: string }
  const [databases, setDatabases] = useState<DbItem[]>([])
  const [currentDbKey, setCurrentDbKey] = useState<string>('')
  const [dbSwitching, setDbSwitching] = useState(false)
  const reloadDatabases = async () => {
    try {
      const r = await databaseApi.getDatabases()
      const list: DbItem[] = r.databases || []
      setDatabases(list)
      const cur = list.find(d => d.is_current)
      setCurrentDbKey(cur?.key || '')
    } catch (err: any) { console.warn('[CanvasA] 拉数据库列表失败:', err?.message || err) }
  }
  useEffect(() => { reloadDatabases() }, [])
  const switchDb = async (key: string) => {
    setDbSwitching(true)
    try {
      await databaseApi.switchDatabase(key)
      await reloadDatabases()
    } catch (err: any) { alert(`切换失败: ${err?.message || err}`) }
    finally { setDbSwitching(false) }
  }
  const useRealDb = !!currentDbKey   // 有 active datasource 就让后端真查;否则纯 LLM 闲聊
  // 角色 → 默认 mode (analyst/admin 默认 analyst, 其余 business)
  // 仅未手动切过时跟随角色;手动切过保留用户选择
  useEffect(() => {
    if (modeManuallySet) return
    const want: Mode = (roleId === 'analyst' || roleId === 'admin') ? 'analyst' : 'business'
    if (want !== mode) setMode(want)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId])
  const [nodes, setNodes] = useState<Node[]>(realNodes)
  const [currentId, setCurrentId] = useState<string>(realNodes[realNodes.length - 1]?.id ?? '')
  const [askInput, setAskInput] = useState('')

  const { ask, isLoading } = useV2Ask()

  // 节点数据变化时同步本地 state；空 session 也允许（用户能在 dock 提第一个问题）
  useEffect(() => {
    setNodes(realNodes)
    setCurrentId(realNodes[realNodes.length - 1]?.id ?? '')
  }, [realNodes])

  // 1a. 进入时拉 profile（拿 role），没角色就用 ops 兜底
  useEffect(() => {
    if (profile) return
    v2Api.getMyProfile()
      .then(setProfile)
      .catch(err => console.warn('[CanvasA] 拉 profile 失败:', err?.message || err))
  }, [profile])

  // 1b. 进入时初始化工作区（无则后端自动建"我的工作区"）
  useEffect(() => {
    if (workspace) return
    v2Api.getCurrentWorkspace()
      .then(setWorkspace)
      .catch(err => console.warn('[CanvasA] 拉工作区失败:', err?.message || err))
  }, [workspace])

  // 2. 拿到工作区后拉 v2 sessions 列表
  useEffect(() => {
    if (!workspace || currentSession) return
    setSessionsLoading(true)
    v2Api.listSessions(workspace.id)
      .then(list => setSessions(list || []))
      .catch(err => console.warn('[CanvasA] 拉 v2 sessions 失败:', err?.message || err))
      .finally(() => setSessionsLoading(false))
  }, [workspace, currentSession])

  // DAT-25 · URL 协议消费 (?session=&node=&seed_q=) — sessions 拉好后挑指定 session
  const querySession = searchParams.get('session')
  const queryNode = searchParams.get('node')
  const querySeedQ = searchParams.get('seed_q')
  useEffect(() => {
    if (!querySession || currentSession) return
    const target = sessions.find(s => s.id === querySession)
    if (target) {
      setCurrentSession(target)
      reloadNodes(target.id)
    }
  }, [querySession, sessions, currentSession])
  // seed_q → 预填提问框 (一次性)
  useEffect(() => {
    if (querySeedQ) {
      setAskInput(querySeedQ)
      const next = new URLSearchParams(searchParams)
      next.delete('seed_q')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [querySeedQ])
  // node → 滚动定位 (节点加载后)
  useEffect(() => {
    if (!queryNode || !realNodes.length) return
    const exists = realNodes.find(n => n.id === queryNode)
    if (!exists) return
    setCurrentId(queryNode)
    setTimeout(() => {
      const el = stepRefs.current[queryNode]
      if (el && canvasRef.current) {
        canvasRef.current.scrollTo({ left: el.offsetLeft - 100, behavior: 'smooth' })
      }
    }, 80)
  }, [queryNode, realNodes])

  const reloadNodes = async (sessionId: string) => {
    try {
      const nodes = await v2Api.listCanvasNodes(sessionId)
      setCanvasNodes(nodes || [])
    } catch (err: any) {
      console.warn('[CanvasA] 拉 canvas_nodes 失败:', err?.message || err)
    }
  }

  const pickSession = (id: string) => {
    const target = sessions.find(s => s.id === id)
    if (!target) return
    setCurrentSession(target)
    reloadNodes(id)
  }

  const createSession = async () => {
    if (!workspace) return
    try {
      const ses = await v2Api.createSession(workspace.id, '新会话 · ' + new Date().toLocaleTimeString())
      setSessions([ses, ...sessions])
      setCurrentSession(ses)
      setCanvasNodes([])
    } catch (err: any) {
      console.warn('[CanvasA] 新建会话失败:', err?.message || err)
    }
  }

  const deleteSession = async (sid: string, title?: string | null) => {
    if (!confirm(`确认删除会话「${title || sid.slice(0, 8)}」?\n所有节点 / 消息一并删除,不可恢复。`)) return
    try {
      await v2Api.deleteV2Session(sid)
      setSessions(sessions.filter(s => s.id !== sid))
      if (currentSession?.id === sid) {
        setCurrentSession(null)
        setCanvasNodes([])
      }
    } catch (err: any) {
      alert(`删除失败: ${err?.response?.data?.detail || err?.message || err}`)
    }
  }
  const [focused, setFocused] = useState<(Node | Branch) | null>(null)
  const [pinned, setPinned] = useState<string[]>([])
  const [pinToast, setPinToast] = useState<{ msg: string; boardId?: string } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const handleAsk = (_id: string) => {
    // 节点卡上的"追问"按钮 — 现在通过 dock 输入框统一发，这里留空
  }

  const handleSend = () => {
    const q = askInput.trim()
    if (!q || !currentSession?.id || isLoading) return
    setAskInput('')
    const sid = currentSession.id
    ask(sid, q, {
      noDatabase: !useRealDb,  // 桥:有 active datasource 就接,无则纯 LLM(阶段 8 会换成 v2 自有语义层)
      onUserSaved: () => { reloadNodes(sid) },
      onDone: () => { reloadNodes(sid) },
      onError: (msg) => console.warn('[CanvasA] v2 ask error:', msg),
    })
  }

  const handleBranch = (id: string) => {
    if (!currentSession?.id) return
    const q = window.prompt('从此节点叉出去问什么？（会以该节点为父节点保存到 canvas_nodes）', '')
    if (!q || !q.trim()) return
    const sid = currentSession.id
    ask(sid, q.trim(), {
      parentNodeId: id,
      noDatabase: !useRealDb,  // 桥:同 handleSend
      onUserSaved: () => reloadNodes(sid),
      onDone: () => reloadNodes(sid),
      onError: (msg) => console.warn('[CanvasA] branch ask error:', msg),
    })
  }

  const handlePin = async (n: Node | Branch) => {
    // 分支节点是本地 demo 数据（v2 canvas_nodes 表里没有），不持久化
    const isLocalDemoBranch = !nodes.find(x => x.id === n.id)
    if (isLocalDemoBranch) {
      setPinToast({ msg: '分支暂未持久化，仅在画布内可见' })
      setTimeout(() => setPinToast(null), 2500)
      return
    }
    if (!workspace) return
    try {
      // 拿/建默认看板（boards 编辑器还没接入，所以暂时一键钉到首个看板）
      let boards: V2Board[] = await v2Api.listBoards(workspace.id)
      let board = boards[0]
      if (!board) {
        board = await v2Api.createBoard(workspace.id, '我的看板', '画布钉选项默认看板')
      }
      await v2Api.pinNodeToBoard(board.id, n.id)
      setPinned([...pinned, n.id])
      setPinToast({ msg: `已钉到「${board.title}」`, boardId: board.id })
      setTimeout(() => setPinToast(null), 4500)
      // 刷新让 pinned_to_board_id 同步
      if (currentSession) reloadNodes(currentSession.id)
    } catch (err: any) {
      setPinToast({ msg: `钉失败: ${err?.message || err}` })
      setTimeout(() => setPinToast(null), 3000)
    }
  }

  const handleDeleteTurn = async (n: Node) => {
    if (!confirm(`确认删除这一回合「${n.q?.slice(0, 30)}...」?\n问题 + 回答 + 子分支 + 评论 + 已钉看板组件一并删除,不可恢复。`)) return
    try {
      // 先删 assistant 节点(cascade 把子分支 / 评论 / widgets 清掉)
      await v2Api.deleteNode(n.id, true)
      // 再删配对的 user 节点(可能等于 n.id,等待中的占位)
      if (n.userNodeId && n.userNodeId !== n.id) {
        try { await v2Api.deleteNode(n.userNodeId, false) } catch { /* user 节点可能已被 cascade 带走 */ }
      }
      setPinned(pinned.filter(id => id !== n.id))
      if (currentSession) reloadNodes(currentSession.id)
    } catch (err: any) {
      alert(`删除失败: ${err?.response?.data?.detail || err?.message || err}`)
    }
  }

  const handleUnpin = async (n: Node | Branch) => {
    if (!('pinnedToBoardId' in n) || !n.pinnedToBoardId) return
    const boardId = n.pinnedToBoardId
    try {
      const board = await v2Api.getBoard(boardId)
      const widget = (board?.widgets || []).find((w: any) => w.source_node_id === n.id)
      if (!widget) {
        setPinToast({ msg: '未找到对应的看板组件,可能已被删除' })
        setTimeout(() => setPinToast(null), 2500)
        if (currentSession) reloadNodes(currentSession.id)
        return
      }
      await v2Api.deleteWidget(boardId, widget.widget_id)
      setPinned(pinned.filter(id => id !== n.id))
      setPinToast({ msg: `已从「${board.title}」取消钉` })
      setTimeout(() => setPinToast(null), 2500)
      if (currentSession) reloadNodes(currentSession.id)
    } catch (err: any) {
      setPinToast({ msg: `取消失败: ${err?.message || err}` })
      setTimeout(() => setPinToast(null), 3000)
    }
  }

  const jumpTo = (id: string) => {
    setCurrentId(id)
    const el = stepRefs.current[id]
    if (el && canvasRef.current) {
      canvasRef.current.scrollTo({ left: el.offsetLeft - 100, behavior: 'smooth' })
    }
  }

  if (!hasSession) {
    return (
      <CanvasEmpty
        hasSession={false}
        sessions={sessions}
        loading={sessionsLoading}
        workspace={workspace}
        onPick={pickSession}
        onCreate={createSession}
      />
    )
  }

  return (
    <div className="v2-root" style={{ position: 'fixed', inset: 0 }}>
      <div className="app-shell fullscreen" style={{ gridTemplateRows: 'auto 56px 1fr 88px' }}>
        {/* DATA-SOURCE BRIDGE (临时,阶段 8 语义层落地后撤掉) */}
        <div style={{
          padding: '4px 12px', minHeight: 0, lineHeight: 1.2,
          background: useRealDb ? 'oklch(0.78 0.16 65 / 0.08)' : 'oklch(0.92 0.015 70)',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
          color: 'var(--ink-3)',
        }}>
          <span title="数据源桥 (阶段 8 语义层前的临时通道)" style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em',
            textTransform: 'uppercase', color: 'var(--amber-deep)',
          }}>● DS</span>
          <select
            value={currentDbKey}
            disabled={dbSwitching}
            onChange={e => switchDb(e.target.value)}
            style={{ padding: '1px 6px', fontSize: 11, background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 3, maxWidth: 260 }}
          >
            <option value="">(不接库 · 纯 LLM 闲聊)</option>
            {databases.map(d => (
              <option key={d.key} value={d.key}>
                {d.name} · {d.type}{d.source === 'user' ? ' · 我的' : ''}
              </option>
            ))}
          </select>
          <span style={{ color: useRealDb ? 'var(--success)' : 'var(--ink-4)', fontSize: 10 }}>
            {useRealDb ? '✓ 真查 SQL' : '纯 LLM 闲聊'}
          </span>
          {dbSwitching && <span style={{ fontSize: 10 }}>切换中…</span>}
        </div>
        <div className="topbar">
          <div className="brand"><span className="dot"></span>DataPulse</div>
          <div className="crumbs">
            <span>个人空间</span><span className="sep">/</span>
            <span className="now">{currentSession?.title || '未命名会话'}</span>
            {currentSession && (
              <button
                onClick={() => deleteSession(currentSession.id, currentSession.title)}
                title="删除当前会话 (含全部节点 / 消息)"
                aria-label="删除当前会话"
                style={{
                  marginLeft: 4, width: 18, height: 18, padding: 0,
                  background: 'transparent', border: 0,
                  fontSize: 12, color: 'var(--ink-5)',
                  cursor: 'pointer', lineHeight: 1, opacity: 0.6,
                  borderRadius: 3,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--terracotta)'; e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-5)'; e.currentTarget.style.opacity = '0.6' }}
              >✕</button>
            )}
            <span className="sep">·</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>main</span>
          </div>
          <div style={{ flex: 1 }} />
          <RoleSwitcher
            value={roleId}
            onChange={async (r) => {
              const optimistic: V2Profile = { ...(profile ?? { user_id: 0, display_name: null, role: null, team_id: null, avatar_url: null, lang: 'zh-CN', theme: 'light', density: 'cozy', shortcuts_json: null }), role: r }
              setProfile(optimistic)
              try { await v2Api.updateMyProfile({ role: r }) } catch (err) { console.warn('[CanvasA] 切换角色失败:', err) }
            }}
          />
          <div className="right">
            <span className="pill"><span className="led"></span>{nodes.length} 个节点</span>
            <span className="pill">⌘ K</span>
            {pinned.length > 0 && (
              <span className="pill" style={{ borderColor: 'var(--amber-deep)', color: 'var(--amber-deep)' }}>★ 看板 · {pinned.length}</span>
            )}
            <span className="pill">分享</span>
            <div className="avatar" title={`${roleLabel} · ${profile?.display_name ?? ''}`}>{roleScenario.avatar}</div>
          </div>
        </div>

        <div className="canvas" ref={canvasRef}>
          <div className="minimap">
            {nodes.map(n => (
              <div
                key={n.id}
                className={`seg ${n.id === currentId ? 'cur' : ''} ${n.branches?.length ? 'br' : ''}`}
                title={n.title}
                onClick={() => jumpTo(n.id)}
              />
            ))}
            <div className="seg" style={{ opacity: 0.25 }} />
            <div className="mini-label">概览</div>
          </div>

          <div className="timeline">
            <div className="timeline-rail" />
            <div className="steps">
              {nodes.map(n => (
                <div
                  key={n.id}
                  ref={el => { stepRefs.current[n.id] = el }}
                  className={`step ${n.id === currentId ? 'current' : ''} ${n.branches?.length ? 'branched' : ''}`}
                >
                  <div className="node" onClick={() => setCurrentId(n.id)} />
                  <div className="stamp">
                    <div className="num">{String(nodes.indexOf(n) + 1).padStart(2, '0')}</div>
                    <div className="when">{
                      n.id === currentId
                        ? '现在'
                        : (n.createdAt
                            ? new Date(n.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : '—')
                    } · {n.branches?.length ? '已分支' : '主线'}</div>
                  </div>
                  <NodeCard
                    n={n}
                    isCurrent={n.id === currentId}
                    mode={mode}
                    onBranch={() => handleBranch(n.id)}
                    onAsk={() => handleAsk(n.id)}
                    onFocus={() => setFocused(n)}
                    onPin={() => handlePin(n)}
                    onUnpin={() => handleUnpin(n)}
                    onDeleteTurn={() => handleDeleteTurn(n)}
                  />

                  {n.branches && n.branches.length > 0 && (
                    <div className="branch-row">
                      {n.branches.map(b => (
                        <div key={b.id} className="card branch-card">
                          <div className="branch-label">{b.label}</div>
                          <div className="chart">
                            <div className="chart-meta">
                              <span className="title" style={{ fontSize: 18 }}>{b.title}</span>
                              <span className="tag">{b.tag}</span>
                            </div>
                            <ChartFor chart={b.chart} label={b.id} />
                          </div>
                          <div className="actions">
                            <button onClick={() => handleBranch(n.id)}>再分支</button>
                            <button onClick={() => setFocused(b)}>放大</button>
                            <button className="primary" onClick={() => handlePin(b)}>钉到看板 →</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="step ghost">
                <div className="ghost-card">
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, color: 'var(--ink-4)', marginBottom: 8 }}>+</div>
                    <div>继续提问 · 或拖任意节点出来分支</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dock">
          {nodes.length === 0 && (
            <div className="suggest">
              {roleScenario.chips.map((c, i) => (
                <span
                  key={i}
                  className="chip"
                  onClick={() => setAskInput(c.replace(/^▸\s*/, ''))}
                  title="点击填入输入框"
                >{c}</span>
              ))}
            </div>
          )}
          <div className="dock-input">
            <span className="lead">›</span>
            <input
              value={askInput}
              onChange={e => setAskInput(e.target.value)}
              placeholder={isLoading ? '正在生成回答…' : roleScenario.placeholder}
              disabled={isLoading}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
          </div>
          <div className="dock-mode">
            <button className={mode === 'business' ? 'on' : ''} onClick={() => { setMode('business'); setModeManuallySet(true) }}>业务</button>
            <button className={mode === 'analyst' ? 'on' : ''} onClick={() => { setMode('analyst'); setModeManuallySet(true) }}>分析师</button>
          </div>
          <button
            className="dock-send"
            onClick={handleSend}
            disabled={isLoading || !askInput.trim()}
            style={isLoading || !askInput.trim() ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >{isLoading ? '生成中…' : '发送'} <span style={{ opacity: 0.6 }}>⏎</span></button>
        </div>

        {focused && (
          <div className="focus-overlay" onClick={() => setFocused(null)}>
            <div className="focus-card" onClick={e => e.stopPropagation()}>
              <div className="focus-head">
                <div>
                  <div className="eyebrow">放大节点 · {('label' in focused && focused.label) || focused.title}</div>
                  <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 400, margin: '8px 0 0', color: 'var(--ink-1)' }}>
                    {('q' in focused && focused.q) || focused.title}
                  </h3>
                </div>
                <button className="focus-close" onClick={() => setFocused(null)}>✕</button>
              </div>
              <div style={{ padding: '24px 32px' }}>
                <div style={{ transform: 'scale(2.4)', transformOrigin: 'top left', width: '320px', height: '140px', marginBottom: 240 }}>
                  <ChartFor chart={focused.chart} label={focused.id} />
                </div>
              </div>
            </div>
          </div>
        )}

        {pinToast && (
          <div className="pin-toast">
            ★ <strong>{pinToast.msg}</strong>
            {pinToast.boardId && (
              <>
                {' · '}
                <Link
                  to={v2Urls.boardEditor(pinToast.boardId)}
                  style={{ marginLeft: 8, color: 'var(--amber-deep)', textDecoration: 'underline', fontWeight: 600 }}
                >
                  打开看板 →
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
