import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import DataScientistGuide from '../components/DataScientistGuide'
import StandardModeGuide from '../components/StandardModeGuide'
import DeepModeGuide from '../components/DeepModeGuide'

function Welcome() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    // 可以在这里检查用户是否已登录
    // 如果已登录，直接跳转到 dashboard
    // navigate('/dashboard')
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#050810] text-white selection:bg-[#3b82f6]/30 overflow-x-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#3b82f6]/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#06d6a0]/10 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="container mx-auto px-6 pt-24 pb-32 relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          <a
            href="https://github.com/CadanHu/data-analyse-system"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-[#06d6a0] mb-8 hover:bg-white/10 hover:border-[#06d6a0]/40 transition-all"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
            GitHub · CadanHu/data-analyse-system
          </a>

          <h1 className="text-7xl md:text-8xl font-black mb-8 tracking-tighter">
            <span className="bg-gradient-to-r from-white via-white to-gray-500 bg-clip-text text-transparent">Data</span>
            <span className="bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] bg-clip-text text-transparent">Pulse</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-2xl mx-auto font-light leading-relaxed">
            {t('welcome.assistantTitle')}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <button
              onClick={() => navigate('/login')}
              className="group relative px-10 py-5 bg-white text-black rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all"
            >
              {t('nav.enterApp')}
              <div className="absolute inset-0 bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] opacity-0 group-hover:opacity-10 rounded-2xl blur-xl transition-opacity" />
            </button>
            
            <button
              onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
              className="px-10 py-5 bg-white/5 border border-white/10 text-white rounded-2xl font-bold hover:bg-white/10 transition-all"
            >
              {t('welcome.learnMore')}
            </button>
          </div>
        </div>

        {/* Guides Section */}
        <div className="mt-32 space-y-24">
          <section id="standard-guide">
            <StandardModeGuide />
          </section>
          
          <section id="scientist-guide">
            <DataScientistGuide />
          </section>

          <section id="deep-guide">
            <DeepModeGuide />
          </section>
        </div>
      </div>

      <footer className="py-12 border-t border-white/5 text-center text-gray-600 text-sm space-y-2">
        <p>© 2026 DataPulse Intelligence. All rights reserved.</p>
        <a
          href="https://github.com/CadanHu/data-analyse-system"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-400 transition-colors text-xs"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
          Open Source on GitHub
        </a>
      </footer>
    </div>
  )
}

export default Welcome
