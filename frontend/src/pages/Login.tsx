import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { initLocalStore } from '@/services/localStore'
import { isDbInitialized } from '@/services/db'
import { saveOnlineLoginLocally, localLogin, buildLocalToken } from '@/services/localAuthService'
import { Capacitor } from '@capacitor/core'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()
  const { t } = useTranslation()
  const { initOffline } = useAuthStore()

  const handleOfflineMode = async () => {
    await initLocalStore()
    initOffline()
    navigate('/app')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    console.log('📝 [Login] Starting login...', { email, password: password.substring(0, 3) + '***' })

    try {
      const response = await authApi.login({ username: email, password })
      console.log('✅ [Login] Login response:', response)
      
      let data = response;
      if (typeof response === 'string') {
        try {
          data = JSON.parse(response);
        } catch (e) {
          console.error('❌ [Login] Failed to parse string response:', response)
        }
      }

      const access_token = data.access_token || data.data?.access_token
      if (!access_token) {
        setError(`${t('login.formatError')} (Type: ${typeof response})`)
        return
      }
      
      useAuthStore.getState().setToken(access_token)
      const user = await authApi.getMe()
      useAuthStore.getState().setAuth(user, access_token)

      if (Capacitor.isNativePlatform()) {
        try {
          if (!isDbInitialized()) await initLocalStore()
          await saveOnlineLoginLocally(user, password)
        } catch { /* non-fatal */ }
      }

      setTimeout(() => {
        navigate('/app')
      }, 100)
    } catch (err: any) {
      // Server unreachable → try local cache
      if (Capacitor.isNativePlatform()) {
        try {
          if (!isDbInitialized()) await initLocalStore()
          const localUser = await localLogin(email, password)
          if (localUser) {
            const fakeToken = buildLocalToken(localUser)
            useAuthStore.getState().setAuth(localUser, fakeToken)
            navigate('/app')
            return
          }
        } catch { /* fall through to show error */ }
      }
      setError(err.response?.data?.detail || t('login.failed'))
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
          <h1 className="text-3xl font-bold text-white tracking-tight">{t('login.welcome')}</h1>
          <p className="text-gray-400 mt-2">{t('login.subtitle')}</p>
          <div className="mt-4 flex justify-center">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm text-center select-text">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2 ml-1">{t('login.email')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/50 transition-all"
                placeholder={t('login.email')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2 ml-1">{t('login.password')}</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/50 transition-all"
                placeholder={t('login.password')}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] text-white font-bold rounded-2xl hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.98]"
            >
              {isLoading ? t('login.loading') : t('login.submit')}
            </button>
          </form>

          <div className="mt-8 text-center text-sm">
            <span className="text-gray-500">{t('login.noAccount')}</span>
            <Link to="/register" className="text-[#06d6a0] hover:text-[#05b88a] font-medium ml-1 transition-colors">
              {t('login.register')}
            </Link>
          </div>

          {Capacitor.isNativePlatform() && (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleOfflineMode}
                className="w-full py-3 border border-white/10 text-gray-400 hover:text-white hover:border-white/30 rounded-2xl text-sm transition-all"
              >
                {t('login.offlineMode') || '离线使用 / 无需服务器'}
              </button>
            </div>
          )}
        </div>

        <footer className="mt-12 text-center">
          <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← {t('login.backToHome')}
          </Link>
        </footer>
      </div>
    </div>
  )
}
