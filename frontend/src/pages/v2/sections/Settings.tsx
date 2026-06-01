// @ts-nocheck
// Ported verbatim from datapulse-ai-design-system/project/v2/Settings.jsx
// 真实数据接入：在 SettingsProfile / SettingsNotify 顶部插入 Live 浮动条
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { v2Api } from '../../../api'

const { useState: useS_ST } = React;

const ROLE_OPTS = [
  { v: 'exec', l: '高管' }, { v: 'sales', l: '销售' }, { v: 'pm', l: '产品' },
  { v: 'ops', l: '运营' }, { v: 'analyst', l: '分析师' }, { v: 'admin', l: '管理员' },
]
const THEME_OPTS = [{ v: 'light', l: '亮' }, { v: 'dark', l: '暗' }, { v: 'auto', l: '跟随系统' }]
const LANG_OPTS = [{ v: 'zh-CN', l: '简体中文' }, { v: 'en-US', l: 'English' }]
const DENSITY_OPTS = [{ v: 'cozy', l: '舒适' }, { v: 'compact', l: '紧凑' }]
const NOTIFY_CHANNELS = ['email', 'im', 'push', 'inapp']
const NOTIFY_EVENTS = ['mention', 'comment', 'alert', 'share', 'digest', 'system']

function ProfileLiveBar() {
  const [profile, setProfile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  useEffect(() => { v2Api.getMyProfile().then(setProfile).catch(() => {}) }, [])
  if (!profile) return <LiveBar title="个人资料 · 真实数据" loading />

  const save = async (updates) => {
    setSaving(true)
    try {
      const next = await v2Api.updateMyProfile(updates)
      setProfile(next)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (err) { console.warn('[Settings] 保存失败:', err?.message || err) }
    finally { setSaving(false) }
  }

  return (
    <LiveBar title="个人资料 · 真实数据" footer={savedAt ? `已保存 ${savedAt}` : null}>
      <Field label="角色">
        <select value={profile.role || ''} disabled={saving} onChange={e => save({ role: e.target.value })}>
          <option value="">未设置</option>
          {ROLE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </Field>
      <Field label="昵称">
        <input
          defaultValue={profile.display_name || ''}
          disabled={saving}
          onBlur={e => e.target.value !== (profile.display_name || '') && save({ display_name: e.target.value })}
          placeholder="(空)"
        />
      </Field>
      <Field label="主题">
        <select value={profile.theme || 'light'} disabled={saving} onChange={e => save({ theme: e.target.value })}>
          {THEME_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </Field>
      <Field label="语言">
        <select value={profile.lang || 'zh-CN'} disabled={saving} onChange={e => save({ lang: e.target.value })}>
          {LANG_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </Field>
      <Field label="密度">
        <select value={profile.density || 'cozy'} disabled={saving} onChange={e => save({ density: e.target.value })}>
          {DENSITY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </Field>
    </LiveBar>
  )
}

function NotifyLiveBar() {
  const [prefs, setPrefs] = useState(null) // Record<`${ch}:${ev}`, bool>
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    v2Api.getMyNotificationPrefs?.()
    // 没有 getMyNotificationPrefs? 用 axios 直调
    import('../../../api').then(m => m.default.get('/v2/me/notification-prefs').then(r => {
      const map = {}
      ;(r.data || []).forEach(p => { map[`${p.channel}:${p.event_type}`] = p.enabled })
      setPrefs(map)
    }).catch(() => setPrefs({})))
  }, [])

  if (!prefs) return <LiveBar title="通知偏好 · 真实数据" loading />

  const toggle = async (ch, ev) => {
    const key = `${ch}:${ev}`
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setSaving(true)
    try {
      const items = Object.entries(next).map(([k, enabled]) => {
        const [channel, event_type] = k.split(':')
        return { channel, event_type, enabled }
      })
      const apiMod = await import('../../../api')
      await apiMod.default.put('/v2/me/notification-prefs', items)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (err) { console.warn('[Settings] 保存通知偏好失败:', err?.message || err) }
    finally { setSaving(false) }
  }

  return (
    <LiveBar title="通知偏好 · 真实数据" footer={savedAt ? `已保存 ${savedAt}` : '4 渠道 × 6 场景'}>
      <div style={{ display: 'grid', gridTemplateColumns: `auto repeat(${NOTIFY_CHANNELS.length}, auto)`, gap: '6px 14px', alignItems: 'center', fontSize: 12 }}>
        <div></div>
        {NOTIFY_CHANNELS.map(ch => <div key={ch} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase' }}>{ch}</div>)}
        {NOTIFY_EVENTS.map(ev => (
          <React.Fragment key={ev}>
            <div style={{ color: 'var(--ink-2)' }}>{ev}</div>
            {NOTIFY_CHANNELS.map(ch => (
              <input
                key={ch}
                type="checkbox"
                checked={!!prefs[`${ch}:${ev}`]}
                onChange={() => toggle(ch, ev)}
                disabled={saving}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </LiveBar>
  )
}

function LiveBar({ title, loading, footer, children }) {
  return (
    <div style={{
      padding: '12px 18px', background: 'oklch(0.78 0.16 65 / 0.10)',
      borderBottom: '1px solid var(--amber-deep)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: children ? 10 : 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--amber-deep)' }}>
          ● {title}
        </span>
        {loading && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>加载中…</span>}
        {footer && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)' }}>{footer}</span>}
      </div>
      {children && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>{children}</div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}>
      {label}：{children}
    </label>
  )
}

/* ---------- 阶段 7 · SecurityLiveBar (2FA + 登录会话 + OAuth 授权) ---------- */

function SecurityLiveBar() {
  const [tfa, setTfa] = useState(null)
  const [sessionsList, setSessionsList] = useState([])
  const [apps, setApps] = useState([])
  const [setupResult, setSetupResult] = useState(null)   // {secret, otpauth_url, backup_codes}
  const [verifyCode, setVerifyCode] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    try {
      const [t, ss, aa] = await Promise.all([
        v2Api.get2FAStatus(), v2Api.listLoginSessions(true), v2Api.listOAuthApps(true),
      ])
      setTfa(t); setSessionsList(ss); setApps(aa)
    } catch {}
  }
  useEffect(() => { reload() }, [])

  const setup = async () => {
    setBusy(true)
    try { setSetupResult(await v2Api.setup2FA()); setMsg(null) }
    catch (e) { setMsg(`失败: ${e?.message || e}`) }
    finally { setBusy(false) }
  }
  const verify = async () => {
    if (verifyCode.length !== 6) { setMsg('需要 6 位数字'); return }
    setBusy(true)
    try {
      await v2Api.verify2FA(verifyCode)
      setSetupResult(null); setVerifyCode(''); setMsg('2FA 已启用 ✓'); reload()
    } catch (e) { setMsg(`验证失败: ${e?.response?.data?.detail || e?.message}`) }
    finally { setBusy(false); setTimeout(() => setMsg(null), 3500) }
  }
  const disable = async () => {
    if (!confirm('关闭 2FA？账户安全性会降低。')) return
    setBusy(true)
    try { await v2Api.disable2FA(); setMsg('2FA 已关闭'); reload() }
    finally { setBusy(false); setTimeout(() => setMsg(null), 3000) }
  }
  const regen = async () => {
    setBusy(true)
    try {
      const r = await v2Api.regenerateBackupCodes()
      setSetupResult({ secret: '(unchanged)', otpauth_url: null, backup_codes: r.backup_codes })
    } catch {}
    finally { setBusy(false) }
  }
  const seedSession = async () => {
    await v2Api.seedLoginSession({ ip: '192.168.1.' + Math.floor(Math.random() * 254), device_label: ['iPhone · Safari','MacBook · Chrome','Win · Edge'][Math.floor(Math.random()*3)] })
    reload()
  }
  const revokeSession = async (sid) => { await v2Api.revokeLoginSession(sid); reload() }
  const revokeOthers = async () => { await v2Api.revokeOtherSessions(); reload() }
  const seedApp = async () => {
    const samples = [
      { client_id: 'figma-plugin', client_name: 'Figma 插件', scope: ['read:boards'] },
      { client_id: 'slack-bot', client_name: 'Slack 机器人', scope: ['read:notifications', 'write:notifications'] },
      { client_id: 'github-action', client_name: 'GitHub Action', scope: ['read:audit'] },
    ]
    const pick = samples[Math.floor(Math.random() * samples.length)]
    await v2Api.seedOAuthApp(pick)
    reload()
  }
  const revokeApp = async (aid) => { await v2Api.revokeOAuthApp(aid); reload() }

  return (
    <LiveBar title="安全 · 真实数据" footer={msg}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 2FA */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6 }}>
            双因素认证 (2FA)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
            状态: <b style={{ color: tfa?.enabled ? 'var(--success)' : 'var(--ink-4)' }}>
              {tfa?.enabled ? '已启用' : '未启用'}
            </b>
            {tfa?.enabled && <span style={{ color: 'var(--ink-3)' }}>· 剩余备份码 {tfa.backup_codes_remaining}</span>}
            {!tfa?.enabled && !setupResult && <button onClick={setup} disabled={busy} style={btnPriS}>开始启用</button>}
            {tfa?.enabled && <button onClick={regen} disabled={busy} style={btnGhostS}>重新生成备份码</button>}
            {tfa?.enabled && <button onClick={disable} disabled={busy} style={{ ...btnGhostS, color: 'var(--danger)' }}>关闭 2FA</button>}
          </div>
          {setupResult && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--paper-2)', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 12 }}>
              <div>secret: <code style={{ fontFamily: 'var(--font-mono)' }}>{setupResult.secret}</code></div>
              {setupResult.otpauth_url && <div style={{ marginTop: 4 }}>扫码: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{setupResult.otpauth_url}</code></div>}
              <div style={{ marginTop: 6 }}>
                备份码 (只此一次保存):{' '}
                {setupResult.backup_codes.map((c, i) => (
                  <code key={i} style={{ fontFamily: 'var(--font-mono)', marginRight: 8, color: 'var(--amber-deep)' }}>{c}</code>
                ))}
              </div>
              {setupResult.otpauth_url && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={verifyCode} onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 位数字" maxLength={6}
                    style={{ width: 100, padding: '4px 8px', fontFamily: 'var(--font-mono)' }} />
                  <button onClick={verify} disabled={busy || verifyCode.length !== 6} style={btnPriS}>验证并启用</button>
                  <button onClick={() => setSetupResult(null)} style={btnGhostS}>取消</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Login sessions */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
              已登录设备 ({sessionsList.length})
            </span>
            <button onClick={seedSession} style={btnGhostS}>＋ 造一条</button>
            {sessionsList.length > 1 && <button onClick={revokeOthers} style={btnGhostS}>注销其它全部</button>}
          </div>
          {sessionsList.length === 0
            ? <div style={{ color: 'var(--ink-4)', fontSize: 12 }}>暂无活跃登录会话</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sessionsList.map(s => (
                  <div key={s.id} style={liveRowS}>
                    <span style={{ flex: 1, fontSize: 12 }}>{s.device_label || '(未知设备)'} <span style={{ color: 'var(--ink-3)' }}>· {s.ip || '—'}</span></span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' }}>{(s.last_active_at || '').slice(0, 16)}</span>
                    <button onClick={() => revokeSession(s.id)} style={{ ...btnGhostS, color: 'var(--ink-4)' }}>注销</button>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* OAuth apps */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
              授权的第三方应用 ({apps.length})
            </span>
            <button onClick={seedApp} style={btnGhostS}>＋ 造一个</button>
          </div>
          {apps.length === 0
            ? <div style={{ color: 'var(--ink-4)', fontSize: 12 }}>暂无授权应用</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {apps.map(a => (
                  <div key={a.id} style={liveRowS}>
                    <span style={{ flex: 1, fontSize: 12 }}><b>{a.client_name}</b> <span style={{ color: 'var(--ink-3)' }}>({a.client_id})</span></span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)' }}>{(a.scope || []).join(', ')}</span>
                    <button onClick={() => revokeApp(a.id)} style={{ ...btnGhostS, color: 'var(--danger)' }}>撤销</button>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>
    </LiveBar>
  )
}

const liveRowS = { padding: '6px 10px', background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }
const btnPriS = { padding: '5px 10px', background: 'var(--amber-deep)', color: 'var(--paper)', border: 0, borderRadius: 6, fontSize: 11, cursor: 'pointer' }
const btnGhostS = { padding: '4px 10px', background: 'transparent', border: '1px solid var(--line-1)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }

/* =========================================================
   Settings · Profile / Notify / Security
   ========================================================= */

function SetSide({ on }) {
  return (
    <div className="set-side">
      <div className="brand"><span className="dot"/>DataPulse</div>
      <div className="group">个人 · YOU</div>
      <a className={on==='profile'?'on':''}><span className="ix">▸</span>账户与个人信息</a>
      <a><span className="ix">·</span>外观 / 语言</a>
      <a><span className="ix">·</span>键盘快捷键</a>
      <div className="group">提醒 · NOTIFY</div>
      <a className={on==='notify'?'on':''}><span className="ix">▸</span>通知偏好</a>
      <a><span className="ix">·</span>免打扰 / 静默时段</a>
      <a><span className="ix">·</span>订阅管理</a>
      <div className="group">安全 · SECURITY</div>
      <a className={on==='security'?'on':''}><span className="ix">▸</span>密码与 2FA</a>
      <a><span className="ix">·</span>登录会话</a>
      <a><span className="ix">·</span>授权应用</a>
      <div className="group">高级</div>
      <a><span className="ix">·</span>导出我的数据</a>
      <a><span className="ix">·</span>注销账户</a>
    </div>
  );
}

/* =========================================================
   1. Profile / appearance
   ========================================================= */

export function SettingsProfile() {
  const [theme, setTheme] = useS_ST('warm');
  const [density, setDensity] = useS_ST('cozy');
  const [notify1, setNotify1] = useS_ST(true);
  const [notify2, setNotify2] = useS_ST(true);
  return (
    <div className="p0-frame">
      <ProfileLiveBar />
      <div className="set-shell">
        <SetSide on="profile"/>
        <div className="set-main">
          <div className="set-head">
            <div>
              <span className="sub">个人 / 账户与外观</span>
              <h1>账户</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">放弃修改</button>
              <button className="btn-primary">保存 ⌘S</button>
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>个人信息</h2>
                <div className="sub">显示在评论、@提及、分享链接里</div>
              </div>
            </div>

            <div className="set-avatar-row">
              <div className="set-avatar">李</div>
              <div className="body">
                <div className="name">李文</div>
                <div className="meta">liwen@acme.com · 加入于 2026-03-12 · 数据团队</div>
              </div>
              <button className="btn-ghost">换头像</button>
            </div>

            <div className="set-row">
              <div className="k">
                显示名称
                <div className="sub">同事在 @ 你的时候看到的名字</div>
              </div>
              <div className="ctrl"><input defaultValue="李文"/></div>
              <span/>
            </div>
            <div className="set-row">
              <div className="k">
                邮箱
                <div className="sub">登录、接收周报和告警邮件</div>
              </div>
              <div className="ctrl"><input defaultValue="liwen@acme.com"/></div>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--success)'}}>已验证</span>
            </div>
            <div className="set-row">
              <div className="k">
                团队 / 角色
                <div className="sub">影响你的默认视图和"开箱即用"模板</div>
              </div>
              <div className="ctrl">
                <select defaultValue="data">
                  <option value="data">数据团队 · 分析师</option>
                </select>
              </div>
              <span/>
            </div>
            <div className="set-row">
              <div className="k">
                工作时间
                <div className="sub">非工作时间的告警会延迟到次日 09:00</div>
              </div>
              <div className="ctrl">
                <input className="short" defaultValue="09:00"/>
                <span style={{margin:'0 8px', color:'var(--ink-4)'}}>→</span>
                <input className="short" defaultValue="19:00"/>
              </div>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>UTC+8</span>
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>外观与语言</h2>
                <div className="sub">主题、密度、语言 · 立即生效</div>
              </div>
            </div>
            <div className="set-row">
              <div className="k">主题</div>
              <div className="ctrl">
                <div className="seg">
                  <button className={theme==='warm'?'on':''}   onClick={()=>setTheme('warm')}>暖色</button>
                  <button className={theme==='light'?'on':''}  onClick={()=>setTheme('light')}>亮色</button>
                  <button className={theme==='dark'?'on':''}   onClick={()=>setTheme('dark')}>暗色</button>
                  <button className={theme==='sys'?'on':''}    onClick={()=>setTheme('sys')}>跟随系统</button>
                </div>
              </div>
              <span/>
            </div>
            <div className="set-row">
              <div className="k">密度</div>
              <div className="ctrl">
                <div className="seg">
                  <button className={density==='cozy'?'on':''}     onClick={()=>setDensity('cozy')}>松</button>
                  <button className={density==='compact'?'on':''}  onClick={()=>setDensity('compact')}>紧</button>
                </div>
              </div>
              <span/>
            </div>
            <div className="set-row">
              <div className="k">界面语言</div>
              <div className="ctrl">
                <select defaultValue="zh-CN">
                  <option value="zh-CN">简体中文 · zh-CN</option>
                  <option>English</option>
                </select>
              </div>
              <span/>
            </div>
            <div className="set-row">
              <div className="k">
                技术词保留英文
                <div className="sub">"SQL / cohort / funnel" 这类词不翻译</div>
              </div>
              <div className="ctrl"><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>推荐开启</span></div>
              <div className={`set-toggle ${notify1?'on':''}`} onClick={()=>setNotify1(!notify1)}/>
            </div>
            <div className="set-row">
              <div className="k">
                AI 在思考时显示思维链
                <div className="sub">关闭后只看最终结果,适合演示场景</div>
              </div>
              <div className="ctrl"/>
              <div className={`set-toggle ${notify2?'on':''}`} onClick={()=>setNotify2(!notify2)}/>
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>键盘快捷键</h2>
                <div className="sub">⌘K 是 DataPulse 的灵魂</div>
              </div>
            </div>
            {[
              ['发起提问', '⌘ K'],
              ['切换视角(高管 / 销售 / PM)', '⌘ ⇧ R'],
              ['钉到看板', '⌘ ↵'],
              ['新建分支', '⌘ B'],
              ['打开通知中心', '⌘ ⇧ I'],
              ['运行 SQL', '⌘ ⏎'],
              ['切换深色 / 浅色', '⌘ ⇧ L'],
            ].map(([n, k]) => (
              <div key={n} className="set-row">
                <div className="k">{n}</div>
                <div className="v"/>
                <span className="kbd">{k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   2. Notification preferences
   ========================================================= */

const NOTIFY_ROWS = [
  { n:'有人 @ 我',          sub:'评论或描述里 @ 到你',                cols:[true, true, true] },
  { n:'我的节点收到评论',     sub:'你创建的节点下出现新评论',           cols:[true, true, false] },
  { n:'我的看板被分享出去',   sub:'有人把你的看板分享给新成员',         cols:[true, false, false] },
  { n:'订阅产出 · 周报',     sub:'每周 / 每月定时报',                  cols:[true, false, false] },
  { n:'异常告警',           sub:'阈值或环比触发',                     cols:[true, true, true] },
  { n:'数据源连接失败',      sub:'同步任务超过 3 次失败时',             cols:[true, true, false] },
  { n:'指标口径变更',        sub:'你引用的指标被改了 SQL',              cols:[true, true, false] },
  { n:'席位 / 账单',         sub:'扩容、欠费、额度警告',                cols:[true, false, true] },
];

export function SettingsNotify() {
  return (
    <div className="p0-frame">
      <NotifyLiveBar />
      <div className="set-shell">
        <SetSide on="notify"/>
        <div className="set-main">
          <div className="set-head">
            <div>
              <span className="sub">提醒 · 通知偏好</span>
              <h1>什么事才打扰你?</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">全部静默 30 分钟</button>
              <button className="btn-primary">保存 ⌘S</button>
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>渠道与场景</h2>
                <div className="sub">勾选你希望被叫醒的方式。AI 摘要会优先到飞书</div>
              </div>
            </div>

            <div className="set-nmtx">
              <div className="hd">事件</div>
              <div className="hd">应用内</div>
              <div className="hd">邮件</div>
              <div className="hd">飞书</div>

              {NOTIFY_ROWS.map((r, i) => (
                <React.Fragment key={r.n}>
                  <div className={`row ${i===NOTIFY_ROWS.length-1?'last':''}`}>
                    {r.n}
                    <div className="sub">{r.sub}</div>
                  </div>
                  {r.cols.map((on, j) => (
                    <div key={j} className={`cell ${i===NOTIFY_ROWS.length-1?'last':''}`}>
                      <div className={`cb ${on?'on':''}`}/>
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>免打扰</h2>
                <div className="sub">这段时间内告警合并到次日 09:00 一并送达</div>
              </div>
            </div>
            <div className="set-row">
              <div className="k">每日静默时段</div>
              <div className="ctrl">
                <input className="short" defaultValue="22:00"/>
                <span style={{margin:'0 8px', color:'var(--ink-4)'}}>→</span>
                <input className="short" defaultValue="08:00"/>
              </div>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>UTC+8</span>
            </div>
            <div className="set-row">
              <div className="k">
                周末完全静音
                <div className="sub">周六周日不送任何通知,异常以红点形式留在通知中心</div>
              </div>
              <div className="ctrl"/>
              <div className="set-toggle on"/>
            </div>
            <div className="set-row">
              <div className="k">
                紧急告警跳过免打扰
                <div className="sub">P0 异常(GMV 异常 / 数据源全部断开)仍然送达</div>
              </div>
              <div className="ctrl"/>
              <div className="set-toggle on"/>
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>智能摘要</h2>
                <div className="sub">把多条通知合成一段中文摘要</div>
              </div>
            </div>
            <div className="set-row">
              <div className="k">
                合并同规则告警
                <div className="sub">10 分钟内同一规则的多次触发,只发一条</div>
              </div>
              <div className="ctrl"/>
              <div className="set-toggle on"/>
            </div>
            <div className="set-row">
              <div className="k">
                AI 一句话摘要
                <div className="sub">收件箱顶端用一句话告诉你今天该看什么</div>
              </div>
              <div className="ctrl"/>
              <div className="set-toggle on"/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   3. Security · password + 2FA + sessions
   ========================================================= */

export function SettingsSecurity() {
  return (
    <div className="p0-frame">
      <SecurityLiveBar />
      <div className="set-shell">
        <SetSide on="security"/>
        <div className="set-main">
          <div className="set-head">
            <div>
              <span className="sub">安全 · 密码 / 2FA / 会话</span>
              <h1>安全</h1>
            </div>
            <div className="right">
              <button className="btn-ghost">下载安全报告</button>
              <button className="btn-primary">检查我的安全</button>
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>密码</h2>
                <div className="sub">上次修改于 87 天前 · 建议每 90 天更换</div>
              </div>
              <button className="btn-ghost">修改密码 →</button>
            </div>

            <div className="set-2fa">
              <div className="ico">⚿</div>
              <div className="body">
                <div className="ttl">两步验证(2FA)· 已开启</div>
                <div className="desc">使用 飞书认证器 · 上次验证 2 小时前 · 12 个备份码(已用 1)</div>
              </div>
              <button className="btn-ghost">管理</button>
            </div>

            <div className="set-row">
              <div className="k">
                生物识别
                <div className="sub">macOS Touch ID / Windows Hello</div>
              </div>
              <div className="ctrl"><span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--success)'}}>已绑定 2 台设备</span></div>
              <div className="set-toggle on"/>
            </div>
            <div className="set-row">
              <div className="k">
                关键操作二次确认
                <div className="sub">删除看板、轮换 API Key、修改指标口径时再次校验</div>
              </div>
              <div className="ctrl"/>
              <div className="set-toggle on"/>
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>登录会话</h2>
                <div className="sub">4 个活跃会话 · 异地登录会立即邮件提醒</div>
              </div>
              <button className="btn-ghost" style={{color:'var(--terracotta)', borderColor:'oklch(0.58 0.16 35 / 0.4)'}}>结束所有其他会话</button>
            </div>

            <div className="set-sess">
              <div className="row curr">
                <div className="ico">⌘</div>
                <div className="name">
                  macOS · Chrome
                  <div className="sub">DESK-LIWEN-01 · v131</div>
                </div>
                <div className="when">当前会话</div>
                <div className="where">上海 · 10.4.21.18</div>
                <div className="end" style={{color:'var(--ink-4)', cursor:'default'}}>—</div>
              </div>
              <div className="row">
                <div className="ico">⌘</div>
                <div className="name">
                  macOS · Safari
                  <div className="sub">DESK-LIWEN-02</div>
                </div>
                <div className="when">2 小时前</div>
                <div className="where">上海 · 10.4.21.18</div>
                <div className="end">结束 ›</div>
              </div>
              <div className="row">
                <div className="ico">⌥</div>
                <div className="name">
                  iOS · DataPulse App
                  <div className="sub">iPhone 15 Pro</div>
                </div>
                <div className="when">昨天</div>
                <div className="where">上海 · 蜂窝</div>
                <div className="end">结束 ›</div>
              </div>
              <div className="row">
                <div className="ico" style={{color:'var(--terracotta)'}}>⚠</div>
                <div className="name" style={{color:'var(--terracotta)'}}>
                  Windows · Firefox · 未识别
                  <div className="sub" style={{color:'var(--terracotta)'}}>新加坡 · 异地登录</div>
                </div>
                <div className="when">3 天前</div>
                <div className="where">183.91.0.42</div>
                <div className="end">立刻结束</div>
              </div>
            </div>
          </div>

          <div className="set-section">
            <div className="head">
              <div>
                <h2>授权应用</h2>
                <div className="sub">这些应用通过 OAuth 连接到你的账号</div>
              </div>
            </div>
            <div className="set-row">
              <div className="k">
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{width:24, height:24, borderRadius:6,
                    background:'linear-gradient(135deg, var(--clay), var(--olive))',
                    color:'white', display:'inline-grid', placeItems:'center',
                    fontFamily:'var(--font-mono)', fontSize:10}}>FS</span>
                  飞书
                </div>
                <div className="sub">读取组织信息 · 发送机器人消息 · 12 天前授权</div>
              </div>
              <div className="ctrl"/>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--terracotta)', cursor:'pointer'}}>撤销 ›</span>
            </div>
            <div className="set-row">
              <div className="k">
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{width:24, height:24, borderRadius:6,
                    background:'linear-gradient(135deg, oklch(0.55 0.10 240), oklch(0.4 0.10 250))',
                    color:'white', display:'inline-grid', placeItems:'center',
                    fontFamily:'var(--font-mono)', fontSize:9}}>{ '{ }' }</span>
                  Zapier · pulse-cli
                </div>
                <div className="sub">读取看板列表 · 调用 API Key · 28 天前授权</div>
              </div>
              <div className="ctrl"/>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--terracotta)', cursor:'pointer'}}>撤销 ›</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
