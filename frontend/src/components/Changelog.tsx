import { useNavigate } from 'react-router-dom'

export default function Changelog() {
  const navigate = useNavigate()

  const logs = [
    {
      version: 'v1.7.0',
      date: '2026-02-27',
      title: '多维进阶可视化与极致响应式优化',
      tags: ['Major', 'UI/UX', 'Engine'],
      items: [
        '新增 15+ 种进阶图表支持：包括雷达图、漏斗图、热力图、甘特图等。',
        '引入 AI 驱动的 ECharts 动态配置引擎，实现图表类型自动适配。',
        '实施横屏极限空间优化，大幅提升移动端在横屏下的内容展示比例。',
        '优化空状态引导，新增预设指令一键分析功能。',
        '修复了 Decimal 类型数据在 JSON 序列化时的崩溃问题。',
        '增强 SQL 安全拦截，新增 AI 自我修正逻辑。'
      ]
    },
    {
      version: 'v1.6.0',
      date: '2026-02-20',
      title: '架构全面升级与多数据库支持',
      tags: ['Architecture', 'Database'],
      items: [
        '彻底废除 SQLite，全面转向 SQLAlchemy 2.0 异步驱动。',
        '新增对 MySQL 和 PostgreSQL 的原生适配。',
        '标准化 SSE 流式协议，响应速度提升 40%。',
        '引入跨库 Schema 自动提取服务。'
      ]
    },
    {
      version: 'v1.5.0',
      date: '2026-02-10',
      title: '移动端原生适配与思考可视化',
      tags: ['Mobile', 'Thinking'],
      items: [
        '基于 Capacitor 6 实现 iOS/Android 双端适配。',
        '新增 DeepSeek R1 思考过程可视化方案。',
        '优化了消息列表的滚动性能与渲染流畅度。'
      ]
    }
  ]

  return (
    <div className="min-h-screen bg-[#050810] text-white">
      <nav className="fixed top-0 left-0 right-0 z-[100] px-6 py-4 bg-[#050810]/95 backdrop-blur-xl border-b border-white/10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-all">
            <div className="flex items-end gap-1 h-6">
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm h-[40%]" />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm h-[70%]" />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm h-[100%]" />
            </div>
            <span className="text-xl font-bold tracking-tight">DataPulse</span>
          </button>
          <button onClick={() => navigate('/app')} className="px-4 py-2 text-sm font-medium text-white border border-white/20 rounded-lg hover:border-[#06d6a0]/50 hover:bg-[#06d6a0]/10 transition-all">
            进入应用
          </button>
        </div>
      </nav>

      <main className="relative z-10 pt-48 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-16">
            <h1 className="text-5xl font-black mb-4">更新日志</h1>
            <p className="text-xl text-gray-500 font-medium">每一次进化，都为您带来更极致的分析体验</p>
          </div>

          <div className="space-y-12">
            {logs.map((log) => (
              <div key={log.version} className="relative pl-8 md:pl-12 border-l-2 border-white/5">
                <div className="absolute -left-[9px] top-0 w-4 h-4 bg-[#06d6a0] rounded-full shadow-[0_0_15px_rgba(6,214,160,0.5)]" />
                
                <div className="mb-4 flex flex-wrap items-center gap-4">
                  <span className="text-3xl font-black text-white">{log.version}</span>
                  <span className="text-sm font-mono text-gray-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">{log.date}</span>
                  <div className="flex gap-2">
                    {log.tags.map(tag => (
                      <span key={tag} className="text-[10px] font-bold uppercase tracking-wider text-[#3b82f6] bg-[#3b82f6]/10 px-2 py-0.5 rounded-md border border-[#3b82f6]/20">{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-[#111827]/50 border border-white/10 rounded-2xl p-8 hover:bg-[#111827]/80 transition-all">
                  <h3 className="text-xl font-bold mb-6 text-gray-200">{log.title}</h3>
                  <ul className="space-y-4">
                    {log.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-gray-400 leading-relaxed">
                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#06d6a0]/50 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
