// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/Admin.jsx
// 阶段 6 真实数据接入：4 个 Admin 子页都用 Live 浮动条
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { v2Api } from '../../../api'
import { useV2Ctx } from '../V2Context'

const { useState: useS_AD } = React;

/* ---------- Live data bars (阶段 6, 仅 admin role) ---------- */

function AuditLiveBar() {
  const { workspace } = useV2Ctx()   // DAT-28 · 工作区改由全局 V2Context 提供
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState([])
  const [err, setErr] = useState(null)
  // DAT-39 · 'workspace' = 仅本工作区;'all' = 全部(含平台级 workspace_id=null 的日志)
  const [scope, setScope] = useState('workspace')

  // scope=all 时不传 workspace_id,后端返回全部(含平台级)
  const wsParam = scope === 'all' ? undefined : (workspace ? workspace.id : undefined)

  useEffect(() => {
    if (!workspace) return
    Promise.all([
      v2Api.listAuditLogs({ workspace_id: wsParam, since_days: 30, limit: 50 }),
      v2Api.auditStats(wsParam, 30),
    ]).then(([l, s]) => { setLogs(l); setStats(s); setErr(null) }).catch(e => setErr(e?.response?.data?.detail || e?.message))
  }, [workspace, scope])

  return (
    <LiveBarAD title="审计日志 · 真实数据 (admin only)" footer={err ? `⚠ ${err}` : `${logs.length} 条 · 30 天 · ${scope === 'all' ? '全部' : '本工作区'}`}>
      <div style={{ display: 'inline-flex', gap: 2, marginRight: 8 }}>
        {[['workspace', '本工作区'], ['all', '全部']].map(([v, label]) => (
          <button key={v} onClick={() => setScope(v)}
            style={{ ...btnGhostAD, ...(scope === v ? { background: 'var(--amber-deep)', color: '#fff' } : {}) }}>{label}</button>
        ))}
      </div>
      <button onClick={async () => {
        if (!workspace) return
        await v2Api.seedAuditLog({ action: 'create', workspace_id: workspace.id, target_type: 'manual_test', target_id: 't-' + Date.now() })
        const l = await v2Api.listAuditLogs({ workspace_id: wsParam, limit: 50 })
        setLogs(l)
      }} style={btnGhostAD}>＋ 造一条</button>
      {stats.length > 0 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        按动作: {stats.slice(0, 4).map(s => `${s.action}(${s.count})`).join(' / ')}
      </span>}
      <div style={{ width: '100%', marginTop: 8, maxHeight: 200, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {logs.length === 0 ? <div style={{ color: 'var(--ink-4)', fontSize: 12 }}>暂无日志</div>
          : logs.map(l => (
            <div key={l.id} style={liveRowAD}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--amber-deep)', textTransform: 'uppercase', padding: '1px 5px', background: 'oklch(0.78 0.16 65 / 0.12)', borderRadius: 4 }}>{l.action}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>actor #{l.actor_user_id}</span>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--ink-2)' }}>
                {l.target_type ? `${l.target_type}/${(l.target_id || '').slice(0, 12)}` : '—'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-4)' }}>{(l.created_at || '').slice(11, 19)}</span>
            </div>
          ))
        }
      </div>
    </LiveBarAD>
  )
}

