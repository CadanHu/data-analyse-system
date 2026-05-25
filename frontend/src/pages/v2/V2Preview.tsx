import { Routes, Route, Link, useLocation } from 'react-router-dom'
import './tokens.css'
import './app.css'
import './p0.css'
import './p1.css'
import './p2.css'
import './proto.css'

import { CanvasA } from './sections/CanvasA'
import { ShareDialog, NotificationCenter, TeamWorkspace } from './sections/Collab'
import { BoardEditor, BoardTemplates, BoardSchedule } from './sections/BoardEditor'
import { AlertWizard, AlertDetail } from './sections/Alerts'
import { AdminAudit, AdminApiKeys, AdminModels, AdminBilling } from './sections/Admin'
import { SettingsProfile, SettingsNotify, SettingsSecurity } from './sections/Settings'
import { NotFound, OfflineMode, SkeletonLoad, GenericError } from './sections/SystemStates'
import { PricingPage, DocsPage, ChangelogPage } from './sections/MarketingExtras'

type Item = { slug: string; label: string; el: React.ReactNode }
type Group = { id: string; title: string; items: Item[] }

const GROUPS: Group[] = [
  {
    id: 'app', title: '① 应用主界面',
    items: [
      { slug: 'canvas', label: '变体 A · 横向时间线 + 内联分支', el: <CanvasA /> },
    ],
  },
  {
    id: 'collab', title: '⑦ P1-A · 协作',
    items: [
      { slug: 'share', label: '分享设置 · 权限分级 + 链接', el: <ShareDialog /> },
      { slug: 'notifications', label: '通知中心 · @提及 / 评论 / 告警', el: <NotificationCenter /> },
      { slug: 'team', label: '工作区 · 成员 + 4 类角色', el: <TeamWorkspace /> },
    ],
  },
  {
    id: 'board', title: '⑧ P1-B · 看板编排',
    items: [
      { slug: 'board-editor', label: '看板编辑器 · 拖拽 + 12 栅格 + 检查器', el: <BoardEditor /> },
      { slug: 'board-templates', label: '看板模板库 · 6 个行业起手式', el: <BoardTemplates /> },
      { slug: 'board-schedule', label: '定时刷新 + 月历视图 + 计划面板', el: <BoardSchedule /> },
    ],
  },
  {
    id: 'alert', title: '⑨ P1-C · 订阅 + 异常告警',
    items: [
      { slug: 'alert-wizard', label: '订阅 / 告警向导 · 阈值 + 渠道 + 推送预览', el: <AlertWizard /> },
      { slug: 'alert-detail', label: '异常告警详情 · 同环比 + AI 归因', el: <AlertDetail /> },
    ],
  },
  {
    id: 'admin', title: '⑩ P2-A · 管理后台',
    items: [
      { slug: 'admin/audit', label: '审计日志 · 谁·什么时候·改了什么', el: <AdminAudit /> },
      { slug: 'admin/keys', label: 'API Key · 4 个 Key + 轮换提醒', el: <AdminApiKeys /> },
      { slug: 'admin/models', label: '模型与算力 · 4 个模型 + 路由策略 + 预算环', el: <AdminModels /> },
      { slug: 'admin/billing', label: '账单与套餐 · 席位 / 提问 / 算力 + 发票', el: <AdminBilling /> },
    ],
  },
  {
    id: 'settings', title: '⑪ P2-B · 设置中心',
    items: [
      { slug: 'settings/profile', label: '个人信息 · 外观·语言·快捷键', el: <SettingsProfile /> },
      { slug: 'settings/notify', label: '通知偏好 · 4 渠道 × 8 场景 + 免打扰', el: <SettingsNotify /> },
      { slug: 'settings/security', label: '安全 · 密码 / 2FA / 会话 / 授权应用', el: <SettingsSecurity /> },
    ],
  },
  {
    id: 'sys', title: '⑫ P2-C · 系统态',
    items: [
      { slug: 'sys/404', label: '404 · 这张看板不见了', el: <NotFound /> },
      { slug: 'sys/offline', label: '离线模式 · 缓存继续用 + 连接诊断', el: <OfflineMode /> },
      { slug: 'sys/skeleton', label: '骨架屏 · SQL 运行中的加载态', el: <SkeletonLoad /> },
      { slug: 'sys/500', label: '5xx · 不是你的问题 + 错误 ID', el: <GenericError /> },
    ],
  },
  {
    id: 'mke', title: '⑬ P2-D · 营销页配套',
    items: [
      { slug: 'pricing', label: '定价页 · 4 档套餐 + 月/年切换', el: <PricingPage /> },
      { slug: 'docs', label: '文档 · 侧边栏 + 主区 + 右侧 TOC', el: <DocsPage /> },
      { slug: 'changelog-v2', label: '更新日志 · 时间轴 + 多类别标签', el: <ChangelogPage /> },
    ],
  },
]

function Index() {
  return (
    <div style={{ padding: '48px 64px', maxWidth: 1100, margin: '0 auto', color: 'var(--ink-1)' }}>
      <div className="eyebrow">DataPulse v2 · Design Preview</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 56, fontWeight: 400, margin: '12px 0 8px' }}>
        画布式分析 · 设计预览
      </h1>
      <p style={{ color: 'var(--ink-3)', fontSize: 15, lineHeight: 1.7, marginBottom: 32, maxWidth: 720 }}>
        暖色系 · 时间线 + 分支 · 业务人员友好。下面所有页面都是<strong>静态预览</strong>，
        不连后端、不动数据。任何 section 验收通过后再考虑接入真实数据。
      </p>
      {GROUPS.map(g => (
        <div key={g.id} style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, marginBottom: 12, color: 'var(--ink-1)' }}>
            {g.title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {g.items.map(it => (
              <Link
                key={it.slug}
                to={it.slug}
                style={{
                  display: 'block',
                  padding: '14px 16px',
                  border: '1px solid var(--line-1)',
                  borderRadius: 'var(--r-lg)',
                  background: 'var(--paper)',
                  textDecoration: 'none',
                  color: 'var(--ink-1)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  transition: 'border-color 200ms, transform 200ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--amber-deep)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-1)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 4 }}>
                  /{it.slug}
                </div>
                <div>{it.label}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function BackBar() {
  const loc = useLocation()
  if (loc.pathname === '/v2-preview' || loc.pathname === '/v2-preview/') return null
  return (
    <div style={{
      position: 'fixed', top: 64, left: 12, zIndex: 9999,
      display: 'flex', gap: 8,
    }}>
      <Link
        to="/v2-preview"
        title="返回 v2 设计索引"
        style={{
          width: 24, height: 24,
          display: 'grid', placeItems: 'center',
          background: 'transparent',
          color: 'var(--ink-3)',
          borderRadius: 999,
          fontSize: 14,
          fontFamily: 'var(--font-sans)',
          textDecoration: 'none',
          opacity: 0.5,
          transition: 'opacity 200ms, color 200ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--ink-1)' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--ink-3)' }}
      >←</Link>
    </div>
  )
}

export default function V2Preview() {
  return (
    <div className="v2-root" style={{ position: 'fixed', inset: 0, overflow: 'auto', background: 'oklch(0.92 0.015 70)' }}>
      <BackBar />
      <Routes>
        <Route index element={<Index />} />
        {GROUPS.flatMap(g => g.items).map(it => (
          <Route
            key={it.slug}
            path={it.slug}
            element={
              <div style={{ width: '100%', minHeight: '100vh', height: '100vh' }}>
                {it.el}
              </div>
            }
          />
        ))}
      </Routes>
    </div>
  )
}
