import { Link } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'

interface Feature {
  id: number
  title: string
  description: string
  icon: React.ReactNode
  details: string[]
  category: string
}

export default function Features() {
  const { t } = useTranslation()
  
  const features: Feature[] = [
    {
      id: 1,
      title: t('feature.sql.title'),
      description: t('feature.sql.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
      category: t('feature.core'),
      details: [
        'Support complex queries: JOIN, subqueries, aggregate functions',
        'Auto optimization: AI optimizes query performance based on data structure',
        'Error fixing: Automatically detect and fix SQL syntax errors',
        'Multi-database support: Native MySQL & PostgreSQL adaptation'
      ]
    },
    {
      id: 2,
      title: t('feature.viz.title'),
      description: t('feature.viz.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      category: t('feature.core'),
      details: [
        'Rich chart library: Radar, Funnel, Sankey, Heatmap, Gantt charts',
        'Auto-adapt engine: AI identifies data intent, generates ECharts config in seconds',
        'Interactive deep analysis: Multi-metric comparison, trend prediction, correlation analysis',
        'Fullscreen mode: One-click fullscreen canvas for immersive insights'
      ]
    },
    {
      id: 3,
      title: t('feature.thinking.title'),
      description: t('feature.thinking.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      category: t('feature.ai'),
      details: [
        'Thinking chain display: Complete R1 model reasoning logic',
        'Deep thinking: Multi-step decomposition for complex business problems',
        'Logic error correction: Automatically detect and fix analysis deviations',
        'Learning aid: Help business users understand data relationships'
      ]
    },
    {
      id: 4,
      title: t('feature.preview.title'),
      description: t('feature.preview.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01m-.01 4h.01" />
        </svg>
      ),
      category: t('feature.ai'),
      details: [
        'HITL mechanism: Human in the loop ensures analysis direction',
        'Metric confirmation: Suggest first, then execute to avoid invalid SQL',
        'Risk warning: Predict delays from large data queries',
        'Metric suggestions: Proactively recommend related business metrics'
      ]
    },
    {
      id: 5,
      title: t('feature.database.title'),
      description: t('feature.database.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
      category: t('feature.data'),
      details: [
        'Production support: MySQL 8.0+ / PostgreSQL 14+',
        'SQLAlchemy architecture: High-performance async ORM execution',
        'Security sandbox: Multi-layer SQL injection prevention & read-only permissions',
        'Multi-database: One-click switch between different business environments'
      ]
    },
    {
      id: 6,
      title: t('feature.schema.title'),
      description: t('feature.schema.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      category: t('feature.data'),
      details: [
        'Auto refresh: Real-time scan for table structure changes',
        'Sample data sampling: AI reads first 3 rows to understand content',
        'Index awareness: Prioritize index fields for SQL optimization',
        'Metadata enhancement: Auto-identify primary/foreign keys for accurate JOINs'
      ]
    },
    {
      id: 7,
      title: t('feature.file.title'),
      description: t('feature.file.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
      category: t('feature.enhanced'),
      details: [
        'Multi-format support: PDF (PyMuPDF/MinerU), Excel, CSV',
        'Semantic search: Precise content retrieval based on vector database',
        'Metric alignment: Ensure AI-generated metrics match business definitions',
        'Long document processing: Support for massive text chunking and context injection'
      ]
    },
    {
      id: 8,
      title: t('feature.stream.title'),
      description: t('feature.stream.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      ),
      category: t('feature.enhanced'),
      details: [
        'Async streaming: Real-time transmission of thinking chains and results',
        'Buffer-free: X-Accel-Buffering optimization prevents lag',
        'POST support: Perfect for complex parameter streaming',
        'Mobile optimized: Seamless reconnection for mobile devices'
      ]
    },
    {
      id: 9,
      title: t('feature.session.title'),
      description: t('feature.session.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      category: t('feature.ux'),
      details: [
        'History persistence: Auto-save to MySQL database',
        'Smart titles: AI auto-generates precise session names',
        'Quick search: Real-time session search by title keywords',
        'State restoration: Instantly restore charts and SQL when switching sessions'
      ]
    },
    {
      id: 10,
      title: t('feature.mobile.title'),
      description: t('feature.mobile.desc'),
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      category: t('feature.ux'),
      details: [
        'Native experience: Built with Capacitor 6 for mobile apps',
        'Landscape optimization: Compressed header and layout for maximum canvas',
        'Touch-friendly: Chart interaction optimized for mobile devices',
        'Offline viewing: Browse loaded history without reconnection'
      ]
    }
  ]
  
  const categories = Array.from(new Set(features.map(f => f.category)))

  return (
    <div className="min-h-screen bg-[#050810] text-white">
      <nav className="fixed top-0 left-0 right-0 z-[100] px-6 py-4 backdrop-blur-xl border-b border-white/10 bg-[#050810]/95" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex items-end gap-1 h-6">
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '40%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '70%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '100%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '60%' }} />
            </div>
            <span className="text-xl font-bold tracking-tight">DataPulse</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-xs text-gray-400 hover:text-white transition-colors">{t('nav.home')}</Link>
            <Link
              to="/app"
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-lg hover:shadow-lg transition-all pointer-events-auto z-[110]"
            >
              {t('features.enterApp')}
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-48 pb-20 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <div className="text-center mb-24 max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-black mb-8">
              {t('features.title')}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                {t('features.subtitle')}
              </span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed">
              {t('features.description')}
            </p>
          </div>

          <div className="w-full space-y-24">
            {categories.map((category) => (
              <div key={category} className="w-full">
                <div className="flex items-center gap-6 mb-12">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <h2 className="text-2xl md:text-3xl font-bold text-[#06d6a0] tracking-tight">{category}</h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 justify-items-center max-w-4xl mx-auto">
                  {features.filter(f => f.category === category).map((feature) => (
                    <div
                      key={feature.id}
                      className="w-full max-w-sm bg-[#0a0f1a]/50 border border-white/10 rounded-[2rem] p-8 hover:border-[#06d6a0]/50 hover:bg-[#0a0f1a]/80 hover:shadow-2xl hover:shadow-[#06d6a0]/5 transition-all duration-500 group flex flex-col"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                        <div className="text-[#3b82f6] group-hover:text-[#06d6a0] transition-colors">
                          {feature.icon}
                        </div>
                      </div>

                      <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                      <p className="text-gray-400 text-sm mb-6 leading-relaxed flex-1">{feature.description}</p>

                      <ul className="space-y-3 pt-6 border-t border-white/5">
                        {feature.details.map((detail, index) => (
                          <li key={index} className="flex items-start gap-3 text-xs text-gray-400">
                            <svg className="w-4 h-4 text-[#06d6a0] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0f1a] border border-white/10 rounded-xl">
              <svg className="w-5 h-5 text-[#06d6a0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-gray-300">
                {t('features.afterRead')}{' '}
                <Link to="/app" className="text-[#06d6a0] hover:underline font-medium">
                  {t('features.enterApp')}
                </Link>{' '}
                {t('common.startUsing')}
              </span>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-[#050810]/50 py-8 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-gray-500">
            © 2026 DataPulse. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
