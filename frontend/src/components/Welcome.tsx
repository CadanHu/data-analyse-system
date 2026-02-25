import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface FeatureCard {
  id: string
  number: string
  title: string
  description: string
  icon: React.ReactNode
  tags?: string[]
}

export default function Welcome() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; opacity: number }> = []
    const particleCount = 50

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((particle, i) => {
        particle.x += particle.vx
        particle.y += particle.vy

        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1

        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(6, 214, 160, ${particle.opacity})`
        ctx.fill()

        particles.slice(i + 1).forEach(otherParticle => {
          const dx = particle.x - otherParticle.x
          const dy = particle.y - otherParticle.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 150) {
            ctx.beginPath()
            ctx.moveTo(particle.x, particle.y)
            ctx.lineTo(otherParticle.x, otherParticle.y)
            ctx.strokeStyle = `rgba(6, 214, 160, ${0.1 * (1 - distance / 150)})`
            ctx.stroke()
          }
        })
      })

      requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleEnterApp = () => {
    // 逻辑将在 Phase 4 通过路由守卫统一处理，这里暂时保持跳转 /app
    // 但为了更好的用户体验，我们可以直接跳转到 login
    navigate('/login')
  }

  return (
    <div 
      className="min-h-screen bg-[#050810] text-white overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
      />

      <div className="fixed top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#06d6a0] to-transparent opacity-30" />
      <div className="fixed top-0 left-0 w-px h-full bg-gradient-to-b from-transparent via-[#06d6a0] to-transparent opacity-30" />

      <nav className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 backdrop-blur-xl border-b border-white/10 transition-all duration-300 ${scrolled ? 'bg-[#050810]/95 shadow-lg' : 'bg-[#050810]/80'}`} style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-end gap-1 h-6">
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '40%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '70%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '100%' }} />
              <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '60%' }} />
            </div>
            <span className="text-xl font-bold tracking-tight">DataPulse</span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">功能</a>
            <a href="#demo" className="text-sm text-gray-400 hover:text-white transition-colors">演示</a>
            <Link to="/about" className="text-sm text-gray-400 hover:text-white transition-colors">关于</Link>
            <button
              onClick={handleEnterApp}
              className="px-4 py-2 text-sm font-medium text-white border border-white/20 rounded-lg hover:border-[#06d6a0]/50 hover:bg-[#06d6a0]/10 transition-all"
            >
              进入应用
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 min-h-screen flex items-center justify-center px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-sm text-[#06d6a0] font-mono mb-8 opacity-0 animate-[fadeInUp_0.8s_ease-out_forwards]">
            <span className="w-5 h-px bg-[#06d6a0]" />
            <span className="uppercase tracking-widest">AI-Powered Analytics</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6 opacity-0 animate-[fadeInUp_0.8s_ease-out_0.1s_forwards]">
            <span className="block">智能数据分析</span>
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
              驱动业务增长
            </span>
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed opacity-0 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards]">
            通过自然语言对话，快速查询、分析和可视化您的数据。
            让 AI 成为您最强大的数据分析师。
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 opacity-0 animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]">
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 text-base font-medium text-white bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-xl hover:shadow-lg hover:shadow-[#3b82f6]/30 hover:-translate-y-0.5 transition-all"
            >
              开始使用
            </button>
            <button
              onClick={() => navigate('/learn-more')}
              className="px-8 py-4 text-base font-medium text-gray-400 hover:text-white transition-all flex items-center gap-2"
            >
              了解更多
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-center gap-12 pt-8 border-t border-white/10 opacity-0 animate-[fadeInUp_0.8s_ease-out_0.4s_forwards]">
            <div className="text-center">
              <div className="text-3xl font-bold mb-1">10+</div>
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider">数据源</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-1">50+</div>
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider">分析类型</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-1">100%</div>
              <div className="text-xs text-gray-500 font-mono uppercase tracking-wider">自动化</div>
            </div>
          </div>
        </div>
      </main>

      <section id="features" className="relative z-10 py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16 items-end">
            <h2 className="text-4xl md:text-5xl font-bold leading-tight">
              强大的功能
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                无限的可能
              </span>
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed text-right">
              通过先进的 AI 技术，为您提供全方位的数据分析解决方案。
              从数据查询到可视化，一切尽在掌握。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              id="1"
              number="01"
              title="智能 SQL 生成"
              description="通过自然语言对话，自动生成优化的 SQL 查询语句，无需手动编写复杂代码。"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              }
              tags={['SQL', 'AI', '自动化']}
            />
            <FeatureCard
              id="2"
              number="02"
              title="实时数据可视化"
              description="支持多种图表类型，实时展示数据分析结果，让数据洞察一目了然。"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              tags={['图表', '实时', '可视化']}
            />
            <FeatureCard
              id="3"
              number="03"
              title="多数据源支持"
              description="支持 MySQL、PostgreSQL、SQLite 等多种数据库，灵活接入您的数据资产。"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              }
              tags={['MySQL', 'PostgreSQL', 'SQLite']}
            />
            <FeatureCard
              id="4"
              number="04"
              title="会话管理"
              description="保存历史对话记录，随时回顾和继续之前的分析工作，提高工作效率。"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              }
              tags={['历史', '会话', '效率']}
            />
            <FeatureCard
              id="5"
              number="05"
              title="智能总结"
              description="自动总结对话内容，为每个会话生成有意义的标题，便于快速识别和查找。"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              tags={['AI', '总结', '智能']}
            />
            <FeatureCard
              id="6"
              number="06"
              title="响应式设计"
              description="完美适配桌面端和移动端，随时随地访问您的数据分析平台。"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              }
              tags={['响应式', '移动端', '适配']}
            />
          </div>
        </div>
      </section>

      <section id="demo" className="relative z-10 py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              实时预览
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                即刻体验
              </span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              直观的数据分析界面，让复杂的数据变得简单易懂
            </p>
          </div>

          <div className="bg-[#0a0f1a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#111827] border-b border-white/10">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <div className="flex-1 mx-4 bg-[#050810] border border-white/10 rounded-md px-4 py-1.5 text-xs text-gray-500 font-mono">
                https://datapulse.ai/dashboard
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 min-h-[500px]">
              <div className="bg-[#050810] border-r border-white/10 p-4">
                <div className="space-y-2">
                  <div className="px-3 py-2 bg-gradient-to-r from-[#3b82f6]/20 to-[#06d6a0]/10 text-[#3b82f6] rounded-lg text-sm font-medium border-l-3 border-[#3b82f6]">
                    仪表盘
                  </div>
                  <div className="px-3 py-2 text-gray-400 rounded-lg text-sm hover:bg-white/5 cursor-pointer transition-colors">
                    数据查询
                  </div>
                  <div className="px-3 py-2 text-gray-400 rounded-lg text-sm hover:bg-white/5 cursor-pointer transition-colors">
                    图表分析
                  </div>
                  <div className="px-3 py-2 text-gray-400 rounded-lg text-sm hover:bg-white/5 cursor-pointer transition-colors">
                    历史记录
                  </div>
                  <div className="px-3 py-2 text-gray-400 rounded-lg text-sm hover:bg-white/5 cursor-pointer transition-colors">
                    设置
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3 p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <KPICard label="总查询数" value="12,458" trend="+12.5%" />
                  <KPICard label="活跃会话" value="256" trend="+8.3%" />
                  <KPICard label="数据量" value="10.2 TB" trend="+15.7%" />
                  <KPICard label="成功率" value="99.9%" trend="+0.1%" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-[#111827]/50 border border-white/10 rounded-lg p-6">
                    <h3 className="text-sm text-gray-400 mb-4 font-mono">查询趋势</h3>
                    <div className="h-48 flex items-end gap-2">
                      {[65, 45, 78, 52, 88, 62, 95, 70, 85, 60, 92, 75].map((height, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-gradient-to-t from-[#3b82f6] to-[#06d6a0] rounded-t transition-all hover:opacity-80"
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#111827]/50 border border-white/10 rounded-lg p-6">
                    <h3 className="text-sm text-gray-400 mb-4 font-mono">数据分布</h3>
                    <div className="space-y-3">
                      <ProgressBar label="用户数据" value={45} color="from-[#3b82f6]" />
                      <ProgressBar label="订单数据" value={30} color="from-[#06d6a0]" />
                      <ProgressBar label="产品数据" value={15} color="from-[#8b5cf6]" />
                      <ProgressBar label="其他" value={10} color="from-[#f59e0b]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20 px-6 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-[#3b82f6]/15 to-[#06d6a0]/8 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-white to-[#3b82f6] bg-clip-text text-transparent">
            准备好开始了吗？
          </h2>
          <p className="text-gray-400 text-lg mb-10 leading-relaxed max-w-xl mx-auto">
            立即体验智能数据分析的强大功能，让数据驱动您的业务决策
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <button
              onClick={handleEnterApp}
              className="px-8 py-4 text-base font-medium text-white bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-xl hover:shadow-lg hover:shadow-[#3b82f6]/30 hover:-translate-y-0.5 transition-all"
            >
              开始使用
            </button>
            <Link
              to="/learn-more"
              className="px-8 py-4 text-base font-medium text-gray-400 border border-white/20 rounded-xl hover:border-[#3b82f6]/50 hover:text-white hover:-translate-y-0.5 transition-all flex items-center gap-2"
            >
              了解更多
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <p className="text-sm text-gray-500">
            免费使用 · 无需信用卡 · 即刻开始
          </p>
        </div>
      </section>

      <footer className="relative z-10 py-16 px-6 border-t border-white/10 bg-[#050810]/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-end gap-1 h-6">
                  <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '40%' }} />
                  <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '70%' }} />
                  <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '100%' }} />
                  <div className="w-1.5 bg-gradient-to-b from-[#3b82f6] to-[#06d6a0] rounded-sm" style={{ height: '60%' }} />
                </div>
                <span className="text-xl font-bold tracking-tight">DataPulse</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                智能数据分析平台，让数据洞察变得简单高效
              </p>
              <div className="flex gap-2">
                <a href="#" className="w-9 h-9 bg-[#3b82f6]/10 rounded-full flex items-center justify-center hover:bg-[#3b82f6] transition-colors">
                  <svg className="w-4 h-4 text-[#3b82f6] hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" />
                  </svg>
                </a>
                <a href="#" className="w-9 h-9 bg-[#3b82f6]/10 rounded-full flex items-center justify-center hover:bg-[#3b82f6] transition-colors">
                  <svg className="w-4 h-4 text-[#3b82f6] hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-4">产品</h4>
              <ul className="space-y-3">
                <li><Link to="/features" className="text-sm text-gray-400 hover:text-white transition-colors">功能特性</Link></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">定价方案</a></li>
                <li><Link to="/changelog" className="text-sm text-gray-400 hover:text-white transition-colors">更新日志</Link></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">路线图</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-4">资源</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">文档</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">API</a></li>
                <li><Link to="/tutorial" className="text-sm text-gray-400 hover:text-white transition-colors">教程</Link></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">博客</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-4">公司</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">关于我们</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">联系我们</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">隐私政策</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">服务条款</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-white/10 text-center">
            <p className="text-sm text-gray-500">
              © 2024 DataPulse. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ number, title, description, icon, tags }: FeatureCard) {
  return (
    <div className="bg-[#111827]/50 border border-white/10 rounded-xl p-6 hover:border-[#3b82f6]/30 hover:shadow-lg hover:shadow-[#3b82f6]/10 hover:-translate-y-1 transition-all cursor-pointer group">
      <div className="text-xs text-[#06d6a0] font-mono mb-4 opacity-60">{number}</div>
      <div className="w-12 h-12 bg-gradient-to-br from-[#3b82f6]/20 to-[#06d6a0]/10 rounded-lg flex items-center justify-center mb-4 text-[#3b82f6]">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-400 mb-4 leading-relaxed">{description}</p>
      {tags && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span key={i} className="text-xs font-mono px-2 py-1 bg-[#3b82f6]/10 border border-[#3b82f6]/20 rounded-full text-[#3b82f6]">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function KPICard({ label, value, trend }: { label: string; value: string; trend: string }) {
  const isPositive = trend.startsWith('+')
  return (
    <div className="bg-[#111827]/50 border border-white/10 rounded-lg p-4">
      <div className="text-xs text-gray-500 font-mono mb-1">{label}</div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className={`text-xs flex items-center gap-1 ${isPositive ? 'text-[#06d6a0]' : 'text-red-500'}`}>
        {isPositive ? '↑' : '↓'} {trend}
      </div>
    </div>
  )
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-500">{value}%</span>
      </div>
      <div className="h-2 bg-[#050810] rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${color} to-[#06d6a0] rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}
