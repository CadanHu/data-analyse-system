// @ts-nocheck
// DAT-30 串联第三波 · roadmap §6.5 常驻顶部 toolbar
//
// 升级自 DAT-28 的 V2StatusStrip:在一个 fixed 浮动条里集中
//   [DataPulse] · [工作区/会话 ▾] ┊ [⌘K 占位] [🔔 未读 ▾] [→ 分享] · [👤 角色 ▾]
// 低风险方案(用户拍板):仍是 fixed 浮动,不改任何子页面布局;仅子页面显示,索引页不显示。
// 数据来自全局 V2Context(未读数 30s 轮询);会话/通知列表在下拉打开时懒加载。
import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { v2Api } from '../../../api'
import { useV2Ctx } from '../V2Context'
import { RoleSwitcher } from './CanvasA'           // 复用 CanvasA 的角色切换器
import { v2Urls, notifJumpUrl } from './urlProtocol'  // 复用第一波 URL 协议

// 复刻 CanvasA.roleIdFrom(该函数未导出);profile.role 落到 6 个合法角色,否则兜底 ops
function roleIdFrom(profile) {
  const r = profile?.role
  if (r === 'exec' || r === 'sales' || r === 'pm' || r === 'ops' || r === 'analyst' || r === 'admin') return r
  return 'ops'
}

const wrap = {
  position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10000,
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
  background: 'oklch(0.98 0.008 70 / 0.94)', border: '1px solid var(--line-1)', borderRadius: 999,
  backdropFilter: 'blur(8px)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)',
  boxShadow: '0 2px 12px oklch(0 0 0 / 0.08)', maxWidth: 'calc(100vw - 24px)',
}
const btn = {
  border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 6px', borderRadius: 6,
}
const dot = { color: 'var(--ink-5)' }
const dropdown = {
  position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 220, maxWidth: 320,
  background: 'var(--paper)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-lg)',
  boxShadow: '0 8px 28px oklch(0 0 0 / 0.14)', padding: 6, display: 'flex', flexDirection: 'column',
  gap: 2, maxHeight: 360, overflow: 'auto',
}
const rowBtn = {
  textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
  padding: '7px 9px', borderRadius: 6, fontSize: 12, color: 'var(--ink-1)',
  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
}
const tag = {
  fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', padding: '1px 5px',
  borderRadius: 4, background: 'oklch(0.78 0.16 65 / 0.12)', color: 'var(--amber-deep)', flexShrink: 0,
}

export function V2TopBar() {
  const loc = useLocation()
  const navigate = useNavigate()
  const { workspace, profile, unreadCount, refresh, refreshUnread } = useV2Ctx()
  const [open, setOpen] = useState(null)        // 'sessions' | 'bell' | 'role' | null
  const [sessions, setSessions] = useState([])
  const [notifs, setNotifs] = useState([])
  const ref = useRef(null)

  const isIndex = loc.pathname === '/v2-preview' || loc.pathname === '/v2-preview/'

  // 点外部关闭下拉
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // 下拉打开时懒加载会话/最近通知
  useEffect(() => {
    if (open === 'sessions' && workspace) v2Api.listSessions(workspace.id).then(setSessions).catch(() => {})
    if (open === 'bell') v2Api.listNotifications(false, 5, 0).then(setNotifs).catch(() => {})
  }, [open, workspace])

  if (isIndex) return null
  const roleId = roleIdFrom(profile)
  const toggle = (k) => setOpen(open === k ? null : k)

  return (
    <div ref={ref} style={wrap} title="常驻 toolbar · DAT-30">
      <Link to="/v2-preview" title="返回 v2 索引"
        style={{ fontWeight: 700, color: 'var(--amber-deep)', textDecoration: 'none', letterSpacing: '0.04em' }}>
        DataPulse
      </Link>
      <span style={dot}>·</span>

      {/* 会话切换器(切换影响 canvas) */}
      <div style={{ position: 'relative' }}>
        <button style={btn} onClick={() => toggle('sessions')}>
          {workspace?.name || '工作区'} · 会话 ▾
        </button>
        {open === 'sessions' && (
          <div style={dropdown}>
            {sessions.length === 0
              ? <div style={{ padding: 9, color: 'var(--ink-4)', fontSize: 12 }}>暂无会话</div>
              : sessions.slice(0, 8).map(s => (
                <button key={s.id} style={rowBtn}
                  onClick={() => { setOpen(null); navigate(v2Urls.canvas({ session: s.id })) }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title || s.id?.slice(0, 8)}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      <span style={dot}>┊</span>

      {/* ⌘K 占位 — 第五波(DAT-32 全局搜索)填空 */}
      <button style={btn} title="全局搜索 · 即将上线(第五波)"
        onClick={() => alert('全局搜索 ⌘K 即将上线(第五波 / DAT-32)')}>⌘K</button>

      {/* 通知 bell */}
      <div style={{ position: 'relative' }}>
        <button style={{ ...btn, color: unreadCount > 0 ? 'var(--terracotta)' : 'var(--ink-2)' }}
          onClick={() => toggle('bell')}>
          🔔{unreadCount > 0 ? ` ${unreadCount}` : ''}
        </button>
        {open === 'bell' && (
          <div style={dropdown}>
            {notifs.length === 0
              ? <div style={{ padding: 9, color: 'var(--ink-4)', fontSize: 12 }}>暂无通知</div>
              : notifs.map(n => {
                const url = notifJumpUrl(n)
                return (
                  <button key={n.id} style={rowBtn}
                    onClick={async () => {
                      setOpen(null)
                      try { await v2Api.markNotificationRead(n.id); refreshUnread() } catch { /* 幂等,忽略 */ }
                      if (url) navigate(url)
                    }}>
                    <span style={tag}>{n.type}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.title || n.body || n.source_id || '通知'}
                    </span>
                  </button>
                )
              })}
            <Link to="/v2-preview/notifications" onClick={() => setOpen(null)}
              style={{ ...rowBtn, color: 'var(--amber-deep)', textDecoration: 'none', justifyContent: 'center' }}>
              查看全部 →
            </Link>
          </div>
        )}
      </div>

      {/* 分享 */}
      <Link to={v2Urls.share()} style={{ ...btn, textDecoration: 'none', color: 'var(--ink-2)' }}>→ 分享</Link>

      <span style={dot}>·</span>

      {/* 角色切换 — 复用 CanvasA RoleSwitcher */}
      <div style={{ position: 'relative' }}>
        <button style={btn} onClick={() => toggle('role')}>👤 {roleId}</button>
        {open === 'role' && (
          <div style={{ ...dropdown, padding: 10 }}>
            <RoleSwitcher value={roleId} onChange={async (r) => {
              setOpen(null)
              try { await v2Api.updateMyProfile({ role: r }); await refresh() }
              catch (err) { console.warn('[V2TopBar] 切换角色失败:', err) }
            }} />
          </div>
        )}
      </div>
    </div>
  )
}
