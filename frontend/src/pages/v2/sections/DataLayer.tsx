// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/DataLayer.jsx
// 真实数据接入：3 个画板分别接 datasource_tables_meta / column_meta+tags / metrics+synonyms+lineage
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { v2Api } from '../../../api'

const { useState: useS_DL } = React;

/* ---------- Live data bars (阶段 8 语义层 / 指标中心) ---------- */

function DataSourcesLiveBar() {
  const [dsId, setDsId] = useState('demo-ds')
  const [schema, setSchema] = useState('public')
  const [tables, setTables] = useState([])
  const [name, setName] = useState('')
  const [rowCount, setRowCount] = useState(0)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    try { setTables(await v2Api.listSemanticTables(dsId, schema)) } catch {}
  }
  useEffect(() => { reload() }, [dsId, schema])

  const upsert = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await v2Api.upsertSemanticTable({ ds_id: dsId, schema_name: schema, table_name: name.trim(), row_count_estimate: rowCount })
      setName(''); reload()
    } finally { setBusy(false) }
  }

  return (
    <LiveBarDL title="数据源 (datasource_tables_meta) · 真实数据">
      <InlineDL label="ds_id">
        <input value={dsId} onChange={e => setDsId(e.target.value)} style={{ width: 100 }} />
      </InlineDL>
      <InlineDL label="schema">
        <input value={schema} onChange={e => setSchema(e.target.value)} style={{ width: 80 }} />
      </InlineDL>
      <InlineDL label="表名">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="如 orders" style={{ width: 130 }} />
      </InlineDL>
      <InlineDL label="行数">
        <input type="number" value={rowCount} onChange={e => setRowCount(parseInt(e.target.value || '0'))} style={{ width: 80 }} />
      </InlineDL>
      <button disabled={busy || !name.trim()} onClick={upsert} style={btnPriDL}>＋ Upsert</button>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>共 {tables.length} 张表</span>
      {tables.length > 0 && (
        <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tables.map(t => (
            <div key={`${t.schema_name}.${t.table_name}`} style={liveRowDL}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{t.schema_name}.{t.table_name}</span>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--ink-3)' }}>{t.comment || '—'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' }}>{t.row_count_estimate?.toLocaleString()} 行</span>
            </div>
          ))}
        </div>
      )}
    </LiveBarDL>
  )
}