function BillingLiveBar() {
  const { workspace } = useV2Ctx()   // DAT-28 · 工作区改由全局 V2Context 提供
  const [sub, setSub] = useState(null)
  const [seats, setSeats] = useState(null)
  const [usage, setUsage] = useState(null)
  const [invs, setInvs] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const reload = async () => {
    if (!workspace) return
    try {
      const [s, st, u, iv] = await Promise.all([
        v2Api.getSubscription(workspace.id),
        v2Api.getSeats(workspace.id),
        v2Api.getUsage(workspace.id),
        v2Api.listInvoices(workspace.id),
      ])
      setSub(s); setSeats(st); setUsage(u); setInvs(iv); setErr(null)
    } catch (e) { setErr(e?.response?.data?.detail || e?.message) }
  }
  useEffect(() => { reload() }, [workspace])

  const upgrade = async (plan) => {
    setBusy(true)
    try { await v2Api.upgradePlan({ workspace_id: workspace.id, plan, billing_cycle: 'yearly' }); await reload() }
    finally { setBusy(false) }
  }

  // DAT-29 · 补跑上月月结(全工作区,幂等)
  const closeLastMonth = async () => {
    setBusy(true)
    try {
      const now = new Date()
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)   // 上个自然月
      const out = await v2Api.closeBillingMonth(prev.getFullYear(), prev.getMonth() + 1)
      setErr(null)
      await reload()
      alert(`月结 ${out.period}: 新建 ${out.created} · 覆盖 ${out.updated} · 跳过 ${out.skipped}` + (out.errors ? ` · 失败 ${out.errors}` : ''))
    } catch (e) { setErr(e?.response?.data?.detail || e?.message) }
    finally { setBusy(false) }
  }

  return (
    <LiveBarAD title="账单 · 真实数据 (admin only)" footer={err ? `⚠ ${err}` : null}>
      {sub && <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>当前: <b>{sub.plan}</b> · {sub.billing_cycle || '—'}</span>}
      {seats && <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>席位: {seats.used_count}/{seats.limit_count}</span>}
      {usage && <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>本月: {usage.asks_count} 提问 · {usage.tokens_total} tokens</span>}
      <div style={{ display: 'flex', gap: 6 }}>
        {['free','team','business','enterprise'].map(p => (
          <button key={p} disabled={busy || sub?.plan === p} onClick={() => upgrade(p)}
            style={{ ...btnGhostAD, opacity: sub?.plan === p ? 0.4 : 1 }}>{p}</button>
        ))}
      </div>
      <button disabled={busy} onClick={closeLastMonth} style={btnGhostAD} title="对所有工作区结算上月用量,生成草稿账单(幂等,可重复跑)">补跑上月</button>
      {invs.length > 0 && (
        <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {invs.slice(0, 5).map(inv => (
            <div key={inv.id} style={{ ...liveRowAD, ...(inv.status === 'draft' ? { background: 'var(--surface-2)', borderStyle: 'dashed' } : {}) }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{inv.period_yyyymm}</span>
              <span title={inv.line_items_json ? inv.line_items_json.map(li => `${li.label}: ${(li.amount_cents/100).toFixed(2)}`).join('\n') : undefined}
                style={{ flex: 1, fontSize: 12, cursor: inv.line_items_json ? 'help' : 'default' }}>
                {(inv.amount_cents / 100).toFixed(2)} {inv.currency}
                {inv.line_items_json && <span style={{ color: 'var(--ink-4)', fontSize: 10 }}> · {inv.line_items_json.length} 项</span>}
              </span>
              {inv.status === 'draft' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--amber-soft, oklch(0.74 0.16 75 / 0.15))', color: 'var(--warning)' }}>草稿</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: inv.status === 'paid' ? 'var(--success)' : 'var(--ink-3)' }}>{inv.status}</span>
              {inv.status === 'draft' && (
                <button onClick={async () => { await v2Api.updateInvoiceStatus(inv.id, 'issued'); reload() }} style={btnGhostAD}>标记为 issued</button>
              )}
              {(inv.status === 'draft' || inv.status === 'issued') && (
                <button onClick={async () => { await v2Api.updateInvoiceStatus(inv.id, 'paid'); reload() }} style={btnGhostAD}>标为已支付</button>
              )}
            </div>
          ))}
        </div>
      )}
    </LiveBarAD>
  )
}

