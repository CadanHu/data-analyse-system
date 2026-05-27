// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/Alerts.jsx
// 阶段 5 真实数据接入：AlertWizard/Detail 顶部 Live 浮动条
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { v2Api } from '../../../api'

const { useState: useS_AL } = React;

/* ---------- Live data bars (阶段 5) ---------- */

function AlertWizardLiveBar() {
  const [workspace, setWorkspace] = useState(null)
  const [rules, setRules] = useState([])
  const [name, setName] = useState('')
  const [op, setOp] = useState('<')
  const [value, setValue] = useState('-10')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { v2Api.getCurrentWorkspace().then(setWorkspace).catch(() => {}) }, [])
  const reload = async () => {
    if (!workspace) return
    try { setRules(await v2Api.listAlertRules(workspace.id)) } catch {}
  }
  useEffect(() => { reload() }, [workspace])

  const create = async () => {
    if (!workspace || !name.trim()) return
    setBusy(true); setMsg(null)
    try {
      const r = await v2Api.createAlertRule({
        workspace_id: workspace.id,
        name: name.trim(),
        threshold: { op, value: parseFloat(value), comparator: 'wow_pct', window: '1d' },
        channels: [{ channel: 'inapp' }],
      })
      setMsg(`已创建: ${r.id.slice(0, 8)}...`)
      setName('')
      reload()
    } catch (e) { setMsg(`失败: ${e?.message || e}`) }
    finally { setBusy(false); setTimeout(() => setMsg(null), 3500) }
  }

  const trigger = async (rid) => {
    setBusy(true)
    try {
      await v2Api.triggerAlert(rid, {
        current_value: `${value}% (mock)`,
        threshold_value: `${value}%`,
        severity: 'warn',
      })
      setMsg('手动触发了一次告警事件 → 看通知中心')
    } catch (e) { setMsg(`触发失败: ${e?.message || e}`) }
    finally { setBusy(false); setTimeout(() => setMsg(null), 3500) }
  }

  const del = async (rid) => {
    if (!confirm('删除规则？关联事件 / 订阅会一并删除。')) return
    setBusy(true)
    try { await v2Api.deleteAlertRule(rid); reload() }
    catch (e) { setMsg(`删除失败: ${e?.message || e}`); setTimeout(() => setMsg(null), 3000) }
    finally { setBusy(false) }
  }

  return (
    <LiveBarAL title="告警规则 · 真实数据" footer={msg}>
      <InlineAL label="名称">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="如 D7 留存下降" style={{ minWidth: 200, padding: '4px 8px' }} />
      </InlineAL>
      <InlineAL label="阈值">
        <select value={op} onChange={e => setOp(e.target.value)}>
          <option value="<">小于</option>
          <option value=">">大于</option>
          <option value="<=">小等于</option>
          <option value=">=">大等于</option>
        </select>
        <input value={value} onChange={e => setValue(e.target.value)} style={{ width: 60, padding: '4px 8px' }} />%
      </InlineAL>
      <button disabled={busy || !name.trim()} onClick={create} style={btnPriAL}>创建</button>

      {rules.length > 0 && (
        <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rules.map(r => (
            <div key={r.id} style={liveRowAL}>
              <span style={{ flex: 1, fontSize: 12 }}>
                <b>{r.name}</b>
                <span style={{ color: 'var(--ink-3)', marginLeft: 8 }}>
                  {r.threshold_json?.op}{r.threshold_json?.value}%
                </span>
              </span>
              <span style={{ fontSize: 10, color: r.enabled ? 'var(--success)' : 'var(--ink-4)' }}>{r.enabled ? '●启用' : '○停用'}</span>
              <button onClick={() => trigger(r.id)} style={btnGhostAL}>▶ 强触发</button>
              <button onClick={async () => {
                const out = await v2Api.evalAlertNow(r.id)
                setMsg(out.evaluated ? `评估: ${out.fired ? '✅ fired' : '✓ 未命中'} (value=${out.value})` : `跳过: ${out.reason}`)
                setTimeout(() => setMsg(null), 4000)
              }} style={btnGhostAL}>⚡ 评估</button>
              <button onClick={() => del(r.id)} style={{ ...btnGhostAL, color: 'var(--ink-4)' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </LiveBarAL>
  )
}

function AlertDetailLiveBar() {
  const [workspace, setWorkspace] = useState(null)
  const [events, setEvents] = useState([])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [searchParams] = useSearchParams()
  const queryEventId = searchParams.get('event')

  useEffect(() => { v2Api.getCurrentWorkspace().then(setWorkspace).catch(() => {}) }, [])
  const reload = async () => {
    if (!workspace) return
    try {
      const list = await v2Api.listAlertEvents({ workspace_id: workspace.id, status: filter || undefined, limit: 30 })
      setEvents(list)
    } catch {}
  }
  useEffect(() => { reload() }, [workspace, filter])

  // DAT-25 · URL 协议消费 (?event=<event_id>) — 在事件列表加载后高亮目标事件
  useEffect(() => {
    if (!queryEventId || !events.length) return
    setTimeout(() => {
      const el = document.querySelector(`[data-alert-event-id="${queryEventId}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.style.outline = '2px solid var(--amber-deep)'
        el.style.outlineOffset = '2px'
        setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 2500)
      }
    }, 100)
  }, [queryEventId, events])

  const ack = async (eid) => { setBusy(true); try { await v2Api.ackAlertEvent(eid); reload() } finally { setBusy(false) } }
  const resolve = async (eid) => { setBusy(true); try { await v2Api.resolveAlertEvent(eid); reload() } finally { setBusy(false) } }

  return (
    <LiveBarAL title={`告警事件 · 真实数据 · 共 ${events.length}`}>
      <InlineAL label="状态">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">全部</option>
          <option value="open">open</option>
          <option value="ack">ack</option>
          <option value="resolved">resolved</option>
        </select>
      </InlineAL>
      <button onClick={reload} style={btnGhostAL}>刷新</button>

      {events.length === 0 ? (
        <div style={{ width: '100%', padding: '8px 0', color: 'var(--ink-4)', fontSize: 12 }}>
          没有事件。回 AlertWizard 创建规则并点"▶ 触发"造测试数据。
        </div>
      ) : (
        <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.map(e => (
            <div key={e.id} data-alert-event-id={e.id} style={{ ...liveRowAL, opacity: e.status === 'resolved' ? 0.5 : 1 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', padding: '1px 5px',
                background: e.severity === 'critical' ? 'oklch(0.56 0.20 25 / 0.15)' : 'oklch(0.74 0.16 75 / 0.15)',
                color: e.severity === 'critical' ? 'var(--danger)' : 'var(--warning)',
                borderRadius: 4,
              }}>{e.severity}</span>
              <span style={{ flex: 1, fontSize: 12 }}>
                当前 <b>{e.current_value}</b>
                {e.threshold_value && <span style={{ color: 'var(--ink-3)' }}> · 阈值 {e.threshold_value}</span>}
                {e.attribution_json?.top_value && <span style={{ color: 'var(--ink-3)' }}> · 主因 {e.attribution_json.top_value} ({e.attribution_json.contrib_pct}%)</span>}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase' }}>{e.status}</span>
              {e.status === 'open' && <button onClick={() => ack(e.id)} disabled={busy} style={btnGhostAL}>ack</button>}
              {e.status !== 'resolved' && <button onClick={() => resolve(e.id)} disabled={busy} style={btnGhostAL}>resolve</button>}
            </div>
          ))}
        </div>
      )}
    </LiveBarAL>
  )
}

const liveRowAL = { padding: '6px 10px', background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }
const btnPriAL = { padding: '6px 12px', background: 'var(--amber-deep)', color: 'var(--paper)', border: 0, borderRadius: 6, fontSize: 12, cursor: 'pointer' }
const btnGhostAL = { padding: '4px 10px', background: 'transparent', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }

function LiveBarAL({ title, footer, children }) {
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

function InlineAL({ label, children }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-3)' }}>{label}: {children}</label>
}

/* =========================================================
   Alerts · Subscription wizard + Anomaly detail
   ========================================================= */

function P1Top_AL({ crumbs, badge, clock='14:55 · main', alarm }) {
  return (
    <div className="p1-topbar" style={alarm ? { borderBottomColor:'oklch(0.58 0.16 35 / 0.5)' } : null}>
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
          color: alarm ? 'var(--terracotta)' : 'var(--ink-3)',
          padding:'3px 8px',
          border:`1px solid ${alarm ? 'oklch(0.58 0.16 35 / 0.4)' : 'var(--line-1)'}`,
          borderRadius:999, marginLeft:8,
          background: alarm ? 'oklch(0.58 0.16 35 / 0.08)' : 'transparent'
        }}>{badge}</span>
      )}
      <span style={{flex:1}}/>
      <span className="clk">{clock}</span>
      <div className="av">李</div>
    </div>
  );
}

/* =========================================================
   1. Alert wizard — create subscription / threshold
   ========================================================= */

export function AlertWizard() {
  const [kind, setKind] = useS_AL('threshold');
  const [chans, setChans] = useS_AL(new Set(['email','feishu']));
  const togCh = c => {
    const n = new Set(chans);
    n.has(c) ? n.delete(c) : n.add(c);
    setChans(n);
  };

  return (
    <div className="p0-frame">
      <AlertWizardLiveBar />
      <div className="ai-scene">
        <P1Top_AL crumbs={['工作区','+ 新建提醒']} badge="新建 · STEP 1/2"/>
        <div className="aw">
          <div className="aw-main">
            <div className="aw-head">
              <span className="step">第 1 步 / 共 2 步</span>
              <h1>什么情况下,你想<em>被叫醒</em>?</h1>
              <p className="lead">告诉我们规则,触发后我们会重跑相关图表,带上同比和可能原因,推到你选的渠道。你不必盯屏幕。</p>
            </div>

            <div className="aw-section">
              <div className="lbl">触发方式 · TRIGGER</div>
              <div className="aw-cards">
                <div className={`c ${kind==='threshold'?'on':''}`} onClick={()=>setKind('threshold')}>
                  <div className="ttl">指标阈值</div>
                  <div className="desc">某个指标穿过你设定的红线,马上通知。</div>
                  <div className="ex">例 · GMV 日值低于 ¥1.5M</div>
                </div>
                <div className={`c ${kind==='delta'?'on':''}`} onClick={()=>setKind('delta')}>
                  <div className="ttl">环比异常</div>
                  <div className="desc">本期与上期变化超过 X%,自动通知。</div>
                  <div className="ex">例 · D7 留存 WoW −2pt</div>
                </div>
                <div className={`c ${kind==='digest'?'on':''}`} onClick={()=>setKind('digest')}>
                  <div className="ttl">定时摘要</div>
                  <div className="desc">不看异常,只想每周固定时间收个简报。</div>
                  <div className="ex">例 · 每周一 09:00 高管周报</div>
                </div>
              </div>
            </div>

            <div className="aw-section">
              <div className="lbl">规则 · RULE</div>
              <div className="aw-thresh">
                <div className="col">
                  <div className="k">指标</div>
                  <select defaultValue="gmv">
                    <option value="gmv">GMV(成交金额)</option>
                  </select>
                </div>
                <div className="col">
                  <div className="k">条件</div>
                  <select defaultValue="lt">
                    <option value="lt">小于(&lt;)</option>
                    <option>大于(&gt;)</option>
                    <option>偏离均值 ±</option>
                  </select>
                </div>
                <div className="col">
                  <div className="k">阈值</div>
                  <input defaultValue="1,500,000"/>
                </div>
                <div className="preview">
                  当 <span className="key">GMV</span>(日值)<span style={{color:'var(--ink-3)'}}>小于</span> <span className="num">¥ 1,500,000</span>,通知 <span style={{color:'var(--ink-3)'}}>·</span> 评估窗口 7 天回看
                </div>
              </div>
            </div>

            <div className="aw-section">
              <div className="lbl">通知渠道 · CHANNELS</div>
              <div className="aw-channels">
                {[
                  ['email','EM','邮件','liwen@acme.com'],
                  ['feishu','FS','飞书','#q3-channel'],
                  ['wechat','WX','企业微信','未配置'],
                  ['webhook','{ }','Webhook','+'],
                ].map(([k, ico, n, sub]) => (
                  <div key={k} className={`ch ${chans.has(k)?'on':''}`} onClick={()=>togCh(k)}>
                    <div className="ico">{ico}</div>
                    <div className="name">{n}</div>
                    <div className="meta">{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="aw-side">
            <span className="lbl">推送预览 · 飞书</span>
            <h3>触发时,大概长这样</h3>

            <div className="aw-preview">
              <div className="top">
                <div className="ix">!</div>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-1)', fontWeight:500}}>DataPulse · 告警</div>
                  <div className="who">异常 · 来自 GMV 日值守望</div>
                </div>
                <div className="when">14:55</div>
              </div>
              <div className="ttl">昨日 <b>GMV 跌破 ¥ 1.5M</b>,创近 6 周新低</div>
              <div className="stat">
                <div className="cell">
                  <div className="k">昨日</div>
                  <div className="v dn">¥ 1.42M</div>
                </div>
                <div className="cell">
                  <div className="k">阈值</div>
                  <div className="v">¥ 1.50M</div>
                </div>
                <div className="cell">
                  <div className="k">WoW</div>
                  <div className="v dn">−18%</div>
                </div>
              </div>
              <div style={{fontSize:12, color:'var(--ink-2)', lineHeight:1.6, padding:'4px 0'}}>
                AI 已找到 3 条最可能原因,点击查看完整异常解释 →
              </div>
              <div className="cta">
                <div className="a">看异常解释</div>
                <div className="b">忽略本次</div>
              </div>
            </div>

            <div className="info">
              所有触发都会留<b>异常历史</b>,30 天可回看。<br/>
              如果短时间内同一规则触发多次,我们会自动<b>合并通知</b>,免得你被打扰。
            </div>
          </div>
        </div>

        <div className="aw-foot">
          <span className="left">规则将作用于 · GMV(已审核 v3)· 时区 Asia/Shanghai</span>
          <span className="spacer"/>
          <button className="btn-ghost">取消</button>
          <button className="btn-ghost">先跑一次回测</button>
          <button className="btn-primary">下一步 · 收件人 →</button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   2. Alert detail — anomaly explanation
   ========================================================= */

function Sparkline() {
  // 14 points; last few dive, anomaly at idx 11
  const pts = [62,58,64,60,66,62,68,64,70,66,72, 38, 42, 40];
  const w = 720, h = 200;
  const stepX = w / (pts.length - 1);
  const maxY = 80, minY = 30;
  const px = i => i * stepX;
  const py = v => h - ((v - minY) / (maxY - minY)) * (h - 24) - 12;
  const path = pts.map((p, i) => `${i===0?'M':'L'}${px(i).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
  const area = `${path} L${px(pts.length-1)},${h} L0,${h} Z`;
  // baseline at 65
  const baseY = py(65);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="adFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="oklch(0.78 0.16 65 / 0.30)"/>
          <stop offset="100%" stopColor="oklch(0.78 0.16 65 / 0.00)"/>
        </linearGradient>
      </defs>
      <line x1="0" y1={baseY} x2={w} y2={baseY}
        stroke="oklch(0.55 0.025 40 / 0.3)"
        strokeDasharray="4 6" strokeWidth="1"/>
      <text x={w-10} y={baseY-6} textAnchor="end"
        fontFamily="var(--font-mono)" fontSize="10"
        fill="var(--ink-3)">阈值 ¥ 1.5M</text>
      <path d={area} fill="url(#adFill)"/>
      <path d={path} stroke="var(--amber-deep)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p)}
          r={i===11?6:3}
          fill={i===11 ? 'var(--terracotta)' : 'var(--paper)'}
          stroke={i===11 ? 'var(--terracotta)' : 'var(--amber-deep)'}
          strokeWidth={i===11 ? 3 : 1.5}/>
      ))}
    </svg>
  );
}

export function AlertDetail() {
  return (
    <div className="p0-frame">
      <AlertDetailLiveBar />
      <div className="ai-scene">
        <P1Top_AL crumbs={['收件箱','告警','GMV 异常 · 9 月 29 日']} badge="未处理" alarm/>
        <div className="ad">
          <div className="ad-main">
            <div className="ad-head">
              <div className="ix">!</div>
              <div className="body">
                <span className="badge">异常告警 · 未处理</span>
                <h1>昨日 <em>GMV 跌破 ¥ 1.5M</em>,创近 6 周新低</h1>
                <div className="meta">
                  <span>触发 · 9-29 09:00</span>
                  <span>· 规则 #r-042 · GMV 日值</span>
                  <span>· 通知给 @数据团队 5 人</span>
                </div>
              </div>
            </div>

            <div className="ad-stats">
              <div className="cell">
                <div className="k">昨日 GMV</div>
                <div className="v dn">¥ 1.42M</div>
                <div className="delta">阈值 ¥ 1.50M</div>
              </div>
              <div className="cell">
                <div className="k">环比 · WoW</div>
                <div className="v dn">−18%</div>
                <div className="delta">上周日 ¥ 1.73M</div>
              </div>
              <div className="cell">
                <div className="k">同比 · YoY</div>
                <div className="v dn">−4.2%</div>
                <div className="delta">去年同期 ¥ 1.48M</div>
              </div>
              <div className="cell">
                <div className="k">订单数</div>
                <div className="v">4,128</div>
                <div className="delta">客单价 ¥ 344(+2%)</div>
              </div>
            </div>

            <div className="ad-chart">
              <div className="ttl">日 GMV · 近 14 天</div>
              <div className="sub">2026-09-16 ~ 09-29 · 单位 ¥ 万 · 阈值线 = ¥ 1.5M</div>
              <div className="plot">
                <div className="yax">
                  <span>240</span>
                  <span>180</span>
                  <span>120</span>
                  <span>60</span>
                </div>
                <Sparkline/>
                <div className="anomaly"/>
                <div className="anomaly-lbl">异常点 · 9-29</div>
              </div>
              <div className="xax">
                <span>09-16</span><span>17</span><span>18</span><span>19</span>
                <span>20</span><span>21</span><span>22</span><span>23</span>
                <span>24</span><span>25</span><span>26</span><span>27</span>
                <span>28</span><span>29</span>
              </div>
            </div>

            <div className="ad-reasons">
              <div className="ttl">可能原因 · AI 自动归因</div>
              <h3>3 条最可能的解释</h3>
              <div className="r">
                <span className="ix">①</span>
                <div className="text">
                  <b>抖音渠道</b> 投放从 22 日开始减半,贡献 GMV 从日均 ¥ 0.48M 降到 ¥ 0.18M。
                  与「市场部活动暂停」时点完全对齐。
                </div>
                <span className="impact">贡献 −¥ 0.30M</span>
              </div>
              <div className="r">
                <span className="ix">②</span>
                <div className="text">
                  <b>私域 · 表单改版</b>(EXP-014)实验组留存 −2.4pt,影响 28-29 日的回购下单。
                </div>
                <span className="impact warn">影响 ≈ ¥ 0.06M</span>
              </div>
              <div className="r">
                <span className="ix">③</span>
                <div className="text">
                  <b>marketing.xlsx</b> 数据源 9-28 未刷新,可能有 1-2 个自营渠道的 GMV 没收进来。已经在重跑,稍后会补上。
                </div>
                <span className="impact warn">未确认</span>
              </div>
            </div>
          </div>

          <div className="ad-side">
            <span className="lbl">下一步 · NEXT</span>
            <h3>建议你做这些</h3>
            <div className="actions">
              <button className="pri">追问:抖音减半前后的 ROI 对比</button>
              <button className="alt">把这张图钉到 Q3 复盘</button>
              <button className="alt">通知 @周晴 看落地页</button>
              <button className="alt">先刷新 marketing.xlsx</button>
              <button className="alt">标记为「已处理」</button>
            </div>

            <span className="lbl">相关告警 · 7 天</span>
            <div className="ad-rel">
              <div className="row">
                <span className="swatch"/>
                <span className="name">D7 留存 WoW −2.4pt</span>
                <span className="when">9-28</span>
              </div>
              <div className="row">
                <span className="swatch warn"/>
                <span className="name">抖音 ROI &lt; 1.2</span>
                <span className="when">9-23</span>
              </div>
              <div className="row">
                <span className="swatch"/>
                <span className="name">订单数 −12% WoW</span>
                <span className="when">9-22</span>
              </div>
            </div>

            <span className="lbl">收到通知的人</span>
            <div className="recipients">
              <span className="av">李</span>
              <span className="av b">陈</span>
              <span className="av c">周</span>
              <span className="av">王</span>
              <span className="av more">+2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
