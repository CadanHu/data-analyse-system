import { useNavigate } from 'react-router-dom'

export default function LearnMore() {
  const navigate = useNavigate()

  const features = [
    {
      id: 1,
      title: '智能 SQL 生成',
      description: '通过自然语言对话，自动生成优化的 SQL 查询语句，无需手动编写复杂代码。',
      details: [
        '支持自然语言查询，如"显示上个月的销售数据"',
        '自动优化 SQL 查询，提高执行效率',
        '支持复杂的聚合、排序、过滤操作',
        '提供查询建议和智能补全'
      ],
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      )
    },
    {
      id: 2,
      title: '进阶多维可视化',
      description: '支持 15+ 种专业图表类型，系统根据数据特征自动选择最佳展示方案。',
      details: [
        '支持雷达图、漏斗图、桑基图、热力图等进阶类型',
        'AI 自动适配：根据数据维度智能生成 ECharts 配置',
        '交互式深度分析：支持多指标对比与趋势预测',
        '完美适配：自适应布局确保多端一致的视觉体验'
      ],
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      id: 3,
      title: '多数据源支持',
      description: '支持 MySQL、PostgreSQL、SQLite 等多种数据库，灵活接入您的数据资产。',
      details: [
        '支持主流关系型数据库',
        '支持 NoSQL 数据库（MongoDB、Redis）',
        '支持云数据库（AWS RDS、Azure SQL）',
        '支持数据仓库（Snowflake、BigQuery）'
      ],
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      )
    },
    {
      id: 4,
      title: '会话管理',
      description: '保存历史对话记录，随时回顾和继续之前的分析工作，提高工作效率。',
      details: [
        '自动保存所有对话历史',
        '支持会话搜索和过滤',
        '可导出会话记录',
        '支持会话分享和协作'
      ],
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    },
    {
      id: 5,
      title: '智能总结',
      description: '自动总结对话内容，为每个会话生成有意义的标题，便于快速识别和查找。',
      details: [
        'AI 自动生成会话标题',
        '提取关键信息和结论',
        '支持手动编辑和优化',
        '智能推荐相关会话'
      ],
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      id: 6,
      title: '响应式设计',
      description: '完美适配桌面端和移动端，随时随地访问您的数据分析平台。',
      details: [
        '支持桌面、平板、手机等多种设备',
        '自适应布局，提供最佳用户体验',
        '支持离线访问和数据缓存',
        '快速加载，流畅交互'
      ],
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-[#050810] text-white">
      <nav className="fixed top-0 left-0 right-0 z-[100] px-6 py-4 bg-[#050810]/95 backdrop-blur-xl border-b border-white/10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="flex items-end gap-1 h-6">
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '40%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '70%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '100%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '60%' }} />
            </div>
            <span className="text-xl font-bold tracking-tight">DataPulse</span>
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              navigate('/app');
            }}
            className="px-4 py-2 text-sm font-medium text-white border border-white/20 rounded-lg hover:border-[#06d6a0]/50 hover:bg-[#06d6a0]/10 transition-all pointer-events-auto"
          >
            进入应用
          </button>
        </div>
      </nav>

      <main className="relative z-10 pt-48 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              深入了解
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                DataPulse
              </span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed max-w-3xl mx-auto">
              探索 DataPulse 的强大功能，了解如何让数据分析变得简单高效
            </p>
          </div>

          <div className="space-y-8">
            {features.map((feature) => (
              <FeatureDetail key={feature.id} {...feature} />
            ))}
          </div>

          <section className="mt-20 bg-gradient-to-r from-[#3b82f6]/10 to-[#06d6a0]/10 border border-white/10 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">准备好开始了吗？</h2>
            <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
              立即体验 DataPulse 的强大功能，让数据驱动您的业务决策
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate('/app')}
                className="px-8 py-4 text-base font-medium text-white bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-xl hover:shadow-lg hover:shadow-[#3b82f6]/30 hover:-translate-y-0.5 transition-all"
              >
                开始使用
              </button>
              <button
                onClick={() => navigate('/about')}
                className="px-8 py-4 text-base font-medium text-gray-400 border border-white/20 rounded-xl hover:border-[#3b82f6]/50 hover:text-white hover:-translate-y-0.5 transition-all"
              >
                了解更多
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function FeatureDetail({ title, description, details, icon }: {
  title: string
  description: string
  details: string[]
  icon: React.ReactNode
}) {
  return (
    <div className="bg-[#111827]/50 border border-white/10 rounded-2xl p-8 md:p-12 hover:border-[#3b82f6]/30 transition-all">
      <div className="flex items-start gap-6 mb-6">
        <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 rounded-xl flex items-center justify-center text-[#3b82f6]">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
          <p className="text-gray-400 text-lg leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {details.map((detail, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-[#06d6a0]/20 rounded-full flex items-center justify-center mt-0.5">
              <svg className="w-3 h-3 text-[#06d6a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-gray-300 text-sm leading-relaxed">{detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
