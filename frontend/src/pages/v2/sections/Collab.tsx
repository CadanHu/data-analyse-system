// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/Collab.jsx
// 阶段 4 真实数据接入：ShareLiveBar / NotifLiveBar 浮动条
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { v2Api } from '../../../api'

const { useState: useS_CL } = React;

/* ---------- Live data bars (阶段 4) ---------- */

function ShareLiveBar() {
  const [workspace, setWorkspace] = useState(null)
  const [boards, setBoards] = useState([])
  const [sessions, setSessions] = useState([])
  const [targetType, setTargetType] = useState('board')
  const [targetId, setTargetId] = useState('')
  const [permission, setPermission] = useState('view')
  const [expiresDays, setExpiresDays] = useState(7)
  const [links, setLinks] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { v2Api.getCurrentWorkspace().then(setWorkspace).catch(() => {}) }, [])
  useEffect(() => {
    if (!workspace) return
    v2Api.listBoards(workspace.id).then(setBoards).catch(() => {})
    v2Api.listSessions(workspace.id).then(setSessions).catch(() => {})
  }, [workspace])

  const reloadLinks = async () => {
    if (!targetType || !targetId) { setLinks([]); return }
    try { setLinks(await v2Api.listShareLinks(targetType, targetId)) } catch {}
  }
  useEffect(() => { reloadLinks() }, [targetType, targetId])

  const options = targetType === 'board' ? boards : sessions
  const create = async () => {
    if (!targetId) return
    setBusy(true); setMsg(null)
    try {
      const link = await v2Api.createShareLink(targetType, targetId, permission, expiresDays || undefined)
      setMsg(`链接已生成: /shared/${link.token.slice(0, 12)}...`)
      reloadLinks()
    } catch (e) { setMsg(`失败: ${e?.message || e}`) }
    finally { setBusy(false); setTimeout(() => setMsg(null), 3500) }
  }
  const revoke = async (id) => {
    setBusy(true)
    try { await v2Api.revokeShareLink(id); reloadLinks() }
    catch (e) { setMsg(`撤销失败: ${e?.message || e}`); setTimeout(() => setMsg(null), 3000) }
    finally { setBusy(false) }
  }

  return (
    <LiveBarCL title="分享链接 · 真实数据" footer={msg}>
      <Inline label="目标">
        <select value={targetType} onChange={e => { setTargetType(e.target.value); setTargetId('') }}>
          <option value="board">board</option>
          <option value="session">session</option>
        </select>
      </Inline>
      <Inline label="选择">
        <select value={targetId} onChange={e => setTargetId(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">{targetType === 'board' ? `选看板…(${boards.length})` : `选会话…(${sessions.length})`}</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.title || o.name || o.id.slice(0,8)}</option>)}
        </select>
      </Inline>
      <Inline label="权限">
        <select value={permission} onChange={e => setPermission(e.target.value)}>
          <option value="view">仅查看</option>
          <option value="comment">可评论</option>
          <option value="edit">可编辑</option>
        </select>
      </Inline>
      <Inline label="过期">
        <input type="number" value={expiresDays} onChange={e => setExpiresDays(parseInt(e.target.value || '0'))} style={{ width: 60 }} /> 天
      </Inline>
      <button disabled={busy || !targetId} onClick={create} style={btnPri}>{busy ? '...' : '生成链接'}</button>

      {links.length > 0 && (
        <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {links.map(l => (
            <div key={l.id} style={liveRow}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: l.revoked_at ? 'var(--ink-4)' : 'var(--ink-1)', flex: 1, textDecoration: l.revoked_at ? 'line-through' : 'none' }}>
                {l.token.slice(0, 24)}...
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{l.permission}</span>
              {l.revoked_at ? <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>已撤销</span>
                : <button onClick={() => revoke(l.id)} style={btnGhost}>撤销</button>}
            </div>
          ))}
        </div>
      )}
    </LiveBarCL>
  )
}

