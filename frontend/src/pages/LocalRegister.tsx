import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from '@/hooks/useTranslation'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { initLocalStore } from '@/services/localStore'
import { isDbInitialized } from '@/services/db'
import { localRegister } from '@/services/localAuthService'

export default function LocalRegister() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('register.passwordMismatch'))
      return
    }

    setIsLoading(true)
    try {
      if (!isDbInitialized()) await initLocalStore()
      await localRegister(username, email, password)
      navigate('/login', { state: { message: t('localRegister.success') } })
    } catch (err: any) {
      setError(err.message || t('register.failed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050810] flex items-center justify-center px-6 relative overflow-hidden" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#3b82f6]/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#06d6a0]/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-end gap-1.5 h-10 mb-4">
            <div className="w-2 bg-[#3b82f6] rounded-sm h-[40%]" />
            <div className="w-2 bg-[#06d6a0] rounded-sm h-[70%]" />
            <div className="w-2 bg-[#3b82f6] rounded-sm h-[100%]" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{t('localRegister.title')}</h1>
          <p className="text-gray-400 mt-2">{t('localRegister.subtitle')}</p>
          <div className="mt-4 flex justify-center">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl text-sm text-center select-text">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">{t('register.username')}</label>
              <input
                type="text"
                name="username"
                autoComplete="username"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]/50 transition-all"
                placeholder="3-20 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">{t('login.email')}</label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]/50 transition-all"
                placeholder="example@mail.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">{t('login.password')}</label>
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]/50 transition-all"
                placeholder="At least 6 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">{t('register.confirmPassword')}</label>
              <input
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]/50 transition-all"
                placeholder={t('register.confirmPassword')}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] text-white font-bold rounded-2xl hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.98] mt-4"
            >
              {isLoading ? t('register.loading') : t('register.submit')}
            </button>
          </form>

          <div className="mt-8 text-center text-sm">
            <span className="text-gray-500">{t('register.haveAccount')}</span>
            <Link to="/login" className="text-[#06d6a0] hover:text-[#05b88a] font-medium ml-1 transition-colors">
              {t('register.login')}
            </Link>
          </div>
        </div>

        <footer className="mt-10 text-center">
          <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← {t('login.backToHome')}
          </Link>
        </footer>
      </div>
    </div>
  )
}
