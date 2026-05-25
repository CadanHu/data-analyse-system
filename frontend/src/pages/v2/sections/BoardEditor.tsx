// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/BoardEditor.jsx
// 阶段 3 后半段：BoardEditor 顶部加"真实看板连接条"，能看到从 canvas 钉过来的真实 widgets，能删除。
// 完整拖拽编辑暂未做（demo 视觉保留）。
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { v2Api } from '../../../api'

const { useState: useS_BE } = React;

/* =========================================================
   Board · Editor / Templates / Schedule
   ========================================================= */

function P1Top_BE({ crumbs, badge, clock='14:52 · main' }) {
  return (
    <div className="p1-topbar">
      <div className="brand"><span className="dot"/>DataPulse</div>
      <span className="crumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{margin:'0 8px', color:'var(--ink-5)'}}>/</span>}
            {i === crumbs.length - 1 ? <b>{c}</b> : c}
          </React.Fragment>
        ))}
      </span>
      {badge && (
        <span style={{
          fontFamily:'var(--font-mono)', fontSize:10,
          letterSpacing:'0.2em', textTransform:'uppercase',
          color:'var(--ink-3)', padding:'3px 8px',
          border:'1px solid var(--line-1)', borderRadius:999, marginLeft:8
        }}>{badge}</span>
      )}
      <span style={{flex:1}}/>
      <span className="clk">{clock}</span>
      <div className="av">李</div>
    </div>
  );
}

/* =========================================================
   1. Board editor — drag nodes onto a free-form canvas
   ========================================================= */