function ModelsLiveBar() {
  const { workspace } = useV2Ctx()   // DAT-28 · 工作区改由全局 V2Context 提供
  const [routes, setRoutes] = useState([])
  const [budgets, setBudgets] = useState([])
  const [pattern, setPattern] = useState('')
  const [model, setModel] = useState('deepseek-r1')
  const [busy, setBusy] = useState(false)
  const [evalResult, setEvalResult] = useState(null)

  const reload = async () => {
    if (!workspace) return
    try {
      const [r, b] = await Promise.all([
        v2Api.listModelRoutes(workspace.id),
        v2Api.listModelBudgets(workspace.id),
      ])
      setRoutes(r); setBudgets(b)
    } catch {}
  }
  useEffect(() => { reload() }, [workspace])

  const create = async () => {
    if (!pattern.trim() || !workspace) return
    setBusy(true)
    try {
      await v2Api.createModelRoute({ workspace_id: workspace.id, intent_pattern: pattern.trim(), target_model: model, priority: 100 })
      setPattern(''); reload()
    } finally { setBusy(false) }
  }
  const evaluate = async () => {
    if (!workspace) return
    const intent = window.prompt('输入意图字符串', 'SQL 查询') || ''
    if (!intent) return
    const r = await v2Api.evaluateModelRoute(workspace.id, intent)
    setEvalResult(`「${intent}」→ ${r.matched_model || '(未命中)'}`)
    setTimeout(() => setEvalResult(null), 4000)
  }

  return (
    <LiveBarAD title="模型路由 · 真实数据 (admin only)" footer={evalResult}>
      <input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="intent 子串 (如 SQL)" style={{ minWidth: 160, padding: '4px 8px' }} />
      <select value={model} onChange={e => setModel(e.target.value)}>
        {['deepseek-r1', 'deepseek-v3', 'openai-gpt-4', 'claude-opus', 'gemini-flash'].map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button disabled={busy || !pattern.trim()} onClick={create} style={btnPriAD}>＋ 加路由</button>
      <button onClick={evaluate} style={btnGhostAD}>evaluate</button>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{routes.length} 条路由 · {budgets.length} 个预算</span>
      <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {routes.map(r => (
          <div key={r.id} style={liveRowAD}>
            <span style={{ fontSize: 12 }}><b>{r.intent_pattern}</b> → {r.target_model}</span>
            <span style={{ flex: 1, fontSize: 10, color: 'var(--ink-4)' }}>priority {r.priority}</span>
            <button onClick={async () => { await v2Api.deleteModelRoute(r.id); reload() }} style={{ ...btnGhostAD, color: 'var(--ink-4)' }}>✕</button>
          </div>
        ))}
      </div>
    </LiveBarAD>
  )
}

function ApiKeysLiveBar() {
  const { workspace } = useV2Ctx()   // DAT-28 · 工作区改由全局 V2Context 提供
  const [keys, setKeys] = useState([])
  const [includeRevoked, setIncludeRevoked] = useState(false)
  const [name, setName] = useState('')
  const [revealedKey, setRevealedKey] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    if (!workspace) return
    try { setKeys(await v2Api.listApiKeys(workspace.id, includeRevoked)) } catch {}
  }
  useEffect(() => { reload() }, [workspace, includeRevoked])

  const create = async () => {
    if (!name.trim() || !workspace) return
    setBusy(true)
    try {
      const k = await v2Api.createApiKey({ workspace_id: workspace.id, name: name.trim() })
      setRevealedKey(k.key_plaintext); setName(''); reload()
    } finally { setBusy(false) }
  }
  const rotate = async (kid) => {
    setBusy(true)
    try {
      const nk = await v2Api.rotateApiKey(kid)
      setRevealedKey(nk.key_plaintext); reload()
    } finally { setBusy(false) }
  }
  const revoke = async (kid) => {
    if (!confirm('撤销后该 Key 立即失效。')) return
    await v2Api.revokeApiKey(kid); reload()
  }

  return (
    <LiveBarAD title="API Keys · 真实数据 (admin only)" footer={revealedKey ? `⚠ 仅此一次：${revealedKey.slice(0, 24)}...` : null}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Key 名称（如 CI 集成）" style={{ minWidth: 180, padding: '4px 8px' }} />
      <button disabled={busy || !name.trim()} onClick={create} style={btnPriAD}>＋ 新建</button>
      <label style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        <input type="checkbox" checked={includeRevoked} onChange={e => setIncludeRevoked(e.target.checked)} /> 显示已撤销
      </label>
      <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {keys.map(k => (
          <div key={k.id} style={{ ...liveRowAD, opacity: k.revoked_at ? 0.5 : 1 }}>
            <span style={{ fontSize: 12 }}><b>{k.name}</b></span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{k.key_prefix}...</span>
            <span style={{ flex: 1, fontSize: 10, color: 'var(--ink-4)' }}>
              {k.revoked_at ? `撤销于 ${k.revoked_at.slice(0,16)}` : (k.last_used_at ? `最后使用 ${k.last_used_at.slice(0,16)}` : '从未使用')}
              {k.rotated_from_id && <span> · 由旧 Key 轮换</span>}
            </span>
            {!k.revoked_at && <>
              <button onClick={() => rotate(k.id)} style={btnGhostAD}>轮换</button>
              <button onClick={() => revoke(k.id)} style={{ ...btnGhostAD, color: 'var(--ink-4)' }}>撤销</button>
            </>}
          </div>
        ))}
      </div>
    </LiveBarAD>
  )
}

