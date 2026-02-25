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
    <div className="min-h-screen bg-[#050810] text-white overflow-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" />

      <div className="fixed top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#06d6a0] to-transparent opacity-30" />
      <div className="fixed top-0 left-0 w-px h-full bg-gradient-to-b from-transparent via-[#06d6a0] to-transparent opacity-30" />

      <nav className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 backdrop-blur-xl border-b border-white/10 transition-all duration-300 ${scrolled ? 'bg-[#050810]/95 shadow-lg' : 'bg-[#050810]/80'}`} style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-end gap-1 h-6">
              <div className="w-1.5 bg-[#3b82f6] rounded-sm h-[40%]" />
              <div className="w-1.5 bg-[#06d6a0] rounded-sm h-[70%]" />
              <div className="w-1.5 bg-[#3b82f6] rounded-sm h-[100%]" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">DataPulse AI</span>
          </div>
          <div className="flex items-center gap-4 md:gap-8 text-sm">
            <Link to="/features" className="text-gray-400 hover:text-white transition-colors hidden md:block">功能</Link>
            <Link to="/tutorial" className="text-gray-400 hover:text-white transition-colors hidden md:block">教程</Link>
            <Link to="/about" className="text-gray-400 hover:text-white transition-colors hidden md:block">关于</Link>
            <button onClick={() => navigate('/login')} className="px-5 py-2 text-sm font-medium text-white bg-[#3b82f6]/20 border border-[#3b82f6]/50 rounded-xl hover:bg-[#3b82f6]/30 transition-all">
              进入应用
            </button>
          </div>
        </div>
      </nav>

      {/* 主视觉区 */}
      <main className="relative z-10 min-h-screen flex items-center justify-center px-6 pt-20">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-[#06d6a0] font-mono mb-8 opacity-0 animate-[fadeInUp_0.8s_ease-out_forwards]">
            <span className="w-2 h-2 rounded-full bg-[#06d6a0] animate-pulse" />
            V1.3.0 · 已集成 DeepSeek R1 推理模型
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6 tracking-tight opacity-0 animate-[fadeInUp_0.8s_ease-out_0.1s_forwards]">
            对话即<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">洞察</span>
            <br />
            AI 驱动的全场景数据分析
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed opacity-0 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards]">
            基于 DeepSeek R1 深度思考能力，通过自然语言轻松驾驭 MySQL 与 SQLite。
            自动生成 SQL、实时可视化图表、多轮分析追问，让数据触手可及。
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 opacity-0 animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]">
            <button onClick={() => navigate('/login')} className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-2xl hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:-translate-y-0.5 transition-all">
              开始使用
            </button>
            <button onClick={() => navigate('/learn-more')} className="w-full sm:w-auto px-8 py-4 text-base font-medium text-gray-300 border border-white/10 rounded-2xl hover:bg-white/5 transition-all flex items-center justify-center gap-2">
              查看核心架构
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>

          {/* 实时数据看板演示 */}
          <div className="mt-10 relative group opacity-0 animate-[fadeInUp_0.8s_ease-out_0.4s_forwards]">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-3xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative bg-[#0a0f1a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 bg-[#111827] border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <div className="text-[10px] text-gray-500 font-mono tracking-widest">DATAPULSE INTERFACE</div>
                <div className="w-10" />
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-[10px] text-[#06d6a0] mb-1 uppercase">User Input</div>
                    <div className="text-xs text-gray-300">分析上个月 classic_business 库中销售额前五的品类？</div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20">
                    <div className="text-[10px] text-[#3b82f6] mb-1 uppercase">AI Reasoning</div>
                    <div className="text-[10px] text-gray-400 line-clamp-3">正在分析数据表结构... 识别到 sales 字段... 自动构建 JOIN 查询... 完成！</div>
                  </div>
                </div>
                <div className="md:col-span-2 bg-[#050810] rounded-xl p-4 border border-white/5 flex flex-col justify-center items-center min-h-[180px]">
                   <div className="flex items-end gap-2 h-32 w-full justify-around px-4">
                      {[60, 85, 45, 90, 70, 55, 80].map((h, i) => (
                        <div key={i} className="w-full max-w-[25px] bg-gradient-to-t from-[#3b82f6] to-[#06d6a0] rounded-t-sm animate-[growUp_1.5s_ease-out_forwards]" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
                      ))}
                   </div>
                   <div className="mt-4 text-[10px] text-gray-500 font-mono uppercase tracking-tighter">Real-time Visualization Generated</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 功能特性卡片区 */}
      <section id="features" className="relative z-10 py-32 px-6 bg-[#050810]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">生产力级功能</h2>
            <p className="text-gray-500 max-w-xl mx-auto text-sm">为专业数据分析打造，兼顾深度与速度</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <RealFeatureCard
              title="DeepSeek 推理模式"
              desc="不仅给出结果，更展示思考逻辑。通过思维链确保 SQL 生成的准确性与透明度。"
              icon="🧠"
            />
            <RealFeatureCard
              title="全场景数据库支持"
              desc="原生兼容 MySQL、SQLite。支持一键切换商业、音乐及零售等多源数据集。"
              icon="🗄️"
            />
            <RealFeatureCard
              title="ECharts 智能图表"
              desc="自动选择最佳展示方案。支持柱状图、饼图、趋势图及交互式大数据表格。"
              icon="📊"
            />
            <RealFeatureCard
              title="文件识别分析"
              desc="支持上传 Excel、CSV 或图片。AI 自动识别结构化信息并立即建立分析上下文。"
              icon="📁"
            />
            <RealFeatureCard
              title="MySQL 会话同步"
              desc="聊天记录实时持久化至 MySQL，支持多端状态同步与海量历史记录秒级加载。"
              icon="💾"
            />
            <RealFeatureCard
              title="毫秒级流式响应"
              desc="基于 SSE 技术的流式传输，实时查看生成过程，让分析响应不再有等待感。"
              icon="📡"
            />
          </div>
        </div>
      </section>

      {/* 技术栈徽章 */}
      <section className="relative z-10 py-16 border-t border-white/5 bg-[#050810]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 opacity-30 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-700">
            <TechBadge label="LangChain" />
            <TechBadge label="FastAPI" />
            <TechBadge label="DeepSeek" />
            <TechBadge label="React 18" />
            <TechBadge label="ECharts 5" />
            <TechBadge label="Capacitor" />
          </div>
        </div>
      </section>

      <footer className="relative z-10 py-16 px-6 text-center border-t border-white/5 bg-[#050810]">
        <p className="text-gray-600 text-[10px] font-mono tracking-widest uppercase mb-2">
          Intelligence Driven · Privacy First
        </p>
        <p className="text-gray-500 text-xs">
          © 2026 DataPulse AI · 基于企业私有化部署方案
        </p>
      </footer>

      {/* 添加关键动画的 Style 标签 */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes growUp {
          from { height: 0; }
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
