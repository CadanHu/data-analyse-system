import { useNavigate } from 'react-router-dom'

export default function Tutorial() {
  const navigate = useNavigate()

  const steps = [
    {
      id: 1,
      title: '连接与切换数据库',
      description: '在进入对话后，点击右上角的数据库按钮，选择您想要分析的数据源（如：全场景商业分析库）。',
      icon: '🗄️'
    },
    {
      id: 2,
      title: '发起自然语言查询',
      description: '像平时聊天一样提问，例如：“分析去年每个月的营收增长情况”，AI 会自动生成 SQL 并执行。',
      icon: '💬'
    },
    {
      id: 3,
      title: '开启深度思考模式',
      description: '如果您的问题很复杂（涉及多表关联），建议开启“思考模式”，查看 DeepSeek R1 的完整分析逻辑。',
      icon: '🧠'
    },
    {
      id: 4,
      title: '交互式可视化探索',
      description: '分析结果生成后，点击“查看可视化图表”。您可以在右侧面板手动切换雷达图、漏斗图等 15+ 种类型。',
      icon: '📊'
    },
    {
      id: 5,
      title: 'RAG 知识库增强分析',
      description: '上传业务 PDF 或 Excel，AI 将结合文档内容进行指标解读，确保分析口径与业务文档一致。',
      icon: '📚'
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
          <div className="text-center mb-20">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              快速上手
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                指南
              </span>
            </h1>
            <p className="text-xl text-gray-400">只需五步，开启您的 AI 驱动数据洞察之旅</p>
          </div>

          <div className="relative border-l-2 border-dashed border-white/10 ml-4 md:ml-8 space-y-16">
            {steps.map((step, index) => (
              <div key={step.id} className="relative pl-12 md:pl-16">
                <div className="absolute -left-[25px] top-0 w-12 h-12 bg-[#050810] border-4 border-[#0a0f1a] rounded-full flex items-center justify-center text-xl shadow-lg z-10">
                  {step.icon}
                </div>
                <div className="bg-[#111827]/50 border border-white/10 rounded-2xl p-8 hover:border-[#3b82f6]/30 transition-all group">
                  <span className="text-[#3b82f6] text-xs font-black uppercase tracking-widest mb-2 block">Step {index + 1}</span>
                  <h3 className="text-2xl font-bold mb-4 group-hover:text-white transition-colors">{step.title}</h3>
                  <p className="text-gray-400 leading-relaxed text-lg">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-24 text-center p-12 bg-gradient-to-r from-[#3b82f6]/10 to-[#06d6a0]/10 border border-white/10 rounded-[2.5rem]">
            <h2 className="text-3xl font-bold mb-6">准备好大显身手了吗？</h2>
            <p className="text-gray-400 mb-10 text-lg">立即登录并选择示例数据库，体验 v1.7.0 的强大分析能力。</p>
            <button onClick={() => navigate('/login')} className="px-10 py-4 bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-2xl font-bold hover:shadow-[0_0_25px_rgba(59,130,246,0.4)] transition-all active:scale-95">
              立即开始分析
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
