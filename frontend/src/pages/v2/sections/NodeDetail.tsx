// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/NodeDetail.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { v2Api } from '../../../api'

const { useState: useS_ND } = React;

/* =========================================================
   Node detail drawer · Version diff · Delete confirm
   ========================================================= */

function TopBar3({ crumbs = ['个人空间','Q3 渠道复盘'], badge }) {
  return (
    <div className="topbar2">
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
      <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>14:32 · main</span>
      <div style={{width:28, height:28, borderRadius:'999px',
        background:'linear-gradient(135deg, var(--amber), var(--terracotta))',
        color:'white', display:'grid', placeItems:'center', fontSize:12, fontWeight:600}}>李</div>
    </div>
  );
}

/* ---------- Live data bars (节点详情 / 版本对照 / 删除确认) ---------- */

function pickAssistantNode(setter, setMsg) {
  return async () => {
    setMsg('选节点...')
    try {
      const ws = await v2Api.getCurrentWorkspace()
      const sessions = await v2Api.listSessions(ws.id)
      for (const ses of sessions) {
        const nodes = await v2Api.listCanvasNodes(ses.id)
        const ast = nodes.find(n => n.role === 'assistant')
        if (ast) {
          setter({ ...ast, _session_title: ses.title })
          setMsg(`已选: ${(ast.content || '').slice(0, 30)}...`)
          return
        }
      }
      setMsg('未找到 assistant 节点 — 先在 canvas 问一个问题')
    } catch (e) { setMsg(`失败: ${e?.message || e}`) }
  }
}

