// @ts-nocheck
// DAT-31 串联第四波 · roadmap §6.1 / §6.6 索引页 PathMap
//
// 在索引页画板卡片上方加 hero 区,平铺 4 条主流程地图。每步是可点方框,
// 点击进入对应画板(走第一波 URL 协议 v2Urls)。每条流程带"当前是否可用"状态:
// 如无 v2 session,整条 A(分析→看板→分享)置灰并提示。
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { v2Api } from '../../../api'
import { useV2Ctx } from '../V2Context'
import { v2Urls } from './urlProtocol'

const V2 = '/v2-preview'

// 4 条主流程(与 roadmap §6.6 / DAT-41 Epic 一致)
// need: 该流程可用的前置条件 — 'session' 需有 v2 会话;'workspace' 需有工作区;null 始终可入。
const PATHS = [
  {
    id: 'A', title: 'A · 分析 → 看板 → 分享', need: 'session',
    hint: '需要先在画布建一个会话',
    steps: [
      { label: '画布分析', to: v2Urls.canvas() },
      { label: '钉到看板', to: v2Urls.boardEditor() },
      { label: '分享', to: v2Urls.share() },
    ],
  },
  {
    id: 'B', title: 'B · 告警 → 排查 → 解决', need: null,
    steps: [
      { label: '建告警', to: `${V2}/alert-wizard` },
      { label: '告警详情', to: v2Urls.alertDetail() },
      { label: '回画布排查', to: v2Urls.canvas() },
    ],
  },
  {
    id: 'C', title: 'C · 字段 → 指标 → 提问', need: null,
    steps: [
      { label: '字段语义', to: `${V2}/data/schema` },
      { label: '指标中心', to: v2Urls.metrics() },
      { label: '画布提问', to: v2Urls.canvas() },
    ],
  },
  {
    id: 'D', title: 'D · 协作 → 评论 → 提及', need: 'workspace',
    hint: '需要先进入一个工作区',
    steps: [
      { label: '工作区成员', to: `${V2}/team` },
      { label: '节点评论', to: v2Urls.nodeDetail('') },
      { label: '通知提及', to: `${V2}/notifications` },
    ],
  },
]

export function PathMap() {
  const { workspace } = useV2Ctx()
  const [hasSession, setHasSession] = useState(null)   // null = 未知

  useEffect(() => {
    if (!workspace) { setHasSession(false); return }
    v2Api.listSessions(workspace.id)
      .then(ss => setHasSession((ss || []).length > 0))
      .catch(() => setHasSession(false))
  }, [workspace])

  const ready = (need) => {
    if (need === 'session') return hasSession === true
    if (need === 'workspace') return !!workspace
    return true
  }

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--amber-deep)', textTransform: 'uppercase', marginBottom: 12 }}>
        4 条主流程 · 点击任一步进入
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>
        {PATHS.map(p => {
          const ok = ready(p.need)
          return (
            <div key={p.id} style={{
              border: '1px solid var(--line-1)', borderRadius: 'var(--r-lg)',
              padding: '14px 16px', background: 'var(--paper)',
              opacity: ok ? 1 : 0.55, transition: 'opacity 200ms',
            }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, marginBottom: 10, color: 'var(--ink-1)' }}>
                {p.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                {p.steps.map((s, i) => (
                  <React.Fragment key={i}>
                    <Link to={s.to} title={ok ? '' : '前置条件未满足,可点起点去补齐'}
                      style={{
                        fontSize: 12, padding: '5px 11px', borderRadius: 999,
                        border: '1px solid var(--line-1)', background: 'transparent',
                        color: 'var(--ink-2)', textDecoration: 'none', whiteSpace: 'nowrap',
                      }}>
                      {s.label}
                    </Link>
                    {i < p.steps.length - 1 && <span style={{ color: 'var(--ink-4)' }}>→</span>}
                  </React.Fragment>
                ))}
              </div>
              {!ok && p.hint && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-4)' }}>○ {p.hint}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
