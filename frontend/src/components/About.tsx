import { useNavigate } from 'react-router-dom'

export default function About() {
  const navigate = useNavigate()

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
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              关于
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                DataPulse
              </span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto">
              DeepSeek R1 驱动的全场景智能数据分析引擎
            </p>
          </div>

          <div className="space-y-12">
            <section className="bg-[#111827]/50 border border-white/10 rounded-2xl p-8 md:p-12">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-10 h-10 bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                我们的使命
              </h2>
              <p className="text-gray-300 leading-relaxed text-lg">
                DataPulse v1.7.0 致力于通过最前沿的 AI 推理技术与工业级数据库架构，重新定义企业级数据分析体验。
                我们通过 DeepSeek R1 的深度思考能力，将复杂的业务语言精准转化为高性能 SQL，
                并结合 15+ 种进阶可视化方案，让数据洞察不再是专家的特权，而是每一位决策者的得力助手。
              </p>
            </section>

            <section className="bg-[#111827]/50 border border-white/10 rounded-2xl p-8 md:p-12">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-10 h-10 bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </span>
                核心技术栈
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ValueCard
                  title="DeepSeek R1 推理"
                  description="集成 R1 深度思考模型，提供透明可追溯的思维链分析与超高精度 SQL 生成。"
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  }
                />
                <ValueCard
                  title="SQLAlchemy 异步架构"
                  description="基于 SQLAlchemy 2.0 实现 MySQL 与 PostgreSQL 的多库平滑切换与高性能异步执行。"
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                  }
                />
                <ValueCard
                  title="进阶可视化引擎"
                  description="自动适配雷达图、漏斗图、桑基图等 15+ 种专业可视化方案，数据洞察一目了然。"
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  }
                />
                <ValueCard
                  title="RAG 知识库增强"
                  description="支持 PDF 与 Excel 深度解析，让 AI 基于私有业务口径进行精准分析。"
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  }
                />
              </div>
            </section>

            <section className="bg-[#111827]/50 border border-white/10 rounded-2xl p-8 md:p-12">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-10 h-10 bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </span>
                团队介绍
              </h2>
              <p className="text-gray-300 leading-relaxed text-lg mb-6">
                DataPulse 由一群热爱技术的开发者、数据科学家和产品专家组成。
                我们来自全球顶尖科技公司，拥有丰富的数据分析、人工智能和产品开发经验。
                我们的目标是打造最易用的数据分析平台，让数据驱动决策成为每个人的能力。
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#3b82f6] mb-2">50+</div>
                  <div className="text-sm text-gray-400">团队成员</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#06d6a0] mb-2">10+</div>
                  <div className="text-sm text-gray-400">年行业经验</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#8b5cf6] mb-2">500+</div>
                  <div className="text-sm text-gray-400">企业客户</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#f59e0b] mb-2">1000万+</div>
                  <div className="text-sm text-gray-400">查询次数</div>
                </div>
              </div>
            </section>

            <section className="bg-[#111827]/50 border border-white/10 rounded-2xl p-8 md:p-12">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-10 h-10 bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                联系我们
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ContactCard
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  }
                  title="邮箱"
                  content="contact@datapulse.ai"
                />
                <ContactCard
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  }
                  title="地址"
                  content="北京市朝阳区科技园"
                />
                <ContactCard
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  }
                  title="电话"
                  content="+86 400-123-4567"
                />
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

function ValueCard({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[#050810]/50 border border-white/10 rounded-xl p-6 hover:border-[#3b82f6]/30 transition-all">
      <div className="text-[#3b82f6] mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
    </div>
  )
}

function ContactCard({ icon, title, content }: { icon: React.ReactNode; title: string; content: string }) {
  return (
    <div className="bg-[#050810]/50 border border-white/10 rounded-xl p-6 hover:border-[#3b82f6]/30 transition-all">
      <div className="text-[#3b82f6] mb-3">{icon}</div>
      <h3 className="text-sm font-semibold text-gray-400 mb-1">{title}</h3>
      <p className="text-base text-white">{content}</p>
    </div>
  )
}