function NotifLiveBar() {
  const [list, setList] = useState([])
  const [unread, setUnread] = useState(0)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    try {
      const [items, cnt] = await Promise.all([
        v2Api.listNotifications(false, 20),
        v2Api.countUnreadNotifications(),
      ])
      setList(items); setUnread(cnt.unread || 0)
    } catch {}
  }
  useEffect(() => { reload() }, [])

  const markOne = async (id) => { await v2Api.markNotificationRead(id); reload() }
  const markAll = async () => {
    setBusy(true)
    try { await v2Api.markAllNotificationsRead(); await reload() } finally { setBusy(false) }
  }
  const del = async (id) => { await v2Api.deleteNotification(id); reload() }

  return (
    <LiveBarCL title={`通知中心 · 真实数据 · ${unread} 条未读`}>
      <button onClick={reload} style={btnGhost}>刷新</button>
      <button onClick={markAll} disabled={busy || unread === 0} style={btnGhost}>全部已读</button>
      <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>共 {list.length} 条</span>

      {list.length === 0 ? (
        <div style={{ width: '100%', padding: '8px 0', color: 'var(--ink-4)', fontSize: 12 }}>
          收件箱是空的。可用 POST /api/v2/notifications/_seed 灌测试数据。
        </div>
      ) : (
        <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {list.map(n => (
            <div key={n.id} style={{ ...liveRow, opacity: n.read_at ? 0.55 : 1 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--amber-deep)', textTransform: 'uppercase', padding: '1px 5px', background: 'oklch(0.78 0.16 65 / 0.12)', borderRadius: 4 }}>{n.type}</span>
              <span style={{ flex: 1, fontSize: 12 }}>
                {(n.payload_json?.title) || '(无标题)'} {n.payload_json?.body && <span style={{ color: 'var(--ink-3)' }}>· {n.payload_json.body}</span>}
              </span>
              {!n.read_at && <button onClick={() => markOne(n.id)} style={btnGhost}>已读</button>}
              <button onClick={() => del(n.id)} style={{ ...btnGhost, color: 'var(--ink-4)' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </LiveBarCL>
  )
}

const liveRow = { padding: '6px 10px', background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }
const btnPri = { padding: '6px 12px', background: 'var(--amber-deep)', color: 'var(--paper)', border: 0, borderRadius: 6, fontSize: 12, cursor: 'pointer' }
const btnGhost = { padding: '4px 10px', background: 'transparent', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }

function LiveBarCL({ title, footer, children }) {
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

function Inline({ label, children }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-3)' }}>{label}: {children}</label>
}

/* =========================================================
   Collab · ShareDialog / NotificationCenter / TeamWorkspace
   ========================================================= */

function P1Top({ crumbs = ['工作区','Q3 渠道复盘'], badge, clock='14:48 · main' }) {
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
   1. Share dialog
   ========================================================= */

export function ShareDialog() {
  const [tab, setTab] = useS_CL('people');
  return (
    <div className="p0-frame">
      <ShareLiveBar />
      <div className="ai-scene">
        <P1Top crumbs={['工作区','Q3 渠道复盘']} badge="分享设置"/>
        <div className="shr-stage">
          <div className="shr-bg">
            <div style={{fontFamily:'var(--font-serif)', fontSize:20, marginBottom:8}}>Q3 渠道复盘</div>
            <div style={{height:140, background:'var(--paper-2)', borderRadius:'var(--r-md)', marginBottom:8}}/>
            <div style={{height:80, background:'var(--paper-2)', borderRadius:'var(--r-md)'}}/>
          </div>

          <div className="shr">
            <div className="shr-head">
              <span className="eyebrow">分享 · SHARE</span>
              <h3>分享「Q3 渠道复盘」</h3>
              <div className="sub">看板 · 含 12 个节点 · 你是所有人</div>
            </div>

            <div className="shr-tabs">
              <button className={tab==='people'?'on':''} onClick={()=>setTab('people')}>指定人 · 5</button>
              <button className={tab==='link'?'on':''} onClick={()=>setTab('link')}>链接分享</button>
              <button className={tab==='public'?'on':''} onClick={()=>setTab('public')}>嵌入 / 公开</button>
            </div>

            <div className="shr-body">
              <div className="shr-search">
                <span style={{color:'var(--ink-4)'}}>＋</span>
                <input placeholder="搜同事姓名、邮箱、或 @团队..." defaultValue=""/>
                <span className="perm">可追问</span>
              </div>

              <div className="shr-ppl">
                <div className="row">
                  <div className="av">李</div>
                  <div className="who">
                    <div className="name">李文 <span style={{color:'var(--ink-4)', fontSize:11, fontFamily:'var(--font-mono)', marginLeft:6}}>(你)</span></div>
                    <div className="meta">liwen@acme.com · 数据团队</div>
                  </div>
                  <span className="perm owner">所有人</span>
                </div>
                <div className="row">
                  <div className="av b">陈</div>
                  <div className="who">
                    <div className="name">陈昊</div>
                    <div className="meta">chenhao@acme.com · 数据团队</div>
                  </div>
                  <span className="perm">可编辑</span>
                </div>
                <div className="row">
                  <div className="av c">周</div>
                  <div className="who">
                    <div className="name">周晴</div>
                    <div className="meta">zhouqing@acme.com · 增长团队</div>
                  </div>
                  <span className="perm">可追问</span>
                </div>
                <div className="row">
                  <div className="av team">销</div>
                  <div className="who">
                    <div className="name">@销售团队</div>
                    <div className="meta">14 人 · 邮件组同步</div>
                  </div>
                  <span className="perm">仅查看</span>
                </div>
                <div className="row">
                  <div className="av team">高</div>
                  <div className="who">
                    <div className="name">@高管周报</div>
                    <div className="meta">5 人 · 自动接收周报</div>
                  </div>
                  <span className="perm">仅查看</span>
                </div>
              </div>

              <div className="shr-perms-info">
                <b>仅查看</b> · 只能看图,不能追问 / 编辑<br/>
                <b>可追问</b> · 能在已有节点下继续提问,产物算自己的<br/>
                <b>可编辑</b> · 能修改 SQL、删除节点、调整看板布局
              </div>

              <div className="shr-link">
                <div className="head">
                  <div className="ico">⌘</div>
                  <div className="ttl">
                    <div className="name">用链接分享</div>
                    <div className="sub">acme 内任何人 · 仅查看</div>
                  </div>
                  <div className="toggle"/>
                </div>
                <div className="url">
                  <span className="u">https://acme.datapulse.cn/b/q3-channel/share?t=8fa…</span>
                  <button>复制</button>
                </div>
              </div>
            </div>

            <div className="shr-foot">
              <span className="left">5 人 · 2 个团队 · 设置变更将立即生效</span>
              <span className="spacer"/>
              <button className="btn-ghost">取消</button>
              <button className="btn-primary">发送邀请 · 5 人</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   2. Notification center
   ========================================================= */

export function NotificationCenter() {
  const [filter, setFilter] = useS_CL('all');
  return (
    <div className="p0-frame">
      <NotifLiveBar />
      <div className="notif">
        <div className="notif-side">
          <div className="brand"><span className="dot"/>DataPulse</div>
          <div className="group">收件箱 · INBOX</div>
          <a className="on">全部 <span className="cnt">12</span></a>
          <a>@ 提到我 <span className="cnt">3</span></a>
          <a>评论 <span className="cnt">5</span></a>
          <a>订阅产出 <span className="cnt">2</span></a>
          <a>异常告警 <span className="cnt">2</span></a>
          <a>系统</a>
          <div className="group">已存档</div>
          <a>已读</a>
          <a>归档 · 30 天</a>
          <div style={{flex:1}}/>
          <div className="group">设置</div>
          <a>提醒偏好</a>
        </div>

        <div className="notif-main">
          <div className="notif-head">
            <div>
              <span className="p0-eyebrow">收件箱 · 12 未读</span>
              <h1>有 3 件事在等你</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">全部标为已读</button>
              <button className="btn-ghost">提醒设置</button>
            </div>
          </div>

          <div className="notif-filters">
            <button className={filter==='all'?'on':''}    onClick={()=>setFilter('all')}>全部 <span className="cnt">12</span></button>
            <button className={filter==='need'?'on':''}   onClick={()=>setFilter('need')}>需要你处理 <span className="cnt">3</span></button>
            <button className={filter==='cmt'?'on':''}    onClick={()=>setFilter('cmt')}>评论</button>
            <button className={filter==='at'?'on':''}     onClick={()=>setFilter('at')}>@提及</button>
            <button className={filter==='sub'?'on':''}    onClick={()=>setFilter('sub')}>订阅产出</button>
            <button className={filter==='alert'?'on':''}  onClick={()=>setFilter('alert')}>异常</button>
          </div>

          <div className="notif-day">今天 · 09 月 30 日</div>

          <div className="notif-item unread">
            <div className="av b">陈<span className="badge at">@</span></div>
            <div className="body">
              <div className="top">
                <span className="name">陈昊</span>
                <span className="verb">在 <span className="where">Q3 渠道复盘 · 节点 #04</span> 提到了你</span>
              </div>
              <div className="quote">
                私域第二阶段流失明显高于抖音,<span className="at">@李文</span> 看看落地页有没有问题?
              </div>
              <div className="actions">
                <button className="pri">查看并回复</button>
                <button className="alt">标记已读</button>
              </div>
            </div>
            <div className="when"><span className="dot"/>12 分钟前</div>
          </div>

          <div className="notif-item unread">
            <div className="av sys">!<span className="badge al">!</span></div>
            <div className="body">
              <div className="top">
                <span className="name">告警 · GMV 异常</span>
                <span className="verb">触发了你的订阅 · <span className="where">日 GMV 周环比降幅 ≥ 5%</span></span>
              </div>
              <div className="quote">
                昨日 GMV <b style={{color:'var(--terracotta)'}}>¥ 1.62M(-8.4% WoW)</b> 创近 6 周新低。AI 给出 3 条可能原因。
              </div>
              <div className="actions">
                <button className="pri">看异常解释</button>
                <button className="alt">忽略本次</button>
              </div>
            </div>
            <div className="when"><span className="dot"/>1 小时前</div>
          </div>

          <div className="notif-item unread">
            <div className="av c">周<span className="badge cm">●</span></div>
            <div className="body">
              <div className="top">
                <span className="name">周晴</span>
                <span className="verb">回复了你在 <span className="where">EXP-014 留存</span> 的评论</span>
              </div>
              <div className="quote">
                我去拉了 8 月表单改版的 A/B 对照,EXP-014 控制组留存 +1.2pt,实验组 -2.4pt,大概率是它影响的。
              </div>
              <div className="actions">
                <button className="alt">查看上下文</button>
              </div>
            </div>
            <div className="when"><span className="dot"/>2 小时前</div>
          </div>

          <div className="notif-day">昨天 · 09 月 29 日</div>

          <div className="notif-item">
            <div className="av sys"><span style={{fontFamily:'var(--font-serif)', fontSize:14}}>w</span><span className="badge sub">↻</span></div>
            <div className="body">
              <div className="top">
                <span className="name">周报订阅</span>
                <span className="verb">「高管周报 · 第 39 周」已发送给 <span className="where">@高管周报 5 人</span></span>
              </div>
              <div className="quote">
                本周 GMV ¥ 12.4M(+8.2% WoW)· 新增 8.9k 用户 · 私域渠道贡献占比从 12% 升至 17%。
              </div>
            </div>
            <div className="when">昨天 09:00</div>
          </div>

          <div className="notif-item">
            <div className="av">张<span className="badge cm">●</span></div>
            <div className="body">
              <div className="top">
                <span className="name">张磊</span>
                <span className="verb">点赞了你的 <span className="where">华东漏斗 · 节点 #08</span></span>
              </div>
            </div>
            <div className="when">昨天 18:24</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   3. Team workspace · members + roles
   ========================================================= */

export function TeamWorkspace() {
  const [role, setRole] = useS_CL('analyst');
  return (
    <div className="p0-frame">
      <div className="team">
        <div className="team-side">
          <div className="brand"><span className="dot"/>DataPulse</div>
          <div className="group">工作区 · WORKSPACE</div>
          <a><span className="ix">·</span>概览</a>
          <a className="on"><span className="ix">▸</span>成员与角色</a>
          <a><span className="ix">·</span>团队 / 邮件组</a>
          <a><span className="ix">·</span>审批流</a>
          <div className="group">设置</div>
          <a><span className="ix">·</span>数据源</a>
          <a><span className="ix">·</span>指标中心</a>
          <a><span className="ix">·</span>权限与脱敏</a>
          <div className="group">合规</div>
          <a><span className="ix">·</span>审计日志</a>
          <a><span className="ix">·</span>会话留痕</a>
        </div>

        <div className="team-main">
          <div className="team-head">
            <div>
              <span className="sub">工作区 · acme.datapulse.cn</span>
              <h1>成员与角色</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">导入(CSV)</button>
              <button className="btn-primary">+ 邀请成员</button>
            </div>
          </div>

          <div className="team-stats">
            <div className="cell">
              <div className="label">总成员</div>
              <div className="val"><em>42</em></div>
              <div className="delta">+3 本周</div>
            </div>
            <div className="cell">
              <div className="label">活跃 · 7 天</div>
              <div className="val">38</div>
              <div className="delta">90.5%</div>
            </div>
            <div className="cell">
              <div className="label">月度提问</div>
              <div className="val">1,284</div>
              <div className="delta">+18%</div>
            </div>
            <div className="cell">
              <div className="label">席位 · 余</div>
              <div className="val">8</div>
              <div className="delta" style={{color:'var(--ink-4)'}}>共 50</div>
            </div>
          </div>

          <div className="p0-eyebrow" style={{display:'block', marginBottom:10}}>角色定义 · ROLES</div>
          <div className="team-roles">
            <div className={`role-card ${role==='admin'?'on':''}`} onClick={()=>setRole('admin')}>
              <div className="head">
                <span className="name">管理员</span>
                <span className="cnt">2 人</span>
              </div>
              <div className="perms">
                <div className="yes">管理数据源</div>
                <div className="yes">编辑指标口径</div>
                <div className="yes">邀请 / 移除成员</div>
                <div className="yes">查看审计日志</div>
              </div>
            </div>
            <div className={`role-card ${role==='analyst'?'on':''}`} onClick={()=>setRole('analyst')}>
              <div className="head">
                <span className="name">分析师</span>
                <span className="cnt">12 人</span>
              </div>
              <div className="perms">
                <div className="yes">写 SQL / Python</div>
                <div className="yes">编辑指标(提交审核)</div>
                <div className="yes">建看板 / 节点</div>
                <div className="no">管理数据源</div>
              </div>
            </div>
            <div className={`role-card ${role==='biz'?'on':''}`} onClick={()=>setRole('biz')}>
              <div className="head">
                <span className="name">业务成员</span>
                <span className="cnt">22 人</span>
              </div>
              <div className="perms">
                <div className="yes">用自然语言追问</div>
                <div className="yes">建私人看板</div>
                <div className="no">改 SQL / 指标</div>
                <div className="no">分享给外部</div>
              </div>
            </div>
            <div className={`role-card ${role==='viewer'?'on':''}`} onClick={()=>setRole('viewer')}>
              <div className="head">
                <span className="name">访客</span>
                <span className="cnt">6 人</span>
              </div>
              <div className="perms">
                <div className="yes">查看共享看板</div>
                <div className="yes">订阅周报</div>
                <div className="no">追问 / 编辑</div>
                <div className="no">导出原始数据</div>
              </div>
            </div>
          </div>

          <div className="team-table">
            <table>
              <thead>
                <tr>
                  <th>成员</th>
                  <th>团队</th>
                  <th>角色</th>
                  <th>最近活跃</th>
                  <th>本月提问</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[
                  { av:'李', cls:'',  name:'李文', email:'liwen@acme.com',     team:'数据团队', role:'管理员', rcls:'adm', last:'刚刚',      q:'214' },
                  { av:'陈', cls:'b', name:'陈昊', email:'chenhao@acme.com',   team:'数据团队', role:'分析师', rcls:'',    last:'5 分钟前',  q:'186' },
                  { av:'周', cls:'c', name:'周晴', email:'zhouqing@acme.com',  team:'增长',     role:'分析师', rcls:'',    last:'12 分钟前', q:'142' },
                  { av:'王', cls:'d', name:'王萌', email:'wangmeng@acme.com',  team:'销售',     role:'业务成员', rcls:'', last:'1 小时前',  q:'88'  },
                  { av:'张', cls:'',  name:'张磊', email:'zhanglei@acme.com',  team:'销售',     role:'业务成员', rcls:'', last:'昨天',      q:'56'  },
                  { av:'刘', cls:'b', name:'刘佳', email:'liujia@acme.com',    team:'产品',     role:'分析师', rcls:'',    last:'昨天',      q:'94'  },
                  { av:'孙', cls:'c', name:'孙宇', email:'sunyu@acme.com',     team:'高管',     role:'访客',   rcls:'',    last:'3 天前',    q:'4'   },
                ].map(m => (
                  <tr key={m.email}>
                    <td>
                      <div className="person">
                        <div className={`av ${m.cls}`}>{m.av}</div>
                        <div>
                          <div>{m.name}</div>
                          <div className="email">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>{m.team}</span></td>
                    <td><span className={`role-pill ${m.rcls}`}>{m.role}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>{m.last}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)', fontSize:11}}>{m.q}</span></td>
                    <td>
                      <div className="row-actions">
                        <a>详情</a>
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
