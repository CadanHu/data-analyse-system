import { useEffect, useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { v2Api, type V2Profile } from '../../api'
import './tokens.css'
import './app.css'
import './p0.css'
import './p1.css'
import './p2.css'
import './proto.css'

import { CanvasA } from './sections/CanvasA'
import { ExecView, SalesView, PMView } from './sections/RoleViews'
import { DataSources, SchemaSemantic, MetricCenter } from './sections/DataLayer'
import { NodeDetail, VersionDiff, ConfirmDelete } from './sections/NodeDetail'
import { ShareDialog, NotificationCenter, TeamWorkspace } from './sections/Collab'
import { BoardEditor, BoardTemplates, BoardSchedule } from './sections/BoardEditor'
import { AlertWizard, AlertDetail } from './sections/Alerts'
import { AdminAudit, AdminApiKeys, AdminModels, AdminBilling } from './sections/Admin'
import { SettingsProfile, SettingsNotify, SettingsSecurity } from './sections/Settings'
import { NotFound, OfflineMode, SkeletonLoad, GenericError } from './sections/SystemStates'
import { PricingPage, DocsPage, ChangelogPage } from './sections/MarketingExtras'

type Item = { slug: string; label: string; el: React.ReactNode }
type Group = { id: string; title: string; items: Item[]; allowedRoles?: string[] }
// 角色 → 可见 group id（C 档：admin 系列仅 admin 可见；其它公开）
// allowedRoles 缺省 = 所有人可见
// 未设置 role 的兜底：和默认 'ops' 同等可见

const GROUPS: Group[] = [
  {
    id: 'app', title: '① 应用主界面',
    items: [
      { slug: 'canvas', label: '变体 A · 横向时间线 + 内联分支', el: <CanvasA /> },
    ],
  },
  {
    id: 'roles', title: '② 角色默认视图',
    items: [
      { slug: 'roles/exec', label: '高管 · 本周一图、不需要 SQL', el: <ExecView /> },
      { slug: 'roles/sales', label: '销售 · 管线 + 漏斗 + 区域', el: <SalesView /> },
      { slug: 'roles/pm', label: '产品 · 健康度 + A/B 实验', el: <PMView /> },
    ],
  },
  {
    id: 'data', title: '④ P0-2 · 数据源 + 语义层 + 指标中心',
    items: [
      { slug: 'data/sources', label: '数据源管理 · 设置中心', el: <DataSources /> },
      { slug: 'data/schema', label: '表结构浏览 + 字段语义打标', el: <SchemaSemantic /> },
      { slug: 'data/metrics', label: '指标中心 · 业务口径 + AI 同义词', el: <MetricCenter /> },
    ],
  },
  {
    id: 'node', title: '⑥ P0-4 · 节点细节',
    items: [
      { slug: 'node/detail', label: '节点详情抽屉 · 概览 / 评论 / 版本 / HITL', el: <NodeDetail /> },
      { slug: 'node/diff', label: '版本对照 · LLM 候选树', el: <VersionDiff /> },
      { slug: 'node/confirm-delete', label: '删除确认 · 级联影响告知', el: <ConfirmDelete /> },
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
    allowedRoles: ['admin'],
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

function filterGroupsByRole(role: string | null | undefined): Group[] {
  return GROUPS.filter(g => !g.allowedRoles || (role && g.allowedRoles.includes(role)))
}

// B 档 · 角色默认视图推荐 (role → 该角色一进来就该看的 slug)
const ROLE_DEFAULT_VIEW: Record<string, { slug: string; label: string; tagline: string }> = {
  exec:    { slug: 'roles/exec',  label: '高管 · 本周一图', tagline: '不用 SQL，看最关键的 4 个数字' },
  sales:   { slug: 'roles/sales', label: '销售 · 管线诊断', tagline: '我的管线 / 区域 / 漏斗' },
  pm:      { slug: 'roles/pm',    label: '产品 · 健康度 + A/B', tagline: 'DAU / 留存 / 实验结果' },
  ops:     { slug: 'canvas',      label: '运营 · 自由问', tagline: '画布式分析起点' },
  analyst: { slug: 'canvas',      label: '分析师 · 自由探索', tagline: 'SQL / 血缘 / 自由探索' },
  admin:   { slug: 'admin/audit', label: '管理员 · 审计日志', tagline: '谁·什么时候·改了什么' },
}

function Index({ profile }: { profile: V2Profile | null }) {
  const role = profile?.role ?? null
  const visibleGroups = filterGroupsByRole(role)
  const defaultView = role ? ROLE_DEFAULT_VIEW[role] : null
  return (
    <div style={{ padding: '48px 64px', maxWidth: 1100, margin: '0 auto', color: 'var(--ink-1)' }}>
      <div className="eyebrow">DataPulse v2 · Design Preview · {role ? `角色: ${role}` : '未设置角色 (默认非 admin)'}</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 56, fontWeight: 400, margin: '12px 0 8px' }}>
        画布式分析 · 设计预览
      </h1>
      <p style={{ color: 'var(--ink-3)', fontSize: 15, lineHeight: 1.7, marginBottom: 24, maxWidth: 720 }}>
        暖色系 · 时间线 + 分支 · 业务人员友好。canvas 已接真实数据；其它页面仍是设计预览。
      </p>
      {defaultView && (
        <Link
          to={defaultView.slug}
          style={{
            display: 'block',
            padding: '20px 24px',
            marginBottom: 40,
            background: 'linear-gradient(135deg, oklch(0.78 0.16 65 / 0.12), oklch(0.58 0.16 35 / 0.08))',
            border: '1px solid var(--amber-deep)',
            borderRadius: 'var(--r-xl)',
            textDecoration: 'none',
            color: 'var(--ink-1)',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--amber-deep)', textTransform: 'uppercase', marginBottom: 6 }}>
            ★ 你的角色默认视图 · {role}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, marginBottom: 4 }}>{defaultView.label}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{defaultView.tagline} →</div>
        </Link>
      )}
      {visibleGroups.map(g => (
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

function ForbiddenPage({ groupTitle }: { groupTitle: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>403 · 无权访问</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, margin: '0 0 12px' }}>
          这一区你的角色看不到
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 24 }}>
          「{groupTitle}」需要 admin 角色。<br />
          可以去 canvas 顶栏点角色切换试试，或者联系工作区 owner。
        </p>
        <Link to="/v2-preview" style={{
          display: 'inline-block', padding: '10px 20px', background: 'var(--ink-1)',
          color: 'var(--paper)', borderRadius: 999, fontSize: 13, textDecoration: 'none',
        }}>← 返回索引</Link>
      </div>
    </div>
  )
}

export default function V2Preview() {
  const [profile, setProfile] = useState<V2Profile | null>(null)
  useEffect(() => {
    v2Api.getMyProfile().then(setProfile).catch(() => {/* 未登录则保持 null */})
  }, [])
  const role = profile?.role ?? null

  return (
    <div className="v2-root" style={{ position: 'fixed', inset: 0, overflow: 'auto', background: 'oklch(0.92 0.015 70)' }}>
      <BackBar />
      <Routes>
        <Route index element={<Index profile={profile} />} />
        {GROUPS.flatMap(g =>
          g.items.map(it => ({ group: g, item: it }))
        ).map(({ group, item }) => {
          const blocked = group.allowedRoles && (!role || !group.allowedRoles.includes(role))
          return (
            <Route
              key={item.slug}
              path={item.slug}
              element={
                blocked ? (
                  <ForbiddenPage groupTitle={group.title} />
                ) : (
                  <div style={{ width: '100%', minHeight: '100vh', height: '100vh' }}>
                    {item.el}
                  </div>
                )
              }
            />
          )
        })}
      </Routes>
    </div>
  )
}