function SchemaSemanticLiveBar() {
  const [dsId, setDsId] = useState('demo-ds')
  const [schema, setSchema] = useState('public')
  const [table, setTable] = useState('orders')
  const [columns, setColumns] = useState([])
  const [activeColId, setActiveColId] = useState(null)
  const [tags, setTags] = useState([])
  const [newTag, setNewTag] = useState('')
  const [colName, setColName] = useState('')
  const [colType, setColType] = useState('VARCHAR')

  const reloadCols = async () => {
    try { setColumns(await v2Api.listSemanticColumns(dsId, schema, table)) } catch {}
  }
  const reloadTags = async (cid) => {
    if (!cid) return
    try { setTags(await v2Api.listColumnTags(cid)) } catch {}
  }

  useEffect(() => { reloadCols() }, [dsId, schema, table])
  useEffect(() => { reloadTags(activeColId) }, [activeColId])

  const addCol = async () => {
    if (!colName.trim()) return
    await v2Api.upsertSemanticColumn({ ds_id: dsId, schema_name: schema, table_name: table, column_name: colName.trim(), dtype: colType })
    setColName(''); reloadCols()
  }
  const addTag = async () => {
    if (!activeColId || !newTag.trim()) return
    await v2Api.addColumnTag(activeColId, { tag_name: newTag.trim() })
    setNewTag(''); reloadTags(activeColId)
  }
  const delTag = async (tag) => {
    if (!activeColId) return
    await v2Api.deleteColumnTag(activeColId, tag)
    reloadTags(activeColId)
  }

  return (
    <LiveBarDL title="字段语义打标 (column_meta + tags) · 真实数据">
      <InlineDL label="表">
        <input value={dsId} onChange={e => setDsId(e.target.value)} style={{ width: 80 }} />
        .<input value={schema} onChange={e => setSchema(e.target.value)} style={{ width: 70 }} />
        .<input value={table} onChange={e => setTable(e.target.value)} style={{ width: 100 }} />
      </InlineDL>
      <InlineDL label="新字段">
        <input value={colName} onChange={e => setColName(e.target.value)} placeholder="字段名" style={{ width: 100 }} />
        <input value={colType} onChange={e => setColType(e.target.value)} placeholder="dtype" style={{ width: 90 }} />
      </InlineDL>
      <button onClick={addCol} disabled={!colName.trim()} style={btnPriDL}>＋ Upsert 字段</button>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{columns.length} 个字段</span>

      <div style={{ width: '100%', marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>字段列表 (点击打标)</div>
          {columns.map(c => (
            <div key={c.id}
              onClick={() => setActiveColId(c.id)}
              style={{ ...liveRowDL, cursor: 'pointer', borderColor: c.id === activeColId ? 'var(--amber-deep)' : 'var(--line-1)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}><b>{c.column_name}</b></span>
              <span style={{ fontSize: 10, color: 'var(--ink-3)', flex: 1 }}>{c.dtype}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>
            {activeColId ? '该字段的语义标签' : '← 选一个字段'}
          </div>
          {activeColId && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {tags.length === 0 && <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>无标签</span>}
                {tags.map(t => (
                  <span key={t.tag_name} style={{ padding: '2px 8px', background: 'oklch(0.78 0.16 65 / 0.15)', borderRadius: 999, fontSize: 11, color: 'var(--amber-deep)' }}>
                    {t.tag_name} <span style={{ color: 'var(--ink-3)' }}>·{t.confidence}%</span>
                    <button onClick={() => delTag(t.tag_name)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ink-4)', marginLeft: 2 }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="标签名 (如 金额)" style={{ flex: 1, padding: '4px 6px', fontSize: 11 }} />
                <button onClick={addTag} disabled={!newTag.trim()} style={btnPriDL}>+ tag</button>
              </div>
            </>
          )}
        </div>
      </div>
    </LiveBarDL>
  )
}

function MetricCenterLiveBar() {
  const [workspace, setWorkspace] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(null)
  const [name, setName] = useState('')
  const [expr, setExpr] = useState('')
  const [synFor, setSynFor] = useState(null)         // metric_id
  const [synList, setSynList] = useState([])
  const [synText, setSynText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { v2Api.getCurrentWorkspace().then(setWorkspace).catch(() => {}) }, [])
  const reload = async () => {
    if (!workspace) return
    try { setMetrics(await v2Api.listMetrics(workspace.id)) } catch {}
  }
  useEffect(() => { reload() }, [workspace])
  useEffect(() => {
    if (!synFor) return
    v2Api.listMetricSynonyms(synFor).then(setSynList).catch(() => {})
  }, [synFor])

  const create = async () => {
    if (!workspace || !name.trim() || !expr.trim()) return
    setBusy(true)
    try {
      await v2Api.createMetric({ workspace_id: workspace.id, name: name.trim(), expression: expr.trim() })
      setName(''); setExpr(''); reload()
    } finally { setBusy(false) }
  }
  const search = async () => {
    if (!workspace || !query.trim()) { setSearched(null); return }
    const r = await v2Api.searchMetrics(workspace.id, query.trim())
    setSearched(r)
  }
  const addSyn = async () => {
    if (!synFor || !synText.trim()) return
    await v2Api.addMetricSynonym(synFor, { synonym_text: synText.trim() })
    setSynText('')
    setSynList(await v2Api.listMetricSynonyms(synFor))
  }
  const delSyn = async (text) => {
    if (!synFor) return
    await v2Api.deleteMetricSynonym(synFor, text)
    setSynList(await v2Api.listMetricSynonyms(synFor))
  }
  const del = async (mid) => {
    if (!confirm('删指标？同义词 + 血缘一并删除。')) return
    await v2Api.deleteMetric(mid)
    if (synFor === mid) { setSynFor(null); setSynList([]) }
    reload()
  }

  return (
    <LiveBarDL title="指标中心 (metrics + synonyms + lineage) · 真实数据">
      <InlineDL label="名称">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="如 周营收" style={{ width: 120 }} />
      </InlineDL>
      <InlineDL label="表达式">
        <input value={expr} onChange={e => setExpr(e.target.value)} placeholder="SUM(gmv) BY ..." style={{ width: 220 }} />
      </InlineDL>
      <button disabled={busy || !name.trim() || !expr.trim()} onClick={create} style={btnPriDL}>＋ 创建</button>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>共 {metrics.length} 个</span>

      {/* 搜索 */}
      <div style={{ display: 'flex', gap: 4 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜名称/同义词/口径" style={{ width: 160, padding: '4px 8px', fontSize: 11 }} />
        <button onClick={search} style={btnGhostDL}>search</button>
      </div>
      {searched !== null && <span style={{ fontSize: 11, color: 'var(--amber-deep)' }}>搜到 {searched.length} 条</span>}

      <div style={{ width: '100%', marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>指标列表</div>
          {(searched || metrics).map(m => (
            <div key={m.id} style={{ ...liveRowDL, borderColor: m.id === synFor ? 'var(--amber-deep)' : 'var(--line-1)' }}>
              <span style={{ fontSize: 12, flex: 1, cursor: 'pointer' }} onClick={() => setSynFor(m.id)}>
                <b>{m.name}</b>
                <span style={{ color: 'var(--ink-3)', marginLeft: 4 }}>{m.unit || ''}</span>
              </span>
              {m.synonyms_count !== undefined && <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>syn:{m.synonyms_count}</span>}
              <button onClick={() => del(m.id)} style={{ ...btnGhostDL, color: 'var(--ink-4)' }}>✕</button>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>
            {synFor ? '该指标的同义词' : '← 选一个指标'}
          </div>
          {synFor && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {synList.length === 0 && <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>无同义词</span>}
                {synList.map(s => (
                  <span key={s.synonym_text} style={{ padding: '2px 8px', background: 'oklch(0.62 0.13 145 / 0.15)', borderRadius: 999, fontSize: 11, color: 'var(--success)' }}>
                    {s.synonym_text}
                    <button onClick={() => delSyn(s.synonym_text)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ink-4)', marginLeft: 2 }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={synText} onChange={e => setSynText(e.target.value)} placeholder="同义词文本" style={{ flex: 1, padding: '4px 6px', fontSize: 11 }} />
                <button onClick={addSyn} disabled={!synText.trim()} style={btnPriDL}>+ syn</button>
              </div>
            </>
          )}
        </div>
      </div>
    </LiveBarDL>
  )
}

const liveRowDL = { padding: '6px 10px', background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }
const btnPriDL = { padding: '5px 10px', background: 'var(--amber-deep)', color: 'var(--paper)', border: 0, borderRadius: 6, fontSize: 11, cursor: 'pointer' }
const btnGhostDL = { padding: '4px 8px', background: 'transparent', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 10, cursor: 'pointer' }

function LiveBarDL({ title, children }) {
  return (
    <div style={{ padding: '12px 18px', background: 'oklch(0.78 0.16 65 / 0.10)', borderBottom: '1px solid var(--amber-deep)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--amber-deep)' }}>● {title}</span>
        {children}
      </div>
    </div>
  )
}

function InlineDL({ label, children }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>{label}: {children}</label>
}

/* ---------- Original demo (静态预览保留) ---------- */

export function DataSources() {
  return (
    <div className="p0-frame">
      <DataSourcesLiveBar />
      <div className="dl">
        <div className="dl-side">
          <div className="brand"><span className="dot"/>DataPulse</div>
          <div className="group">设置 · SETUP</div>
          <a className="on"><span className="ix">▸</span>数据源</a>
          <a><span className="ix">·</span>语义层</a>
          <a><span className="ix">·</span>指标中心</a>
          <a><span className="ix">·</span>权限与脱敏</a>
          <div className="group">协作 · TEAM</div>
          <a><span className="ix">·</span>成员</a>
          <a><span className="ix">·</span>工作区</a>
          <a><span className="ix">·</span>审计日志</a>
          <div className="group">系统 · SYSTEM</div>
          <a><span className="ix">·</span>模型与算力</a>
          <a><span className="ix">·</span>API Key</a>
        </div>

        <div className="dl-main">
          <div className="dl-head">
            <div>
              <span className="p0-eyebrow">设置 / 数据源</span>
              <h1 className="p0-h1">数据源</h1>
            </div>
            <div className="right">
              <div className="dl-search">
                <span style={{color:'var(--ink-4)'}}>⌕</span>
                <span>按名称、库、负责人搜索...</span>
              </div>
              <button className="btn-ghost">导入配置</button>
              <button className="btn-primary">+ 连接新源</button>
            </div>
          </div>

          <div className="dl-stat">
            <div className="cell">
              <div className="label">连接数</div>
              <div className="val"><em>7</em></div>
              <div className="delta">+2 本周</div>
            </div>
            <div className="cell">
              <div className="label">表 · TABLES</div>
              <div className="val">428</div>
              <div className="delta" style={{color:'var(--ink-4)'}}>语义已标 312</div>
            </div>
            <div className="cell">
              <div className="label">指标 · METRICS</div>
              <div className="val">68</div>
              <div className="delta">14 个待审</div>
            </div>
            <div className="cell">
              <div className="label">本月查询</div>
              <div className="val">12.4k</div>
              <div className="delta">+18% MoM</div>
            </div>
          </div>

          <div className="dl-table">
            <table>
              <thead>
                <tr>
                  <th>数据源</th>
                  <th>类型 · 地区</th>
                  <th>状态</th>
                  <th>表 / 视图</th>
                  <th>负责人</th>
                  <th>最近同步</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[
                  { glyph:'My', name:'orders_db',     type:'MySQL · ap-shanghai',     status:'ok',   tables:'218 表 · 12 视图', owner:'李文 · 数据', sync:'刚刚' },
                  { glyph:'SF', name:'analytics_dw',  type:'Snowflake · ap-east',     status:'ok',   tables:'64 表',           owner:'陈昊 · 数据', sync:'5 分钟前' },
                  { glyph:'PG', name:'crm_replica',   type:'PostgreSQL · ap-shanghai',status:'ok',   tables:'92 表 · 8 视图',  owner:'王萌 · 销售', sync:'12 分钟前' },
                  { glyph:'CH', name:'events_olap',   type:'ClickHouse · ap-east',    status:'warn', tables:'18 表',           owner:'李文 · 数据', sync:'3 小时前 · 延迟' },
                  { glyph:'.x', name:'marketing.xlsx',type:'Excel · 文件',            status:'warn', tables:'4 sheet',         owner:'周晴 · 运营', sync:'昨天 · 需刷新' },
                  { glyph:'BQ', name:'ad_bigquery',   type:'BigQuery · us-central',   status:'ok',   tables:'21 表',           owner:'周晴 · 运营', sync:'30 分钟前' },
                  { glyph:'{ }',name:'feishu_api',    type:'REST · webhook',          status:'err',  tables:'认证失败',         owner:'李文 · 数据', sync:'2 天前' },
                ].map(r => (
                  <tr key={r.name}>
                    <td>
                      <div className="src-icon">
                        <div className="badge">{r.glyph}</div>
                        <div>
                          <div style={{fontWeight:500}}>{r.name}</div>
                          <div className="meta">id · ds_{r.name.slice(0,6)}</div>
                        </div>
                      </div>
                    </td>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>{r.type}</span></td>
                    <td>
                      <span className={`status-dot ${r.status==='warn'?'warn':r.status==='err'?'err':''}`}>
                        <span className="d"/>{r.status==='ok'?'正常':r.status==='warn'?'延迟':'断开'}
                      </span>
                    </td>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11}}>{r.tables}</span></td>
                    <td>{r.owner}</td>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>{r.sync}</span></td>
                    <td>
                      <div className="row-actions">
                        <a>浏览 ›</a>
                        <a>设置</a>
                        <a>⋯</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- Schema / semantic ---------- */

export function SchemaSemantic() {
  const [tab, setTab] = useS_DL('fields');
  return (
    <div className="p0-frame">
      <SchemaSemanticLiveBar />
      <div className="sch">
        <div className="tree">
          <div className="head">
            <div className="name">analytics_dw</div>
            <span className="badge">Snowflake</span>
          </div>
          <div className="item section">SCHEMAS</div>
          <div className="item">▾ public</div>
          <div className="item tbl open" style={{paddingLeft:30}}>orders</div>
          <div className="item" style={{paddingLeft:50, color:'var(--ink-4)', fontFamily:'var(--font-mono)', fontSize:11}}>· users (52 行/列)</div>
          <div className="item on" style={{paddingLeft:50, fontFamily:'var(--font-mono)', fontSize:12}}>· orders <span className="count">28 字段</span></div>
          <div className="item" style={{paddingLeft:50, color:'var(--ink-3)', fontFamily:'var(--font-mono)', fontSize:11}}>· order_items</div>
          <div className="item" style={{paddingLeft:50, color:'var(--ink-3)', fontFamily:'var(--font-mono)', fontSize:11}}>· payments</div>
          <div className="item tbl" style={{paddingLeft:30}}>events</div>
          <div className="item tbl" style={{paddingLeft:30}}>cohorts</div>
          <div className="item tbl" style={{paddingLeft:30}}>ad_spend</div>
          <div className="item">▸ analytics</div>
          <div className="item">▸ staging</div>
          <div className="item section">视图 · VIEWS</div>
          <div className="item" style={{paddingLeft:30}}>v_daily_revenue</div>
          <div className="item" style={{paddingLeft:30}}>v_user_cohort</div>
        </div>

        <div className="sch-table">
          <div className="head-row">
            <div>
              <div className="sub">analytics_dw · public · 表</div>
              <h2>orders</h2>
              <div className="sub" style={{marginTop:8}}>28 字段 · 2.4M 行 · 上次更新 5 分钟前</div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn-ghost">查看血缘</button>
              <button className="btn-primary">⟳ 重跑探针</button>
            </div>
          </div>

          <div className="sch-tabs">
            <button className={tab==='fields'?'on':''} onClick={()=>setTab('fields')}>字段</button>
            <button className={tab==='sample'?'on':''} onClick={()=>setTab('sample')}>样本数据</button>
            <button className={tab==='rels'?'on':''} onClick={()=>setTab('rels')}>关系</button>
            <button className={tab==='perm'?'on':''} onClick={()=>setTab('perm')}>权限</button>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'30px 200px 100px 90px 1fr 110px', gap:14,
            padding:'0 14px 8px', fontFamily:'var(--font-mono)', fontSize:10,
            letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--ink-4)'}}>
            <div></div>
            <div>列名</div>
            <div>类型</div>
            <div>语义</div>
            <div>同义词 · 业务术语</div>
            <div style={{textAlign:'right'}}>覆盖 · null</div>
          </div>

          {[
            { key:'PK', col:'order_id',   alias:'订单号',      type:'STRING',  tag:'id',  taglabel:'标识', syn:['订单 id','单号','order #'], cov:'100%', nl:0 },
            { key:'',   col:'user_id',    alias:'用户 ID',     type:'STRING',  tag:'id',  taglabel:'标识', syn:['用户','客户 id','买家'], cov:'100%', nl:0 },
            { key:'',   col:'channel',    alias:'获客渠道',     type:'STRING',  tag:'dim', taglabel:'维度', syn:['渠道','来源','source','投放渠道'], cov:'98.4%', nl:'1.6%' },
            { key:'',   col:'region',     alias:'区域',         type:'STRING',  tag:'dim', taglabel:'维度', syn:['大区','省份','地区','华东 / 华南'], cov:'100%', nl:0 },
            { key:'',   col:'gmv',        alias:'GMV(成交金额)', type:'DECIMAL', tag:'met', taglabel:'度量', syn:['销售额','营收','成交','revenue'], cov:'100%', nl:0, on:true },
            { key:'',   col:'cost',       alias:'订单成本',     type:'DECIMAL', tag:'met', taglabel:'度量', syn:['成本','cost'], cov:'94.2%', nl:'5.8%' },
            { key:'',   col:'created_at', alias:'下单时间',     type:'DATETIME',tag:'dim', taglabel:'时间维度', syn:['日期','时间','下单时间'], cov:'100%', nl:0 },
            { key:'',   col:'status',     alias:'订单状态',     type:'STRING',  tag:'dim', taglabel:'维度', syn:['状态','是否完成'], cov:'100%', nl:0 },
          ].map(f => (
            <div key={f.col} className={`sch-field ${f.on?'on':''}`}>
              <div className="key">{f.key}</div>
              <div className="col">{f.col}<em>{f.alias}</em></div>
              <div className="type">{f.type}</div>
              <div className={`sch-tag ${f.tag}`}>{f.taglabel}</div>
              <div className="sch-syn">{f.syn.slice(0, 3).map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{color:'var(--ink-5)'}}> · </span>}
                  <b>{s}</b>
                </React.Fragment>
              ))} {f.syn.length > 3 && <span style={{color:'var(--ink-4)'}}> +{f.syn.length - 3}</span>}</div>
              <div className="sch-stat">{f.cov}{f.nl ? ` · null ${f.nl}` : ''}</div>
            </div>
          ))}
        </div>

        <div className="sch-detail">
          <div className="key">orders.gmv</div>
          <h3>GMV(成交金额)</h3>
          <div className="meta">DECIMAL(12,2) · 度量 · 100% 覆盖</div>

          <div className="block">
            <span className="lbl">业务语义 · SEMANTIC</span>
            <select style={{
              width:'100%', padding:'9px 12px', border:'1px solid var(--line-1)',
              borderRadius:'var(--r-md)', background:'var(--paper)',
              fontFamily:'var(--font-sans)', fontSize:13, color:'var(--ink-1)'}}>
              <option>度量 · 可聚合(SUM)</option>
              <option>度量 · 平均(AVG)</option>
              <option>维度 · 不聚合</option>
            </select>
          </div>

          <div className="block">
            <span className="lbl">同义词 · 让 AI 听懂</span>
            <div className="pillset">
              <span className="p">销售额 <span className="x">×</span></span>
              <span className="p">营收 <span className="x">×</span></span>
              <span className="p">成交 <span className="x">×</span></span>
              <span className="p">revenue <span className="x">×</span></span>
              <span className="p">GMV <span className="x">×</span></span>
              <span className="p add">+ 添加</span>
            </div>
          </div>

          <div className="block">
            <span className="lbl">默认聚合 · DEFAULT AGG</span>
            <div className="pillset">
              <span className="p" style={{background:'var(--ink-1)', color:'var(--paper)', borderColor:'var(--ink-1)'}}>SUM</span>
              <span className="p">AVG</span>
              <span className="p">MIN / MAX</span>
              <span className="p">COUNT</span>
            </div>
          </div>

          <div className="block">
            <span className="lbl">样本值 · 5 行</span>
            <div className="sample">
              <div>1,289.00</div>
              <div>5,640.00</div>
              <div>328.50</div>
              <div>12,400.00</div>
              <div>0.00 <span style={{color:'var(--terracotta)'}}>· 异常?</span></div>
            </div>
          </div>

          <button className="save">保存语义</button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Metric center ---------- */

export function MetricCenter() {
  return (
    <div className="p0-frame">
      <MetricCenterLiveBar />
      <div className="mc">
        <div className="mc-list">
          <div className="head">
            <input placeholder="⌕ 搜索指标..." defaultValue=""/>
          </div>
          <div className="group">营收 · REVENUE</div>
          {[
            { name:'GMV', key:'gmv', v:'¥ 12.4M / 周', on:true },
            { name:'净收入', key:'net_revenue', v:'¥ 9.2M / 周' },
            { name:'客单价', key:'aov', v:'¥ 312' },
            { name:'退款率', key:'refund_rate', v:'2.1%' },
          ].map(m => (
            <div key={m.key} className={`row ${m.on?'on':''}`}>
              <div>
                <div>{m.name}</div>
                <div className="key">{m.key}</div>
              </div>
              <div className="v">{m.v}</div>
            </div>
          ))}
          <div className="group">用户 · USER</div>
          {[
            { name:'D7 留存', key:'retention_d7', v:'42.1%' },
            { name:'D30 留存', key:'retention_d30', v:'18.4%' },
            { name:'DAU', key:'dau', v:'89.2k' },
            { name:'激活率', key:'activation_rate', v:'31%' },
          ].map(m => (
            <div key={m.key} className="row">
              <div>
                <div>{m.name}</div>
                <div className="key">{m.key}</div>
              </div>
              <div className="v">{m.v}</div>
            </div>
          ))}
          <div className="group">销售 · SALES</div>
          {[
            { name:'管线规模', key:'pipeline_value', v:'¥ 42M' },
            { name:'平均成交周期', key:'avg_deal_cycle', v:'18 天' },
          ].map(m => (
            <div key={m.key} className="row">
              <div>
                <div>{m.name}</div>
                <div className="key">{m.key}</div>
              </div>
              <div className="v">{m.v}</div>
            </div>
          ))}
        </div>

        <div className="mc-main">
          <div className="crumbs">指标中心 / 营收 / GMV</div>
          <h2 className="p0-h2">GMV(成交金额)</h2>
          <div className="meta">
            <span style={{fontFamily:'var(--font-mono)'}}>gmv</span>
            <span>· 当前周值 ¥ 12.4M(+8.2% WoW)</span>
            <span className="owner"><span className="av">李</span>李文 · 数据</span>
            <span>· 上次修订 5 天前 · v3</span>
            <span style={{marginLeft:'auto', color:'var(--success)'}}>● 已审核</span>
          </div>

          <div className="mc-grid">
            <div className="mc-card span2">
              <div className="lbl">SQL 定义 · 计算口径</div>
              <div className="def-sql">
                <div><span className="kw">SELECT</span> SUM(<span className="kw">CASE WHEN</span> status <span className="kw">IN</span> (<span className="str">'paid'</span>,<span className="str">'refund_partial'</span>)
                </div>
                <div>{'  '}<span className="kw">THEN</span> gmv * (<span className="num">1</span> - refund_ratio) <span className="kw">ELSE</span> <span className="num">0</span> <span className="kw">END</span>) <span className="kw">AS</span> gmv</div>
                <div><span className="kw">FROM</span> orders <span className="kw">JOIN</span> users <span className="kw">USING</span>(user_id)</div>
                <div><span className="kw">WHERE</span> created_at <span className="kw">&gt;=</span> <span className="str">'2026-01-01'</span> <span className="kw">AND</span> is_internal = <span className="kw">FALSE</span></div>
              </div>
              <div style={{display:'flex', gap:10, marginTop:14, alignItems:'center'}}>
                <button className="btn-ghost">编辑口径</button>
                <button className="btn-ghost">提交审核</button>
                <span style={{flex:1}}/>
                <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>
                  ⚠ 影响范围:42 个看板 · 7 个订阅
                </span>
              </div>
            </div>

            <div className="mc-card">
              <div className="lbl">业务同义词 · AI 词典</div>
              <div className="syn-row">
                <span className="p">销售额</span>
                <span className="p">营收</span>
                <span className="p">revenue</span>
                <span className="p">成交金额</span>
                <span className="p">收入</span>
                <span className="p">GMV</span>
                <span className="p">流水</span>
                <span className="p train">+ 训练新说法</span>
              </div>
              <div style={{marginTop:14, fontSize:12, color:'var(--ink-3)', lineHeight:1.55}}>
                上周有 <b style={{color:'var(--ink-1)'}}>3 次</b>提问用了"流水",AI 自动映射成功。
              </div>
            </div>

            <div className="mc-card">
              <div className="lbl">支持的拆分维度</div>
              <div className="dim-list">
                <div className="dim"><span className="k">by channel</span><span className="v">7 渠道</span></div>
                <div className="dim"><span className="k">by region</span><span className="v">5 区域</span></div>
                <div className="dim"><span className="k">by category</span><span className="v">23 类目</span></div>
                <div className="dim"><span className="k">by time</span><span className="v">day / week / month / quarter</span></div>
                <div className="dim"><span className="k">by cohort</span><span className="v">新 / 老 / VIP / 流失</span></div>
              </div>
            </div>

            <div className="mc-card span2">
              <div className="lbl">使用情况 · USAGE</div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:18}}>
                <div>
                  <div className="lbl" style={{marginBottom:4, color:'var(--ink-4)'}}>本月被引用</div>
                  <div style={{fontFamily:'var(--font-serif)', fontSize:28}}>1,284<span style={{fontSize:14, color:'var(--success)'}}> +18%</span></div>
                </div>
                <div>
                  <div className="lbl" style={{marginBottom:4, color:'var(--ink-4)'}}>关联看板</div>
                  <div style={{fontFamily:'var(--font-serif)', fontSize:28}}>42</div>
                </div>
                <div>
                  <div className="lbl" style={{marginBottom:4, color:'var(--ink-4)'}}>订阅人数</div>
                  <div style={{fontFamily:'var(--font-serif)', fontSize:28}}>89</div>
                </div>
                <div>
                  <div className="lbl" style={{marginBottom:4, color:'var(--ink-4)'}}>AI 命中率</div>
                  <div style={{fontFamily:'var(--font-serif)', fontSize:28}}>96.4%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
