// @ts-nocheck
// DAT-32 第五波 · ⌘K 全局搜索命令面板 — 填上 DAT-30 toolbar 的 ⌘K 占位。
//
// 打开方式:全局 ⌘K / Ctrl+K,或 toolbar ⌘K 按钮派发的 'v2-open-cmdk' 事件。
// 调 /v2/_search 聚合搜索,结果按类型分组,点击走第一波 URL 协议(v2Urls / notifJumpUrl)跳转。
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { v2Api } from '../../../api'
import { useV2Ctx } from '../V2Context'
import { v2Urls, notifJumpUrl } from './urlProtocol'

// 各类型 → 标签 + 跳转 URL 构造(走第一波 URL 协议)
const GROUPS = [
  { key: 'sessions', label: '会话', to: (it) => v2Urls.canvas({ session: it.id }) },
  { key: 'boards', label: '看板', to: (it) => v2Urls.boardEditor(it.id) },
  { key: 'metrics', label: '指标', to: (it) => v2Urls.metrics({ metric: it.id }) },
  { key: 'nodes', label: '节点', to: (it) => v2Urls.nodeDetail(it.id) },
  { key: 'notifications', label: '通知', to: (it) => notifJumpUrl(it) || null },
]

const overlay = {
  position: 'fixed', inset: 0, zIndex: 11000, background: 'oklch(0.2 0.02 60 / 0.32)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
  backdropFilter: 'blur(2px)',
}
const panel = {
  width: 'min(640px, 92vw)', background: 'var(--paper)', border: '1px solid var(--line-1)',
  borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px oklch(0 0 0 / 0.28)', overflow: 'hidden',
}
const input = {
  width: '100%', border: 'none', borderBottom: '1px solid var(--line-1)', outline: 'none',
  padding: '16px 18px', fontSize: 15, color: 'var(--ink-1)', background: 'transparent',
  fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
}
const groupLabel = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
  color: 'var(--ink-4)', padding: '4px 8px',
}
const row = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
  border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px',
  borderRadius: 8, fontSize: 13, color: 'var(--ink-1)',
}
const badge = {
  fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', padding: '1px 6px',
  borderRadius: 4, background: 'oklch(0.78 0.16 65 / 0.12)', color: 'var(--amber-deep)', flexShrink: 0,
}
const Hint = ({ children }) => <div style={{ padding: 18, color: 'var(--ink-4)', fontSize: 13 }}>{children}</div>

export function CommandPalette() {
  const { workspace } = useV2Ctx()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  // ⌘K / Ctrl+K 切换;Esc 关闭;toolbar 按钮派发 'v2-open-cmdk' 打开
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); setOpen(o => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('v2-open-cmdk', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('v2-open-cmdk', onOpen) }
  }, [])

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])
  useEffect(() => { if (!open) { setQ(''); setRes(null) } }, [open])

  // debounce 220ms 调聚合搜索
  useEffect(() => {
    if (!open || !workspace || !q.trim()) { setRes(null); return }
    setLoading(true)
    const t = setTimeout(() => {
      v2Api.globalSearch(workspace.id, q.trim(), 5)
        .then(r => setRes(r)).catch(() => setRes(null)).finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(t)
  }, [q, open, workspace])

  if (!open) return null

  const go = (url) => { setOpen(false); if (url) navigate(url) }
  const total = res ? GROUPS.reduce((n, g) => n + (res[g.key]?.length || 0), 0) : 0

  return (
    <div onMouseDown={() => setOpen(false)} style={overlay}>
      <div onMouseDown={e => e.stopPropagation()} style={panel}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
          placeholder="搜索会话 / 看板 / 指标 / 节点 / 通知…   (Esc 关闭)" style={input} />
        <div style={{ maxHeight: 420, overflow: 'auto', padding: 8 }}>
          {!q.trim() ? <Hint>输入关键词开始搜索 · 当前工作区{workspace ? `: ${workspace.name}` : '未就绪'}</Hint>
            : loading ? <Hint>搜索中…</Hint>
            : total === 0 ? <Hint>无匹配结果</Hint>
            : GROUPS.map(g => {
              const items = res[g.key] || []
              if (!items.length) return null
              return (
                <div key={g.key} style={{ marginBottom: 10 }}>
                  <div style={groupLabel}>{g.label} · {items.length}</div>
                  {items.map(it => (
                    <button key={it.id} style={row}
                      onClick={() => go(g.to(it))}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2, oklch(0.95 0.01 70))' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <span style={badge}>{g.label}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.label || it.id}
                      </span>
                    </button>
                  ))}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