const liveRowAD = { padding: '6px 10px', background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }
const btnPriAD = { padding: '6px 12px', background: 'var(--amber-deep)', color: 'var(--paper)', border: 0, borderRadius: 6, fontSize: 12, cursor: 'pointer' }
const btnGhostAD = { padding: '4px 10px', background: 'transparent', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }

function LiveBarAD({ title, footer, children }) {
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

/* =========================================================
   Admin · Audit / API keys / Models / Billing
   ========================================================= */

function AdmSide({ on }) {
  return (
    <div className="adm-side">
      <div className="brand"><span className="dot"/>DataPulse</div>
      <div className="group">合规 · COMPLIANCE</div>
      <a className={on==='audit'?'on':''}><span className="ix">▸</span>审计日志</a>
      <a><span className="ix">·</span>会话留痕</a>
      <a><span className="ix">·</span>数据脱敏</a>
      <div className="group">访问 · ACCESS</div>
      <a className={on==='keys'?'on':''}><span className="ix">▸</span>API Key</a>
      <a><span className="ix">·</span>OAuth 应用</a>
      <a><span className="ix">·</span>SSO 配置</a>
      <div className="group">资源 · RESOURCES</div>
      <a className={on==='models'?'on':''}><span className="ix">▸</span>模型与算力</a>
      <a><span className="ix">·</span>沙箱配额</a>
      <a className={on==='billing'?'on':''}><span className="ix">▸</span>账单与套餐</a>
      <div className="group">系统 · SYSTEM</div>
      <a><span className="ix">·</span>服务健康</a>
      <a><span className="ix">·</span>导出 / 备份</a>
    </div>
  );
}

/* =========================================================
   1. Audit log
   ========================================================= */

const AUDIT = [
  { t:'14:48:21', who:{n:'李文', av:'李', cls:''},  verb:'create', cls:'c', target:'看板 · Q3 渠道复盘', meta:'12 节点',          ip:'10.4.21.18'  },
  { t:'14:32:09', who:{n:'陈昊', av:'陈', cls:'b'}, verb:'update', cls:'u', target:'指标 · gmv', meta:'v3 口径修订',                ip:'10.4.21.42'  },
  { t:'14:28:54', who:{n:'李文', av:'李', cls:''},  verb:'invite', cls:'c', target:'成员 · sunyu@acme.com',  meta:'访客角色',          ip:'10.4.21.18'  },
  { t:'14:08:11', who:{n:'周晴', av:'周', cls:'c'}, verb:'share',  cls:'c', target:'节点 · #04 抖音 vs 私域', meta:'→ @销售 14 人',     ip:'10.4.22.06'  },
  { t:'13:56:32', who:{n:'API · pulse-cli', av:'A', cls:'sys'}, verb:'query', cls:'u', target:'datasource · events_olap', meta:'扫描 2.4M 行', ip:'10.4.22.91' },
  { t:'13:48:02', who:{n:'李文', av:'李', cls:''},  verb:'export', cls:'c', target:'看板 · Q3 渠道复盘 · PDF', meta:'18 页 · 4.2MB',     ip:'10.4.21.18'  },
  { t:'13:22:45', who:{n:'陈昊', av:'陈', cls:'b'}, verb:'delete', cls:'d', target:'节点 · #11 临时草稿',     meta:'软删除 · 30 天可恢复', ip:'10.4.21.42' },
  { t:'12:54:18', who:{n:'王萌', av:'王', cls:''},  verb:'login',  cls:'c', target:'会话 · macOS Chrome',     meta:'SSO 飞书',           ip:'10.4.21.78' },
  { t:'12:10:33', who:{n:'API · pulse-sdk', av:'A', cls:'sys'}, verb:'create', cls:'c', target:'订阅 · GMV 异常守望',     meta:'阈值 ¥ 1.5M',     ip:'10.4.22.91' },
  { t:'11:48:00', who:{n:'李文', av:'李', cls:''},  verb:'revoke', cls:'d', target:'API Key · production-ro', meta:'轮换 · 替换为 v3',    ip:'10.4.21.18' },
];

export function AdminAudit() {
  return (
    <div className="p0-frame">
      <AuditLiveBar />
      <div className="adm-shell">
        <AdmSide on="audit"/>
        <div className="adm-main">
          <div className="adm-head">
            <div>
              <span className="sub">合规 · 审计日志</span>
              <h1>谁,什么时候,改了什么</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">导出 CSV</button>
              <button className="btn-ghost">订阅每周摘要</button>
            </div>
          </div>

          <div className="adm-stats">
            <div className="adm-stat">
              <div className="k">今日事件</div>
              <div className="v"><em>284</em></div>
              <div className="delta up">+12% vs 昨</div>
            </div>
            <div className="adm-stat">
              <div className="k">写入 · 30 天</div>
              <div className="v">1,842</div>
              <div className="delta">平均 61 / 天</div>
            </div>
            <div className="adm-stat">
              <div className="k">删除 · 30 天</div>
              <div className="v">42</div>
              <div className="delta dn">+3 异常</div>
            </div>
            <div className="adm-stat">
              <div className="k">API 调用</div>
              <div className="v">96.4k</div>
              <div className="delta up">+18% MoM</div>
            </div>
          </div>

          <div className="adm-filters">
            <div className="adm-search">
              <span style={{color:'var(--ink-4)'}}>⌕</span>
              <input placeholder="搜对象、邮箱、IP、动作..." defaultValue=""/>
            </div>
            <span className="adm-chip on">全部 · 1,842</span>
            <span className="adm-chip">创建 · 412</span>
            <span className="adm-chip">修改 · 968</span>
            <span className="adm-chip">删除 · 42</span>
            <span className="adm-chip">分享 · 220</span>
            <span style={{flex:1}}/>
            <span className="adm-chip">最近 30 天</span>
          </div>

          <div className="adm-tbl">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作人</th>
                  <th>动作</th>
                  <th>对象</th>
                  <th>IP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {AUDIT.map((r, i) => (
                  <tr key={i}>
                    <td><span className="when">2026-09-30 {r.t}</span></td>
                    <td>
                      <div className="who">
                        <div className={`av ${r.who.cls}`}>{r.who.av}</div>
                        {r.who.n}
                      </div>
                    </td>
                    <td><span className={`verb ${r.cls}`}>{r.verb}</span></td>
                    <td><span className="target">{r.target}<em>· {r.meta}</em></span></td>
                    <td><span className="ip">{r.ip}</span></td>
                    <td><span className="row-actions">详情 ›</span></td>
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

/* =========================================================
   2. API keys
   ========================================================= */

export function AdminApiKeys() {
  return (
    <div className="p0-frame">
      <ApiKeysLiveBar />
      <div className="adm-shell">
        <AdmSide on="keys"/>
        <div className="adm-main">
          <div className="adm-head">
            <div>
              <span className="sub">访问 · API KEY</span>
              <h1>API Key 与凭据</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">查看文档 →</button>
              <button className="btn-primary">+ 新建 Key</button>
            </div>
          </div>

          <div className="adm-stats">
            <div className="adm-stat">
              <div className="k">活跃 Key</div>
              <div className="v"><em>4</em></div>
              <div className="delta">共 5 个上限</div>
            </div>
            <div className="adm-stat">
              <div className="k">本月调用</div>
              <div className="v">96.4k</div>
              <div className="delta up">+18% MoM</div>
            </div>
            <div className="adm-stat">
              <div className="k">本月限额</div>
              <div className="v">200k</div>
              <div className="delta">48.2% 已用</div>
            </div>
            <div className="adm-stat">
              <div className="k">下次轮换</div>
              <div className="v">12 天</div>
              <div className="delta">production-ro</div>
            </div>
          </div>

          <div className="p0-eyebrow" style={{display:'block', marginBottom:10}}>当前 Key · 4</div>

          {[
            { name:'production-ro', tag:'live',  key:'sk_live_8fa3…91ce', last:'刚刚',     usage:'12.8k', perm:'只读 · 查询',  by:'李文' },
            { name:'production-rw', tag:'live',  key:'sk_live_42da…07bf', last:'2 分钟前', usage:'48.1k', perm:'读 / 写',     by:'陈昊' },
            { name:'dashboards-bi', tag:'live',  key:'sk_live_6c19…b3a7', last:'1 小时前', usage:'33.6k', perm:'只读 · 看板',  by:'李文' },
            { name:'staging-test',  tag:'test',  key:'sk_test_a190…2d4e', last:'昨天',     usage:'1.9k',  perm:'读 / 写',     by:'陈昊' },
          ].map(k => (
            <div key={k.name} className="adm-keycard">
              <div className="body">
                <div className="name">
                  <span className="n">{k.name}</span>
                  <span className={`pill ${k.tag}`}>{k.tag}</span>
                </div>
                <div className="key">
                  <span>{k.key}</span>
                  <span className="reveal">显示</span>
                  <span className="reveal">复制</span>
                </div>
              </div>
              <div className="col">
                <div className="k">最近调用</div>
                <div className="v">{k.last}</div>
              </div>
              <div className="col">
                <div className="k">本月 / 调用</div>
                <div className="v up">{k.usage}</div>
              </div>
              <div className="col">
                <div className="k">权限</div>
                <div className="v">{k.perm}</div>
              </div>
              <div className="actions">
                <a>轮换</a>
                <a>限额</a>
                <a className="danger">吊销</a>
              </div>
            </div>
          ))}

          <div style={{marginTop:24, padding:'18px 22px', background:'oklch(0.78 0.16 65 / 0.06)',
            border:'1px solid oklch(0.78 0.16 65 / 0.3)', borderRadius:'var(--r-xl)',
            display:'flex', gap:14, alignItems:'center'}}>
            <div style={{width:36, height:36, borderRadius:8, background:'var(--amber)',
              color:'var(--ink-1)', display:'grid', placeItems:'center',
              fontFamily:'var(--font-serif)', fontSize:18}}>!</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14, color:'var(--ink-1)', fontWeight:500, marginBottom:2}}>建议每 90 天轮换一次 production Key</div>
              <div style={{fontSize:12, color:'var(--ink-3)', lineHeight:1.5}}>
                我们会提前 14 天提醒你,并在新 Key 启用后保留旧 Key 7 天作过渡。<a style={{color:'var(--amber-deep)', cursor:'pointer'}}>开启自动轮换 →</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   3. Model usage + compute
   ========================================================= */

function Ring({ pct }) {
  const r = 70, c = 2 * Math.PI * r;
  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r={r} fill="none"
        stroke="var(--paper-2)" strokeWidth="14"/>
      <circle cx="80" cy="80" r={r} fill="none"
        stroke="var(--amber-deep)" strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 80 80)"/>
    </svg>
  );
}

export function AdminModels() {
  return (
    <div className="p0-frame">
      <ModelsLiveBar />
      <div className="adm-shell">
        <AdmSide on="models"/>
        <div className="adm-main">
          <div className="adm-head">
            <div>
              <span className="sub">资源 · 模型与算力</span>
              <h1>这个月烧了哪些模型?</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">⌚ 30 天</button>
              <button className="btn-ghost">导出</button>
            </div>
          </div>

          <div className="adm-models">
            <div>
              <div className="adm-mcards">
                {[
                  { ic:'DR1', cls:'',  name:'DeepSeek R1',     desc:'对话主路由 · 大窗口',    q:'48,210', tok:'62.4M',  cost:'¥ 412.8',  pct: 0.62 },
                  { ic:'GPT', cls:'b', name:'GPT-4o',          desc:'兜底 / 中英混合',        q:'14,602', tok:'9.1M',   cost:'¥ 188.0',  pct: 0.31 },
                  { ic:'CL3', cls:'c', name:'Claude Sonnet',   desc:'长上下文 · 思维链',     q:'8,914',  tok:'14.2M',  cost:'¥ 224.6',  pct: 0.42 },
                  { ic:'EMB', cls:'d', name:'BGE Embedding',   desc:'语义层 / 向量召回',     q:'182k',   tok:'—',      cost:'¥ 48.2',   pct: 0.18 },
                ].map(m => (
                  <div key={m.name} className="adm-mcard">
                    <div className="head">
                      <div className={`badge ${m.cls}`}>{m.ic}</div>
                      <div>
                        <div className="name">{m.name}</div>
                        <div className="desc">{m.desc}</div>
                      </div>
                      <span className="status">在线</span>
                    </div>
                    <div className="grid">
                      <div className="cell">
                        <div className="k">请求 · 30d</div>
                        <div className="v">{m.q}</div>
                      </div>
                      <div className="cell">
                        <div className="k">Token</div>
                        <div className="v">{m.tok}</div>
                      </div>
                      <div className="cell">
                        <div className="k">成本</div>
                        <div className="v"><em>{m.cost}</em></div>
                      </div>
                    </div>
                    <div className="bar">
                      <div className="fill" style={{width:`${m.pct * 100}%`}}/>
                    </div>
                    <div className="bar-label">
                      <span>占月度预算 {Math.round(m.pct * 100)}%</span>
                      <span>预算 ¥ {Math.round(parseFloat(m.cost.replace(/[^\d.]/g,'')) / m.pct)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                background:'var(--paper)',
                border:'1px solid var(--line-1)', borderRadius:'var(--r-xl)',
                padding:'18px 22px'}}>
                <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.2em',
                  textTransform:'uppercase', color:'var(--ink-3)', marginBottom:14}}>
                  路由策略 · ROUTING
                </div>
                {[
                  ['Standard · 闲聊 + 简单 SQL', 'DeepSeek R1', 'DR1'],
                  ['Scientist · 沙箱 Python + HITL', 'Claude Sonnet', 'CL3'],
                  ['Deep / RAG · 知识库召回', 'BGE → DeepSeek R1', 'EMB'],
                  ['兜底 · 主路由超时 / 限流', 'GPT-4o', 'GPT'],
                ].map(([k, v, ic]) => (
                  <div key={k} style={{display:'flex', alignItems:'center', gap:14,
                    padding:'10px 0', borderBottom:'1px dashed var(--line-2)'}}>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:11,
                      color:'var(--ink-3)', width:240, letterSpacing:'0.06em'}}>{k}</span>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-4)'}}>→</span>
                    <div style={{width:28, height:28, borderRadius:6,
                      background:'var(--paper-2)', border:'1px solid var(--line-1)',
                      display:'grid', placeItems:'center',
                      fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-2)', fontWeight:600}}>{ic}</div>
                    <span style={{flex:1, fontSize:13, color:'var(--ink-1)'}}>{v}</span>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--amber-deep)', cursor:'pointer'}}>编辑</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="adm-quota">
              <div className="ttl">月度预算 · BUDGET</div>
              <div className="ring">
                <Ring pct={0.54}/>
                <div className="num"><em>54%</em></div>
              </div>
              <div className="meta">
                <b style={{color:'var(--ink-1)', fontFamily:'var(--font-sans)'}}>¥ 873.6</b> / ¥ 1,620<br/>
                月底预计 ¥ 1,486 · 不会超
              </div>
              <hr/>
              <div className="field">
                <span className="k">沙箱 vCPU</span>
                <span className="v">8 / 16</span>
              </div>
              <div className="field">
                <span className="k">沙箱 RAM</span>
                <span className="v">12 / 32 GB</span>
              </div>
              <div className="field">
                <span className="k">RAG 向量库</span>
                <span className="v">42 / 100 GB</span>
              </div>
              <div className="field">
                <span className="k">月度限额</span>
                <span className="v">¥ 1,620</span>
              </div>
              <div style={{marginTop:16, padding:'10px 12px',
                background:'oklch(0.78 0.16 65 / 0.08)', borderRadius:'var(--r-md)',
                fontFamily:'var(--font-mono)', fontSize:11, color:'var(--amber-deep)',
                letterSpacing:'0.06em', textAlign:'center', cursor:'pointer'}}>
                提升到企业版 →
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   4. Billing
   ========================================================= */

export function AdminBilling() {
  return (
    <div className="p0-frame">
      <BillingLiveBar />
      <div className="adm-shell">
        <AdmSide on="billing"/>
        <div className="adm-main">
          <div className="adm-head">
            <div>
              <span className="sub">资源 · 账单与套餐</span>
              <h1>账单 · 套餐</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">下载发票</button>
              <button className="btn-ghost">付款方式</button>
            </div>
          </div>

          <div className="bil-plan">
            <div className="left">
              <span className="tag">当前 · CURRENT PLAN</span>
              <h2><em>Team</em> · 50 席位</h2>
              <div className="sub">月度计费 · 下次扣款 2026-10-15 · ¥ 4,800</div>
            </div>
            <div className="right">
              <button className="btn-ghost">管理席位</button>
              <button className="btn-primary">升级到 Enterprise →</button>
            </div>
          </div>

          <div className="bil-stats">
            <div className="bil-stat">
              <div className="k">席位 · SEATS</div>
              <div className="row">
                <span className="v">42 / 50</span>
                <span className="limit">余 8</span>
              </div>
              <div className="bar"><div className="fill" style={{width:'84%'}}/></div>
              <div className="reset">下月 1 日重置</div>
            </div>
            <div className="bil-stat">
              <div className="k">月度提问</div>
              <div className="row">
                <span className="v">12.4k / 50k</span>
                <span className="limit">余 37.6k</span>
              </div>
              <div className="bar"><div className="fill" style={{width:'24.8%'}}/></div>
              <div className="reset">下月 1 日重置</div>
            </div>
            <div className="bil-stat">
              <div className="k">沙箱算力 · vCPU·h</div>
              <div className="row">
                <span className="v">842 / 1,000</span>
                <span className="limit" style={{color:'var(--warning)'}}>余 158</span>
              </div>
              <div className="bar"><div className="fill warn" style={{width:'84.2%'}}/></div>
              <div className="reset">下月 1 日重置</div>
            </div>
          </div>

          <div className="bil-invoices">
            <div className="hd">
              <span className="lbl">账单历史 · 12 个月</span>
              <span className="right">
                <button className="btn-ghost">导出 PDF</button>
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>账期</th>
                  <th>说明</th>
                  <th>编号</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[
                  { p:'2026-09', d:'Team · 50 席位 · 月度', n:'INV-26092-001', a:'¥ 4,800', s:'paid', sn:'已付' },
                  { p:'2026-09', d:'按量超额 · 沙箱 vCPU·h × 142', n:'INV-26092-002', a:'¥ 142.0', s:'due',  sn:'待付' },
                  { p:'2026-08', d:'Team · 50 席位 · 月度', n:'INV-26082-001', a:'¥ 4,800', s:'paid', sn:'已付' },
                  { p:'2026-08', d:'席位扩容 · +5(8 月 12 日起)', n:'INV-26082-002', a:'¥ 280', s:'paid', sn:'已付' },
                  { p:'2026-07', d:'Team · 45 席位 · 月度', n:'INV-26072-001', a:'¥ 4,320', s:'paid', sn:'已付' },
                  { p:'2026-06', d:'Team · 45 席位 · 月度', n:'INV-26062-001', a:'¥ 4,320', s:'paid', sn:'已付' },
                ].map((r, i) => (
                  <tr key={i}>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>{r.p}</span></td>
                    <td>{r.d}</td>
                    <td><span className="num">{r.n}</span></td>
                    <td><span className="amt">{r.a}</span></td>
                    <td><span className={`status ${r.s}`}>● {r.sn}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--amber-deep)', cursor:'pointer'}}>↓ PDF</span></td>
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
