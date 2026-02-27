import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Welcome() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  // 粒子背景动画
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
    for (let i = 0; i < 50; i++) {
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
      particles.forEach((p, i) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(6, 214, 160, ${p.opacity})`
        ctx.fill()
        particles.slice(i + 1).forEach(p2 => {
          const dx = p.x - p2.x
          const dy = p.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `rgba(6, 214, 160, ${0.1 * (1 - dist / 150)})`
            ctx.stroke()
          }
        })
      })
      requestAnimationFrame(animate)
    }
    animate()
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-[#050810] text-white overflow-hidden relative">
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" />

      {/* 背景光晕装饰 */}
      <div className="fixed -top-[10%] -left-[10%] w-[40%] h-[40%] bg-[#3b82f6]/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="fixed -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-[#06d6a0]/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] bg-[#3b82f6]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="fixed top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#06d6a0] to-transparent opacity-30" />
      <div className="fixed top-0 left-0 w-px h-full bg-gradient-to-b from-transparent via-[#06d6a0] to-transparent opacity-30" />

      <nav className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 backdrop-blur-xl border-b border-white/10 transition-all duration-300 ${scrolled ? 'bg-[#050810]/95 shadow-lg' : 'bg-[#050810]/80'}`} style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-end gap-1 h-6">
              <div className="w-1.5 bg-gradient-to-t from-[#3b82f6] to-[#06d6a0] rounded-sm h-[40%]" />
              <div className="w-1.5 bg-gradient-to-t from-[#3b82f6] to-[#06d6a0] rounded-sm h-[70%]" />
              <div className="w-1.5 bg-gradient-to-t from-[#3b82f6] to-[#06d6a0] rounded-sm h-[100%]" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">DataPulse AI</span>
          </div>
          <div className="flex items-center gap-4 md:gap-8 text-sm">
            <Link to="/features" className="text-gray-400 hover:text-white transition-colors hidden md:block font-medium">功能</Link>
            <Link to="/tutorial" className="text-gray-400 hover:text-white transition-colors hidden md:block font-medium">教程</Link>
            <Link to="/about" className="text-gray-400 hover:text-white transition-colors hidden md:block font-medium">关于</Link>
            <button onClick={() => navigate('/login')} className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-xl hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all active:scale-95">
              进入应用
            </button>
          </div>
        </div>
      </nav>

      {/* 主视觉区 */}
      <main className="relative z-10 min-h-screen flex items-center justify-center px-6 pt-20">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#06d6a0] font-mono mb-10 opacity-0 animate-[fadeInUp_0.8s_ease-out_forwards]">
            <span className="w-2 h-2 rounded-full bg-[#06d6a0] animate-pulse" />
            V1.7.0 · 进阶多维可视化与 AI 自动适配已就绪
          </div>

          <h1 className="text-6xl md:text-8xl font-black leading-[1.1] mb-8 tracking-tighter opacity-0 animate-[fadeInUp_0.8s_ease-out_0.1s_forwards]">
            对话即<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] via-[#06d6a0] to-[#3b82f6] bg-[length:200%_auto] animate-gradient-flow">洞察</span>
            <br />
            全场景数据分析引擎
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed font-light opacity-0 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards]">
            基于 DeepSeek R1 深度思考能力，通过自然语言轻松驾驭 MySQL 与 PostgreSQL。
            15+ 种进阶图表、AI 自动适配展示方案、RAG 知识库增强，让数据决策从未如此简单。
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 mb-20 opacity-0 animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]">
            <button onClick={() => navigate('/login')} className="group relative w-full sm:w-auto px-10 py-5 text-base font-bold text-white overflow-hidden rounded-2xl transition-all active:scale-95">
              <div className="absolute inset-0 bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] transition-transform group-hover:scale-110" />
              <span className="relative z-10">开始免费使用</span>
            </button>
            <button onClick={() => navigate('/learn-more')} className="w-full sm:w-auto px-10 py-5 text-base font-bold text-gray-300 border border-white/10 rounded-2xl hover:bg-white/5 hover:border-white/20 transition-all flex items-center justify-center gap-2 group active:scale-95">
              查看技术架构
              <svg className="w-4.5 h-4.5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>

          {/* 实时数据看板演示 */}
          <div className="mt-10 relative group opacity-0 animate-[fadeInUp_0.8s_ease-out_0.4s_forwards]">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-[2.5rem] blur-2xl opacity-10 group-hover:opacity-20 transition duration-1000"></div>
            <div className="relative bg-[#0a0f1a]/80 backdrop-blur-3xl border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/5">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                </div>
                <div className="text-[10px] text-gray-500 font-mono tracking-[0.3em] font-bold">DATAPULSE INTELLIGENT INTERFACE</div>
                <div className="w-12" />
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shadow-inner">
                    <div className="text-[10px] text-[#06d6a0] mb-2 uppercase font-black tracking-widest">Query Input</div>
                    <div className="text-sm text-gray-200 font-medium">对比过去半年各品类的销售毛利与增长率，并分析异常波动原因。</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-20">🧠</div>
                    <div className="text-[10px] text-[#3b82f6] mb-2 uppercase font-black tracking-widest">DeepSeek R1 Thinking</div>
                    <div className="text-[10px] text-gray-400 font-mono leading-relaxed space-y-1">
                      <p className="animate-pulse">&gt;&gt; 正在提取多维指标 (Profit, Growth)...</p>
                      <p className="opacity-60">&gt;&gt; 自动识别最佳图表: 雷达图 (Radar)...</p>
                      <p className="opacity-40">&gt;&gt; 生成趋势预测曲线...</p>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2 bg-black/40 rounded-2xl p-6 border border-white/5 flex flex-col justify-center items-center min-h-[240px] relative overflow-hidden group/viz">
                   <div className="absolute inset-0 bg-gradient-to-br from-[#3b82f6]/5 to-transparent opacity-0 group-hover/viz:opacity-100 transition-opacity" />
                   <div className="flex items-end gap-3 h-40 w-full justify-around px-4 relative z-10">
                      {[40, 75, 55, 95, 80, 65, 85, 50, 90, 70].map((h, i) => (
                        <div key={i} className="w-full max-w-[20px] bg-gradient-to-t from-[#3b82f6] to-[#06d6a0] rounded-t-lg shadow-[0_0_15px_rgba(6,214,160,0.2)] animate-[growUp_1.5s_ease-out_forwards]" style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }} />
                      ))}
                   </div>
                   <div className="mt-6 text-[10px] text-[#06d6a0] font-bold font-mono uppercase tracking-[0.2em] animate-pulse">
                     Adaptive Visualization Engine Active
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 功能特性卡片区 */}
      <section id="features" className="relative z-10 py-40 px-6 bg-[#050810]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-black mb-6 text-white tracking-tight">生产力级分析套件</h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base font-light">融合前沿 AI 技术与工业级数据架构，为专业决策而生</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
            <RealFeatureCard
              title="进阶多维可视化"
              desc="支持雷达图、漏斗图、桑基图等 15+ 种进阶图表。AI 自动识别数据特征，秒级生成最佳展示方案。"
              icon="📊"
            />
            <RealFeatureCard
              title="DeepSeek R1 推理"
              desc="集成最强开源 R1 模型。不仅提供答案，更完整展示思维链逻辑，确保分析过程透明可追溯。"
              icon="🧠"
            />
            <RealFeatureCard
              title="RAG 知识库增强"
              desc="支持 PDF/Word/Excel 上传。结合语义搜索技术，让 AI 基于您的私有文档进行专业口径解读。"
              icon="📚"
            />
            <RealFeatureCard
              title="全场景数据库支持"
              desc="原生兼容 MySQL 与 PostgreSQL 核心架构。支持复杂 JOIN 查询、窗口函数及百万级数据分析。"
              icon="🗄️"
            />
            <RealFeatureCard
              title="移动端原生体验"
              desc="基于 Capacitor 6 构建。在 iOS 与 Android 上均可享受丝滑的流式响应与离线记录查阅。"
              icon="📱"
            />
            <RealFeatureCard
              title="企业级安全架构"
              desc="完整的 JWT 认证系统，支持多用户隔离与私有化部署，确保核心业务数据隐私安全。"
              icon="🔒"
            />
          </div>
        </div>
      </section>

      {/* 技术栈徽章 */}
      <section className="relative z-10 py-24 border-t border-white/5 bg-[#050810]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-30 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-1000">
            <TechBadge label="LangChain 0.3" />
            <TechBadge label="FastAPI" />
            <TechBadge label="SQLAlchemy" />
            <TechBadge label="DeepSeek R1" />
            <TechBadge label="ECharts 5" />
            <TechBadge label="Tailwind v3" />
          </div>
        </div>
      </section>

      <footer className="relative z-10 py-24 px-6 text-center border-t border-white/5 bg-[#050810]">
        <p className="text-gray-600 text-[10px] font-black tracking-[0.5em] uppercase mb-4">
          DataPulse AI · Intelligence Driven · Privacy First
        </p>
        <p className="text-gray-500 text-xs font-light">
          © 2026 DataPulse AI 智能分析平台 · 核心引擎 v1.7.0
        </p>
      </footer>

      {/* 添加关键动画的 Style 标签 */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes growUp {
          from { height: 0; transform: scaleY(0); }
          to { height: var(--final-height); transform: scaleY(1); }
        }
        @keyframes gradient-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-flow {
          background-size: 200% auto;
          animation: gradient-flow 6s linear infinite;
        }
      `}</style>
    </div>
  )
}

function RealFeatureCard({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-[#3b82f6]/30 hover:bg-white/[0.04] transition-all group cursor-default">
      <div className="text-4xl mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">{icon}</div>
      <h3 className="text-xl font-bold mb-3 text-white tracking-tight">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed font-light">{desc}</p>
    </div>
  )
}

function TechBadge({ label }: { label: string }) {
  return (
    <div className="px-4 py-1.5 rounded-full border border-white/10 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
      {label}
    </div>
  )
}