function RealBoardConnector() {
  const [workspace, setWorkspace] = useState(null)
  const [boards, setBoards] = useState([])
  const [activeBoardId, setActiveBoardId] = useState('')
  const [board, setBoard] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    v2Api.getCurrentWorkspace().then(setWorkspace).catch(() => {})
  }, [])

  useEffect(() => {
    if (!workspace) return
    v2Api.listBoards(workspace.id).then(setBoards).catch(() => {})
  }, [workspace, reloadTick])

  useEffect(() => {
    if (!activeBoardId) { setBoard(null); return }
    v2Api.getBoard(activeBoardId).then(setBoard).catch(() => {})
  }, [activeBoardId, reloadTick])

  const widgets = board?.widgets || []
  const handleDelete = async (widgetId) => {
    if (!activeBoardId) return
    try {
      await v2Api.deleteWidget(activeBoardId, widgetId)
      setReloadTick(t => t + 1)
    } catch (err) {
      console.warn('[BoardEditor] 删除 widget 失败:', err?.message || err)
    }
  }

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      padding: '10px 18px',
      background: 'oklch(0.78 0.16 65 / 0.10)',
      borderBottom: '1px solid var(--amber-deep)',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      fontSize: 13,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: 'var(--amber-deep)',
      }}>● 真实看板</span>
      {workspace ? (
        <>
          <span style={{ color: 'var(--ink-3)' }}>{workspace.name}</span>
          <select
            value={activeBoardId}
            onChange={e => { setActiveBoardId(e.target.value); setExpanded(true) }}
            style={{
              padding: '4px 8px', fontSize: 12,
              background: 'var(--paper)', border: '1px solid var(--line-1)',
              borderRadius: 6,
            }}
          >
            <option value="">选看板...（共 {boards.length}）</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
          {board && (
            <>
              <span style={{ color: 'var(--ink-2)' }}>
                {widgets.length} 个真实 widget
              </span>
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  border: '1px solid var(--line-1)', background: 'transparent',
                  padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                }}
              >{expanded ? '收起 ▴' : '展开 ▾'}</button>
            </>
          )}
        </>
      ) : (
        <span style={{ color: 'var(--ink-4)' }}>正在连接 v2 后端...</span>
      )}

      {expanded && board && (
        <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {widgets.length === 0 ? (
            <div style={{ color: 'var(--ink-4)', fontSize: 12, padding: '8px 0' }}>
              这个看板还没有真实 widget。回 canvas 点节点的"钉到看板"加一个。
            </div>
          ) : widgets.map(w => (
            <div key={w.widget_id} style={{
              padding: '8px 12px', background: 'var(--paper)',
              border: '1px solid var(--line-1)', borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' }}>
                ({w.grid_x},{w.grid_y}) {w.w}×{w.h}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {w.node_role === 'assistant' ? '🤖 ' : '👤 '}{(w.node_content || '(无内容)').slice(0, 80)}
              </span>
              {w.node_sql && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--amber-deep)', background: 'oklch(0.78 0.16 65 / 0.12)', padding: '1px 5px', borderRadius: 4 }}>SQL</span>}
              <button
                onClick={() => handleDelete(w.widget_id)}
                style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ink-4)', fontSize: 14 }}
                title="删除 widget"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function BoardEditor() {
  const [tab, setTab] = useS_BE('nodes');
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <RealBoardConnector />
        <P1Top_BE crumbs={['工作区','看板','Q3 渠道复盘 · 编辑']} badge="编辑中"/>
        <div className="be">
          {/* LHS — node library */}
          <div className="be-side">
            <div className="head">
              <div className="lbl">添加内容 · LIBRARY</div>
              <input placeholder="⌕ 搜你已有的节点 / 指标..." defaultValue=""/>
            </div>

            <div style={{display:'flex', gap:14, padding:'8px 18px 0', borderBottom:'1px solid var(--line-1)'}}>
              {[
                ['nodes','已有节点 12'],
                ['metric','指标 8'],
                ['text','文本'],
              ].map(([k, lbl]) => (
                <button key={k}
                  onClick={()=>setTab(k)}
                  style={{
                    border:0, background:'transparent', cursor:'pointer',
                    padding:'8px 0', marginBottom:-1,
                    fontFamily: tab===k ? 'var(--font-sans)' : 'var(--font-mono)',
                    fontSize: tab===k ? 13 : 11,
                    color: tab===k ? 'var(--ink-1)' : 'var(--ink-3)',
                    fontWeight: tab===k ? 500 : 400,
                    letterSpacing: tab===k ? 0 : '0.06em',
                    borderBottom: `2px solid ${tab===k ? 'var(--amber-deep)' : 'transparent'}`,
                  }}>{lbl}</button>
              ))}
            </div>

            <div className="group">最近创建</div>
            <div className="be-card-list">
              {[
                { ix:'#04', n:'抖音 vs 私域 · 阶段流失', m:'漏斗图 · 14:21' },
                { ix:'#03', n:'渠道 · 转化漏斗(主)', m:'漏斗图 · 14:08' },
                { ix:'#08', n:'华东漏斗 · 区域对比', m:'柱状图 · 13:56' },
                { ix:'#02', n:'月度新用户走势', m:'面积图 · 13:48' },
              ].map(c => (
                <div key={c.ix} className="be-srcard">
                  <span className="ix">{c.ix}</span>
                  <div className="body">
                    <div className="name">{c.n}</div>
                    <div className="meta">{c.m}</div>
                    <div className="thumb"/>
                  </div>
                </div>
              ))}
              <div className="group" style={{padding:'14px 4px 6px'}}>指标</div>
              {[
                { ix:'∑', n:'GMV', m:'已审核 v3' },
                { ix:'%', n:'D7 留存', m:'已审核 v2' },
                { ix:'#', n:'DAU', m:'已审核 v4' },
              ].map(c => (
                <div key={c.n} className="be-srcard">
                  <span className="ix" style={{color:'var(--amber-deep)', fontSize:14}}>{c.ix}</span>
                  <div className="body">
                    <div className="name">{c.n}</div>
                    <div className="meta">{c.m}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MIDDLE — canvas */}
          <div className="be-canvas">
            <div className="be-toolbar">
              <h2>Q3 渠道复盘</h2>
              <span className="meta">· 12 个节点 · 自动保存于 14:48</span>
              <span className="spacer"/>
              <div className="avs">
                <div className="av">李</div>
                <div className="av b">陈</div>
                <div className="av c">周</div>
              </div>
              <div className="zoom">
                <button>−</button>
                <span className="v">80%</span>
                <button>+</button>
              </div>
              <button className="btn-ghost">预览</button>
              <button className="btn-primary">分享 · 5 人</button>
            </div>

            <div className="be-stage">
              <div className="be-page">
                <div className="page-head">
                  <div>
                    <h3>Q3 渠道复盘</h3>
                    <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)', marginTop:4}}>
                      李文 · 7 月 1 日 - 9 月 30 日 · 每周一刷新
                    </div>
                  </div>
                  <div className="meta">v4 · 草稿</div>
                </div>

                <div className="be-grid">
                  {/* KPI row */}
                  <div className="be-tile" style={{gridColumn:'span 3'}}>
                    <span className="lbl">GMV · Q3</span>
                    <span className="val">¥ 12.4M <span className="up">+8.2%</span></span>
                  </div>
                  <div className="be-tile" style={{gridColumn:'span 3'}}>
                    <span className="lbl">新增用户</span>
                    <span className="val">142k <span className="up">+12%</span></span>
                  </div>
                  <div className="be-tile" style={{gridColumn:'span 3'}}>
                    <span className="lbl">D7 留存</span>
                    <span className="val">42.1% <span className="dn">−2.4pt</span></span>
                  </div>
                  <div className="be-tile" style={{gridColumn:'span 3'}}>
                    <span className="lbl">订单数</span>
                    <span className="val">38.4k <span className="up">+6%</span></span>
                  </div>

                  {/* Big chart */}
                  <div className="be-tile selected" style={{gridColumn:'span 8', gridRow:'span 3'}}>
                    <span className="move">拖动 · 节点 #04</span>
                    <span className="lbl">漏斗图 · 节点 #04</span>
                    <span className="ttl">抖音 vs 私域 · 阶段流失对比</span>
                    <div className="body"/>
                    <div className="handle"/>
                  </div>
                  <div className="be-tile" style={{gridColumn:'span 4', gridRow:'span 2'}}>
                    <span className="lbl">柱状图 · 节点 #08</span>
                    <span className="ttl">华东漏斗</span>
                    <div className="body"/>
                  </div>
                  <div className="be-tile text" style={{gridColumn:'span 4'}}>
                    <span className="lbl">说明</span>
                    本节用 Q3 漏斗对照 7 月活动期前后,重点关注私域第二阶段。
                  </div>

                  {/* Drop hint */}
                  <div className="be-drop-hint" style={{gridColumn:'span 6', gridRow:'span 2'}}>
                    将节点拖到这里 ＋
                  </div>
                  <div className="be-tile" style={{gridColumn:'span 6', gridRow:'span 2'}}>
                    <span className="lbl">面积图 · 节点 #02</span>
                    <span className="ttl">月度新用户走势</span>
                    <div className="body"/>
                  </div>
                </div>
              </div>
            </div>

            <div className="be-status">
              <span>1100 × 720 · A4 横版</span>
              <span>·</span>
              <span>12 节点 · 6 文本 · 1 PDF 导出已准备</span>
              <span className="spacer"/>
              <span>↑ 14:48 自动保存</span>
              <span>·</span>
              <span>v4 草稿</span>
            </div>
          </div>

          {/* RHS — inspector */}
          <div className="be-inspector">
            <div className="head">已选 · NODE #04</div>
            <h3>抖音 vs 私域 · 阶段流失对比</h3>

            <div className="lbl-block">布局</div>
            <div className="row">
              <span className="k">尺寸</span>
              <span className="segs">
                <button>1/4</button>
                <button>1/2</button>
                <button className="on">2/3</button>
                <button>满</button>
              </span>
            </div>
            <div className="row">
              <span className="k">高度</span>
              <span className="v">3 行 · 360px</span>
            </div>

            <hr/>

            <div className="lbl-block">数据</div>
            <div className="row">
              <span className="k">指标</span>
              <select defaultValue="gmv"><option>conversion_rate</option></select>
            </div>
            <div className="row">
              <span className="k">渠道</span>
              <select><option>tiktok, private, xiaohongshu</option></select>
            </div>
            <div className="row">
              <span className="k">时间</span>
              <select><option>Q3 · 7-9 月</option></select>
            </div>
            <div className="row">
              <span className="k">分组</span>
              <select><option>by stage</option></select>
            </div>

            <hr/>

            <div className="lbl-block">外观</div>
            <div className="row">
              <span className="k">图表类型</span>
              <span className="segs">
                <button>柱</button>
                <button className="on">漏斗</button>
                <button>面积</button>
              </span>
            </div>
            <div className="row">
              <span className="k">配色</span>
              <span className="segs">
                <button className="on">暖色</button>
                <button>冷色</button>
                <button>语义</button>
              </span>
            </div>
            <div className="row">
              <span className="k">显示标签</span>
              <span className="segs">
                <button className="on">是</button>
                <button>否</button>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   2. Board templates library
   ========================================================= */

const TEMPLATES = [
  {
    id:'sales-q', tag:'销售',     title:'季度销售复盘',
    desc:'GMV / 管线 / 漏斗 / 区域四联看板,适合季度回顾会。',
    meta:['9 张图','2 个指标','双语 PDF'],
    author:'@DataPulse 官方',
    cover:'sales',
  },
  {
    id:'retention', tag:'增长',   title:'用户留存深挖',
    desc:'D1/D7/D30 + cohort 拆分 + 实验对照,3 步定位留存掉头位置。',
    meta:['11 张图','3 段 SQL'],
    author:'@DataPulse 官方',
    cover:'retention',
  },
  {
    id:'channel',   tag:'营销',   title:'渠道 ROI 周报',
    desc:'分渠道 GMV / 成本 / ROI 对照,自动按周环比并标注异常。',
    meta:['7 张图','含订阅'],
    author:'@周晴 · 增长',
    cover:'channel',
  },
  {
    id:'finance',   tag:'财务',   title:'月度财务摘要',
    desc:'营收 / 净收入 / 退款 / 应收账款汇总,符合财务月结口径。',
    meta:['12 张图','含审核流'],
    author:'@DataPulse 官方',
    cover:'finance',
  },
  {
    id:'product',   tag:'产品',   title:'功能上线 60 天',
    desc:'适合上线后的功能复盘:DAU 渗透 / 留存对比 / 实验显著性。',
    meta:['8 张图','A/B 内置'],
    author:'@刘佳 · 产品',
    cover:'product',
  },
  {
    id:'exec',      tag:'高管',   title:'高管周一晨会',
    desc:'一图看 6 个北极星指标,工作日 09:00 自动推送到 IM。',
    meta:['1 张图','含订阅'],
    author:'@李文 · 数据',
    cover:'exec',
  },
];

function TplCover({ kind }) {
  if (kind === 'sales') return (
    <>
      <div className="t">
        <div className="l">GMV · Q3</div>
        <div className="v">¥ 12.4M</div>
      </div>
      <div className="t">
        <div className="l">管线</div>
        <div className="bars">
          <span style={{height:'40%'}}/><span style={{height:'70%'}}/>
          <span style={{height:'55%'}}/><span style={{height:'88%'}}/>
        </div>
      </div>
      <div className="t">
        <div className="l">漏斗</div>
        <div className="v amber">31%</div>
      </div>
      <div className="t">
        <div className="l">区域</div>
        <div className="bars">
          <span style={{height:'82%'}}/><span style={{height:'56%'}}/>
          <span style={{height:'40%'}}/>
        </div>
      </div>
    </>
  );
  if (kind === 'retention') return (
    <>
      <div className="t"><div className="l">D7</div><div className="v">42.1%</div></div>
      <div className="t"><div className="l">D30</div><div className="v amber">18.4%</div></div>
      <div className="t" style={{gridColumn:'span 2'}}>
        <div className="l">COHORT TREND</div>
        <div className="spark"/>
      </div>
    </>
  );
  if (kind === 'channel') return (
    <>
      <div className="t" style={{gridColumn:'span 2'}}>
        <div className="l">渠道 ROI</div>
        <div className="bars">
          <span style={{height:'60%'}}/><span style={{height:'88%'}}/>
          <span style={{height:'45%'}}/><span style={{height:'72%'}}/>
          <span style={{height:'38%'}}/>
        </div>
      </div>
      <div className="t"><div className="l">最佳</div><div className="v green">2.4x</div></div>
      <div className="t"><div className="l">最差</div><div className="v" style={{color:'var(--terracotta)'}}>0.6x</div></div>
    </>
  );
  if (kind === 'finance') return (
    <>
      <div className="t"><div className="l">营收</div><div className="v">¥ 38M</div></div>
      <div className="t"><div className="l">净收入</div><div className="v amber">¥ 9.2M</div></div>
      <div className="t"><div className="l">退款</div><div className="v" style={{color:'var(--terracotta)'}}>2.1%</div></div>
      <div className="t"><div className="l">应收</div><div className="v">¥ 4.1M</div></div>
    </>
  );
  if (kind === 'product') return (
    <>
      <div className="t" style={{gridColumn:'span 2'}}>
        <div className="l">渗透曲线</div>
        <div className="spark"/>
      </div>
      <div className="t"><div className="l">A 组</div><div className="v green">+1.2pt</div></div>
      <div className="t"><div className="l">B 组</div><div className="v" style={{color:'var(--terracotta)'}}>−2.4pt</div></div>
    </>
  );
  return (
    <>
      <div className="t" style={{gridColumn:'span 2', gridRow:'span 2'}}>
        <div className="l">北极星 · WoW</div>
        <div className="v amber" style={{fontSize:28}}>+8.2%</div>
        <div className="spark"/>
      </div>
    </>
  );
}

export function BoardTemplates() {
  const [filter, setFilter] = useS_BE('all');
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <P1Top_BE crumbs={['工作区','+ 新建看板']} badge="选择模板"/>
        <div className="bt-stage">
          <div className="bt-head">
            <div>
              <span className="p0-eyebrow">看板模板 · TEMPLATES</span>
              <h1>挑一个<em>开局</em>,<br/>剩下的 AI 帮你填。</h1>
              <p className="lead">每个模板都套了一个"问 AI 即可生效"的结构:你的数据接进来后,它会自动用你的指标和角色重新填一遍。</p>
            </div>
            <div>
              <button className="btn-ghost">从 0 开始 · 空白看板</button>
            </div>
          </div>

          <div className="bt-filters">
            {[
              ['all','全部 · 24'],
              ['sales','销售'],
              ['growth','增长'],
              ['product','产品'],
              ['finance','财务'],
              ['exec','高管'],
              ['mine','我的团队 · 7'],
            ].map(([k,lbl]) => (
              <button key={k} className={filter===k?'on':''} onClick={()=>setFilter(k)}>{lbl}</button>
            ))}
          </div>

          <div className="bt-grid">
            {TEMPLATES.map(t => (
              <div key={t.id} className="bt-card">
                <div className="cover">
                  <span className="badge">{t.tag}</span>
                  <TplCover kind={t.cover}/>
                </div>
                <div className="body">
                  <h3>{t.title}</h3>
                  <div className="desc">{t.desc}</div>
                  <div className="meta">
                    {t.meta.map(m => <span key={m}>· {m}</span>)}
                  </div>
                </div>
                <div className="foot">
                  <span className="au">{t.author}</span>
                  <span className="spacer"/>
                  <button>用这个 →</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   3. Board schedule — refresh / snapshot
   ========================================================= */

export function BoardSchedule() {
  const [freq, setFreq] = useS_BE('weekly');
  return (
    <div className="p0-frame">
      <div className="ai-scene">
        <P1Top_BE crumbs={['工作区','Q3 渠道复盘','定时与快照']} badge="刷新设置"/>
        <div className="bs">
          <div className="bs-main">
            <div className="bs-head">
              <span className="p0-eyebrow">定时刷新 · SCHEDULE</span>
              <h1>什么时候<br/>把数据拉一遍?</h1>
              <div className="sub">这台看板会按计划重跑全部 SQL,把节点更新到最新一刻,然后推给订阅人。</div>
            </div>

            <div className="bs-cal">
              <div className="cal-head">
                <h3>2026 年 9 月</h3>
                <div className="nav">
                  <button>← 上月</button>
                  <button>今天</button>
                  <button>下月 →</button>
                </div>
              </div>
              <div className="bs-grid">
                {['一','二','三','四','五','六','日'].map(d => <div key={d} className="dow">周{d}</div>)}
                {[
                  {n:31, mute:true}, {n:1, ev:'每周一 09:00'}, {n:2}, {n:3, ev:'手动 14:08'}, {n:4}, {n:5, mute:true}, {n:6, mute:true},
                  {n:7, ev:'每周一 09:00'}, {n:8}, {n:9}, {n:10, ev:'快照 · 月初'}, {n:11}, {n:12, mute:true}, {n:13, mute:true},
                  {n:14, ev:'每周一 09:00'}, {n:15}, {n:16, evW:'告警 · GMV −5%'}, {n:17}, {n:18}, {n:19, mute:true}, {n:20, mute:true},
                  {n:21, ev:'每周一 09:00'}, {n:22}, {n:23}, {n:24}, {n:25}, {n:26, mute:true}, {n:27, mute:true},
                  {n:28, ev:'每周一 09:00'}, {n:29}, {n:30, today:true, ev:'今天 · 14:48'}, {n:1, mute:true, evG:'下个快照'}, {n:2, mute:true}, {n:3, mute:true}, {n:4, mute:true},
                ].map((d, i) => (
                  <div key={i} className={`day ${d.mute?'mute':''} ${d.today?'today':''}`}>
                    <span className="n">{d.n}</span>
                    {d.ev   && <span className="ev amber">{d.ev}</span>}
                    {d.evW  && <span className="ev terra">{d.evW}</span>}
                    {d.evG  && <span className="ev green">{d.evG}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="bs-list">
              <div className="lhead">
                <span>当前的计划任务</span>
                <span className="right">3 项 · 全部启用</span>
              </div>
              <div className="bs-row">
                <span className="swatch amber"/>
                <span className="name">
                  自动刷新 · 这个看板
                  <div className="sub">触发后:重跑 12 个 SQL · 推 5 个订阅</div>
                </span>
                <span className="freq">每周一 09:00</span>
                <span className="ch">邮件 · 飞书</span>
                <span className="last">上次 9-29 09:00</span>
                <span className="more">⋯</span>
              </div>
              <div className="bs-row">
                <span className="swatch green"/>
                <span className="name">
                  月度快照 · 留底版本
                  <div className="sub">每月 1 日存档不可修改,导出 PDF 入云盘</div>
                </span>
                <span className="freq">每月 1 日 06:00</span>
                <span className="ch">归档</span>
                <span className="last">上次 9-1 06:00</span>
                <span className="more">⋯</span>
              </div>
              <div className="bs-row">
                <span className="swatch terra"/>
                <span className="name">
                  异常守望 · GMV 周环比
                  <div className="sub">当 −5% 时,自动重跑并通知 @数据团队</div>
                </span>
                <span className="freq">实时</span>
                <span className="ch">企业微信</span>
                <span className="last">触发于 9-16</span>
                <span className="more">⋯</span>
              </div>
            </div>
          </div>

          <div className="bs-side">
            <span className="lbl">+ 新建计划</span>
            <h3>每周一自动跑一遍</h3>

            <div className="field">
              <span className="k">频率</span>
              <div className="seg">
                <button className={freq==='daily'?'on':''}   onClick={()=>setFreq('daily')}>每天</button>
                <button className={freq==='weekly'?'on':''}  onClick={()=>setFreq('weekly')}>每周</button>
                <button className={freq==='monthly'?'on':''} onClick={()=>setFreq('monthly')}>每月</button>
                <button className={freq==='cron'?'on':''}    onClick={()=>setFreq('cron')}>Cron</button>
              </div>
            </div>

            <div className="field">
              <span className="k">星期</span>
              <select defaultValue="mon">
                <option value="mon">周一</option>
              </select>
            </div>
            <div className="field">
              <span className="k">时间</span>
              <input defaultValue="09:00"/>
            </div>
            <div className="field">
              <span className="k">时区</span>
              <select><option>Asia/Shanghai · UTC+8</option></select>
            </div>

            <span className="lbl" style={{marginTop:18}}>通知到</span>
            <div className="ch-list">
              <div className="row on">
                <span className="cb"/>
                <span className="n">邮件</span>
                <span className="sub">→ @高管周报 5 人</span>
              </div>
              <div className="row on">
                <span className="cb"/>
                <span className="n">飞书机器人</span>
                <span className="sub">→ #q3-channel</span>
              </div>
              <div className="row">
                <span className="cb"/>
                <span className="n">企业微信</span>
                <span className="sub">→ 未配置</span>
              </div>
              <div className="row">
                <span className="cb"/>
                <span className="n">Webhook</span>
                <span className="sub">→ +</span>
              </div>
            </div>

            <div className="actions">
              <button className="pri">保存计划</button>
              <button className="alt">先跑一次预览</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
