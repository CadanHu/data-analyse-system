import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'

export default function Tutorial() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const steps = [
    {
      id: 1,
      title: t('tutorial.step1'),
      description: t('tutorial.step1Desc'),
      icon: '🗄️'
    },
    {
      id: 2,
      title: t('tutorial.step2'),
      description: t('tutorial.step2Desc'),
      icon: '💬'
    },
    {
      id: 3,
      title: t('tutorial.step3'),
      description: t('tutorial.step3Desc'),
      icon: '🧠'
    },
    {
      id: 4,
      title: t('tutorial.step4'),
      description: t('tutorial.step4Desc'),
      icon: '📊'
    },
    {
      id: 5,
      title: t('tutorial.step5'),
      description: t('tutorial.step5Desc'),
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
            {t('features.enterApp')}
          </button>
        </div>
      </nav>

      <main className="relative z-10 pt-48 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-20">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              {t('tutorial.title1')}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3b82f6] to-[#06d6a0]">
                {t('tutorial.title2')}
              </span>
            </h1>
            <p className="text-xl text-gray-400">{t('tutorial.description')}</p>
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
            <h2 className="text-3xl font-bold mb-6">{t('tutorial.ready')}</h2>
            <p className="text-gray-400 mb-10 text-lg">{t('tutorial.startDesc')}</p>
            <button onClick={() => navigate('/login')} className="px-10 py-4 bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] rounded-2xl font-bold hover:shadow-[0_0_25px_rgba(59,130,246,0.4)] transition-all active:scale-95">
              {t('tutorial.start')}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