function NodeDetailLiveBar() {
  const [node, setNode] = useState(null)
  const [detail, setDetail] = useState(null)
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [searchParams] = useSearchParams()

  // DAT-25 · URL 协议消费 (?id=<node_id>) — 跳进来直接定位
  const queryId = searchParams.get('id')
  useEffect(() => {
    if (queryId && !node) setNode({ node_id: queryId, _session_title: '(URL)' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryId])

  const reloadDetail = async (nid) => {
    try {
      const [d, c] = await Promise.all([
        v2Api.getNodeDetail(nid),
        v2Api.listNodeComments(nid),
      ])
      setDetail(d); setComments(c)
    } catch (e) { setMsg(`加载失败: ${e?.response?.data?.detail || e?.message}`); setTimeout(() => setMsg(null), 3000) }
  }

  useEffect(() => {
    if (node?.node_id) reloadDetail(node.node_id)
  }, [node])

  const addComment = async () => {
    if (!body.trim() || !node) return
    setBusy(true)
    try {
      await v2Api.addNodeComment(node.node_id, body.trim())
      setBody(''); reloadDetail(node.node_id)
    } finally { setBusy(false) }
  }
  const setClarify = async (st) => {
    if (!node) return
    await v2Api.patchNodeStatus(node.node_id, { clarify_status: st })
    reloadDetail(node.node_id)
  }
  const setHITL = async (st) => {
    if (!node) return
    await v2Api.patchNodeStatus(node.node_id, { hitl_status: st })
    reloadDetail(node.node_id)
  }

  return (
    <LiveBarND title="节点详情 · 真实数据" footer={msg}>
      {!node && <button onClick={pickAssistantNode(setNode, setMsg)} style={btnPriND}>挑一个 assistant 节点</button>}
      {node && (
        <>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
            <b>{node._session_title || '—'}</b> · {(node.content || '').slice(0, 40)}...
          </span>
          <button onClick={() => { setNode(null); setDetail(null); setComments([]) }} style={btnGhostND}>换一个</button>
        </>
      )}
      {detail && (
        <div style={{ width: '100%', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span><b>评论</b> {detail.comments_count}</span>
            <span><b>分支</b> {detail.children?.length || 0}</span>
            <span>clarify=<b style={{ color: detail.clarify_status === 'cleared' ? 'var(--success)' : 'var(--ink-2)' }}>{detail.clarify_status}</b></span>
            <button onClick={() => setClarify('pending')} style={btnGhostND}>·pending</button>
            <button onClick={() => setClarify('cleared')} style={btnGhostND}>·cleared</button>
            <span>HITL=<b>{detail.hitl_status}</b></span>
            <button onClick={() => setHITL('waiting')} style={btnGhostND}>·waiting</button>
            <button onClick={() => setHITL('approved')} style={btnGhostND}>·approved</button>
            <button onClick={() => setHITL('rejected')} style={btnGhostND}>·rejected</button>
          </div>

          {/* 评论列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {comments.length === 0 ? <div style={{ color: 'var(--ink-4)', fontSize: 12 }}>暂无评论</div>
              : comments.map(c => (
                <div key={c.id} style={liveRowND}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>#{c.user_id}</span>
                  <span style={{ flex: 1, fontSize: 12 }}>{c.body}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' }}>{(c.created_at || '').slice(11, 16)}</span>
                </div>
              ))
            }
          </div>

          {/* 加评论 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input value={body} onChange={e => setBody(e.target.value)} placeholder="加一条评论..."
              style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment() } }} />
            <button onClick={addComment} disabled={busy || !body.trim()} style={btnPriND}>评论</button>
          </div>
        </div>
      )}
    </LiveBarND>
  )
}

function VersionDiffLiveBar() {
  const [node, setNode] = useState(null)
  const [versions, setVersions] = useState([])
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!node) return
    v2Api.listNodeVersions(node.node_id).then(setVersions).catch(() => {})
  }, [node])

  return (
    <LiveBarND title="版本对照 · 真实数据 (LLM 候选树)" footer={msg}>
      {!node && <button onClick={pickAssistantNode(setNode, setMsg)} style={btnPriND}>挑一个 assistant 节点</button>}
      {node && (
        <>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}><b>{node._session_title}</b></span>
          <button onClick={() => { setNode(null); setVersions([]) }} style={btnGhostND}>换</button>
        </>
      )}
      {node && (
        <div style={{ width: '100%', marginTop: 8 }}>
          {versions.length <= 1 ? (
            <div style={{ color: 'var(--ink-4)', fontSize: 12 }}>
              该消息只有 1 个版本 (没人点过"重新生成")
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {versions.slice(0, 2).map((v, i) => (
                <div key={v.id} style={{ flex: 1, padding: 10, background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 6 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>v{i+1} · {v.model_name || '—'}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{(v.content || '').slice(0, 200)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </LiveBarND>
  )
}

function ConfirmDeleteLiveBar() {
  const [node, setNode] = useState(null)
  const [impact, setImpact] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!node) return
    v2Api.getNodeDeleteImpact(node.node_id).then(setImpact).catch(() => {})
  }, [node])

  const doDelete = async (cascade) => {
    if (!node) return
    if (!confirm(`真删?${cascade ? ' 包含子节点 + 评论 + widget' : ''}`)) return
    try {
      await v2Api.deleteNode(node.node_id, cascade)
      setMsg('已删除'); setNode(null); setImpact(null)
    } catch (e) { setMsg(`失败: ${e?.response?.data?.detail || e?.message}`) }
    setTimeout(() => setMsg(null), 3000)
  }

  return (
    <LiveBarND title="删除确认 · 真实数据" footer={msg}>
      {!node && <button onClick={pickAssistantNode(setNode, setMsg)} style={btnPriND}>挑一个 assistant 节点</button>}
      {node && (
        <>
          <span style={{ fontSize: 12 }}><b>{node._session_title}</b> · {(node.content || '').slice(0, 30)}</span>
          <button onClick={() => { setNode(null); setImpact(null) }} style={btnGhostND}>换</button>
        </>
      )}
      {impact && (
        <div style={{ width: '100%', marginTop: 8, padding: 10, background: 'oklch(0.56 0.20 25 / 0.08)', border: '1px solid var(--danger)', borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>⚠️ 删除影响：</div>
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            · 子分支节点：<b>{impact.children_count}</b> 个 (cascade 时一并删)<br />
            · 评论：<b>{impact.comments_count}</b> 条<br />
            · 已钉到看板：<b>{impact.pinned_widgets_count}</b> 个 widget
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => doDelete(false)} style={{ ...btnGhostND, color: 'var(--danger)' }}>只删本节点</button>
            <button onClick={() => doDelete(true)} style={{ ...btnPriND, background: 'var(--danger)' }}>级联删除</button>
          </div>
        </div>
      )}
    </LiveBarND>
  )
}

const liveRowND = { padding: '6px 10px', background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }
const btnPriND = { padding: '5px 10px', background: 'var(--amber-deep)', color: 'var(--paper)', border: 0, borderRadius: 6, fontSize: 11, cursor: 'pointer' }
const btnGhostND = { padding: '4px 8px', background: 'transparent', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 10, cursor: 'pointer' }

function LiveBarND({ title, footer, children }) {
  return (
    <div style={{ padding: '12px 18px', background: 'oklch(0.78 0.16 65 / 0.10)', borderBottom: '1px solid var(--amber-deep)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--amber-deep)' }}>● {title}</span>
        {children}
        {footer && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)' }}>{footer}</span>}
      </div>
    </div>
  )
}

/* ---------- Node detail drawer ---------- */

export function NodeDetail() {
  const [tab, setTab] = useS_ND('overview');
  return (
    <div className="p0-frame">
      <NodeDetailLiveBar />
      <div className="ai-scene">
        <TopBar3 crumbs={['个人空间','Q3 渠道复盘','节点 #04']} badge="节点详情"/>
        <div className="nd-stage">
          <div className="nd-bg">
            <div className="mock">
              <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.18em', color:'var(--ink-4)', marginBottom:6}}>
                节点 #04 · AI 生成 14:21
              </div>
              <div style={{fontFamily:'var(--font-serif)', fontSize:20, marginBottom:10}}>
                抖音 vs 私域 · 阶段流失对比
              </div>
              <div style={{height:140, background:'var(--paper-2)', borderRadius:'var(--r-md)'}}/>
            </div>
          </div>

          <div className="nd-drawer">
            <div className="head" style={{position:'relative'}}>
              <div className="crumbs">
                <span className="num">#04</span>
                <span>·</span>
                <span>分支 B · 渠道对比线</span>
                <span>·</span>
                <span style={{color:'var(--success)'}}>● 已运行</span>
              </div>
              <h3 className="p0-h3">抖音 vs 私域 · 阶段流失对比</h3>
              <div className="ctrl">
                <button title="放大">⤢</button>
                <button title="复制">⧉</button>
                <button title="更多">⋯</button>
                <button title="关闭">✕</button>
              </div>
            </div>

            <div className="nd-tabs">
              <button className={tab==='overview'?'on':''} onClick={()=>setTab('overview')}>概览</button>
              <button className={tab==='params'?'on':''}   onClick={()=>setTab('params')}>参数 <span className="cnt">7</span></button>
              <button className={tab==='comments'?'on':''} onClick={()=>setTab('comments')}>评论 <span className="cnt">3</span></button>
              <button className={tab==='history'?'on':''}  onClick={()=>setTab('history')}>版本 <span className="cnt">4</span></button>
              <button className={tab==='cite'?'on':''}     onClick={()=>setTab('cite')}>被引用 <span className="cnt">2</span></button>
            </div>

            <div className="nd-body">
              <div className="nd-section">
                <div className="lbl">基本信息 · META</div>
                <div className="nd-meta-grid">
                  <div className="k">类型</div>
                  <div className="v">漏斗对比图 · 多组堆叠</div>
                  <div className="k">数据源</div>
                  <div className="v">events_olap.funnel_log · 实时同步</div>
                  <div className="k">指标</div>
                  <div className="v">conversion_rate · 已审核 v3</div>
                  <div className="k">时间窗</div>
                  <div className="v">2026-07-01 → 09-30 · 12 周</div>
                  <div className="k">所有人</div>
                  <div className="v">李文 · 数据团队 · 14:21 生成</div>
                  <div className="k">置信度</div>
                  <div className="v" style={{color:'var(--success)'}}>● 高 · 全量扫描,无采样</div>
                </div>
              </div>

              <div className="nd-section">
                <div className="lbl">参数 · 可点击修改后重跑</div>
                <div className="nd-params">
                  <div className="nd-param">
                    <span className="k">channels</span>
                    <span className="v">tiktok, private <span className="ed">✎</span></span>
                  </div>
                  <div className="nd-param">
                    <span className="k">date_range</span>
                    <span className="v">12 weeks <span className="ed">✎</span></span>
                  </div>
                  <div className="nd-param">
                    <span className="k">funnel_stages</span>
                    <span className="v">4 stages <span className="ed">✎</span></span>
                  </div>
                  <div className="nd-param">
                    <span className="k">cohort</span>
                    <span className="v">all_users <span className="ed">✎</span></span>
                  </div>
                  <div className="nd-param">
                    <span className="k">compare_mode</span>
                    <span className="v">side_by_side <span className="ed">✎</span></span>
                  </div>
                  <div className="nd-param">
                    <span className="k">smoothing</span>
                    <span className="v">7d_avg <span className="ed">✎</span></span>
                  </div>
                </div>
              </div>

              <div className="nd-section">
                <div className="lbl">评论 · 3 条</div>
                <div className="nd-comment">
                  <div className="av">陈</div>
                  <div className="body">
                    <div className="top">
                      <span className="name">陈昊</span>
                      <span className="when">12 分钟前</span>
                    </div>
                    <div className="text">
                      私域第二阶段流失明显高于抖音,<span className="at">@周晴</span> 看看落地页有没有问题?
                    </div>
                  </div>
                </div>
                <div className="nd-comment">
                  <div className="av b">周</div>
                  <div className="body">
                    <div className="top">
                      <span className="name">周晴</span>
                      <span className="when">8 分钟前</span>
                    </div>
                    <div className="text">
                      私域 8 月做过一次表单改版,可能有影响。我去拉一下 A/B。
                    </div>
                  </div>
                </div>
                <div className="nd-comment">
                  <div className="av">李</div>
                  <div className="body">
                    <div className="top">
                      <span className="name">李文</span>
                      <span className="when">3 分钟前</span>
                    </div>
                    <div className="text">
                      已经把这张图钉到 <b>Q3 渠道复盘</b> 看板,周一例会用。
                    </div>
                  </div>
                </div>
                <div className="nd-cmt-input">
                  <input placeholder="@同事 或 写一句想法..."/>
                  <button>发送 ⏎</button>
                </div>
              </div>
            </div>

            <div className="nd-foot">
              <div className="left">
                <span className="pill">↑ 父节点 #02</span>
                <span className="pill">↓ 子节点 #06 #07</span>
              </div>
              <div className="right">
                <button className="danger">删除节点</button>
                <button style={{
                  border:'1px solid var(--line-1)', background:'transparent',
                  padding:'8px 14px', borderRadius:'var(--r-md)',
                  fontSize:12, color:'var(--ink-2)', cursor:'pointer',
                  fontFamily:'var(--font-sans)'}}>新建分支</button>
                <button style={{
                  background:'var(--ink-1)', color:'var(--paper)', border:0,
                  padding:'8px 16px', borderRadius:'var(--r-md)',
                  fontSize:12, fontWeight:500, cursor:'pointer',
                  fontFamily:'var(--font-sans)'}}>钉到看板 ⌘↵</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- Version diff ---------- */

export function VersionDiff() {
  return (
    <div className="p0-frame">
      <VersionDiffLiveBar />
      <div className="diff">
        <div className="diff-top">
          <h2>版本对照 · 节点 #04</h2>
          <span style={{flex:1}}/>
          <span className="v-pill a"><span className="dot"/>v2 · 李文 · 13:58</span>
          <span className="arrow">→</span>
          <span className="v-pill b"><span className="dot"/>v4 · 你 · 刚刚</span>
          <button className="btn-ghost" style={{marginLeft:12}}>切换版本</button>
          <button className="btn-primary">恢复到 v2</button>
        </div>

        <div className="diff-body">
          <div className="diff-side a">
            <div className="ver-head">
              <div className="who"><span className="av">李</span>v2 · 李文</div>
              <div className="meta">2026-09-30 · 13:58 · 8 分钟前</div>
            </div>

            <div className="diff-card">
              <div className="ttl">抖音 vs 私域 · 漏斗</div>
              <div className="chart-mock"/>
              <div className="nums">
                <div className="cell">
                  <div className="k">抖音转化</div>
                  <div className="v">12.4%</div>
                </div>
                <div className="cell">
                  <div className="k">私域转化</div>
                  <div className="v">8.1%</div>
                </div>
                <div className="cell">
                  <div className="k">差异</div>
                  <div className="v dn">−4.3pt</div>
                </div>
              </div>
            </div>

            <div className="diff-card">
              <div className="ttl" style={{fontSize:13, color:'var(--ink-3)', marginBottom:8, fontFamily:'var(--font-mono)', letterSpacing:'0.1em'}}>
                SQL · v2
              </div>
              <div className="diff-sql">
<span className="kw">SELECT</span> stage, <span className="kw">COUNT</span>(<span className="kw">DISTINCT</span> user_id){'\n'}
<span className="kw">FROM</span> events{'\n'}
<span className="kw">WHERE</span> channel <span className="kw">IN</span> (<span className="str">'tiktok'</span>,<span className="str">'private'</span>){'\n'}
{'  '}<span className="kw">AND</span> ts <span className="rm"><span className="kw">BETWEEN</span> <span className="str">'2026-08-01'</span></span>{'\n'}
{'  '}<span className="rm"><span className="kw">AND</span> <span className="str">'2026-09-30'</span></span>{'\n'}
<span className="kw">GROUP BY</span> stage
              </div>
            </div>
          </div>

          <div className="diff-side b">
            <div className="ver-head">
              <div className="who"><span className="av" style={{background:'linear-gradient(135deg, var(--clay), var(--olive))'}}>李</span>v4 · 你 · 当前</div>
              <div className="meta">2026-09-30 · 14:31 · 刚刚</div>
            </div>

            <div className="diff-card">
              <div className="ttl">抖音 vs 私域 · 漏斗(扩到 Q3)</div>
              <div className="chart-mock"/>
              <div className="nums">
                <div className="cell">
                  <div className="k">抖音转化</div>
                  <div className="v">11.8%</div>
                </div>
                <div className="cell">
                  <div className="k">私域转化</div>
                  <div className="v">9.2%</div>
                </div>
                <div className="cell">
                  <div className="k">差异</div>
                  <div className="v dn">−2.6pt</div>
                </div>
              </div>
            </div>

            <div className="diff-card">
              <div className="ttl" style={{fontSize:13, color:'var(--ink-3)', marginBottom:8, fontFamily:'var(--font-mono)', letterSpacing:'0.1em'}}>
                SQL · v4
              </div>
              <div className="diff-sql">
<span className="kw">SELECT</span> stage, <span className="kw">COUNT</span>(<span className="kw">DISTINCT</span> user_id){'\n'}
<span className="kw">FROM</span> events{'\n'}
<span className="kw">WHERE</span> channel <span className="kw">IN</span> (<span className="str">'tiktok'</span>,<span className="str">'private'</span>,<span className="add"><span className="str">'xiaohongshu'</span></span>){'\n'}
{'  '}<span className="kw">AND</span> ts <span className="add"><span className="kw">BETWEEN</span> <span className="str">'2026-07-01'</span></span>{'\n'}
{'  '}<span className="add"><span className="kw">AND</span> <span className="str">'2026-09-30'</span></span>{'\n'}
<span className="kw">GROUP BY</span> stage
              </div>
            </div>

            <div style={{
              background:'oklch(0.78 0.16 65 / 0.07)',
              border:'1px solid oklch(0.78 0.16 65 / 0.3)',
              borderRadius:'var(--r-lg)', padding:'12px 14px',
              fontSize:12, color:'var(--ink-2)', lineHeight:1.55}}>
              <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.2em',
                textTransform:'uppercase', color:'var(--amber-deep)', marginBottom:6}}>
                变更摘要 · DIFF
              </div>
              新增 <b style={{color:'var(--ink-1)'}}>小红书</b> 渠道;时间窗从 2 个月扩展到 <b style={{color:'var(--ink-1)'}}>3 个月</b>。
              结论方向不变,差异从 4.3pt 收窄到 2.6pt。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- Delete confirm dialog ---------- */

export function ConfirmDelete() {
  return (
    <div className="p0-frame">
      <ConfirmDeleteLiveBar />
      <div className="ai-scene">
        <TopBar3 crumbs={['个人空间','Q3 渠道复盘','节点 #04']} badge="删除确认"/>
        <div className="cdlg-stage">
          <div className="cdlg">
            <div className="icon">!</div>
            <h3>真的要删 <em style={{fontStyle:'italic', color:'var(--terracotta)'}}>节点 #04</em> 吗?</h3>
            <p className="lead">
              删除是<b style={{color:'var(--ink-1)'}}>软删除</b> —— 30 天内可以从「回收站」找回。但下面这些东西会立刻断开,看的人会看到"已删除"占位。
            </p>

            <div className="cascade">
              <div className="lbl">影响范围 · CASCADE</div>
              <ul>
                <li><b>2 个子节点</b>(#06 抖音漏斗 · #07 私域漏斗)会变成孤立节点,需要你手动重接父节点</li>
                <li><b>1 个看板</b>(Q3 渠道复盘 · 第 3 张图)会留下空位</li>
                <li><b>3 条评论 · 1 个 @ 提及</b> 不会通知到对应同事</li>
                <li>1 个订阅(<span style={{fontFamily:'var(--font-mono)', fontSize:11}}>每周一 09:00</span>)会暂停</li>
              </ul>
            </div>

            <div className="actions">
              <button className="btn-ghost">取消</button>
              <button className="danger">删除并暂停 1 个订阅</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
