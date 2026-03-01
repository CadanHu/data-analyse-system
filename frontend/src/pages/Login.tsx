import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()
  const setAuth = useAuthStore(state => state.setAuth)
  const { t } = useTranslation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    console.log('📝 [Login] 开始登录...', { email, password: password.substring(0, 3) + '***' })

    try {
      const response = await authApi.login({ username: email, password })
      console.log('✅ [Login] 登录响应:', response)
      
      const access_token = response.access_token
      if (!access_token) {
        console.error('❌ [Login] 响应中没有 access_token:', response)
        setError('登录响应格式错误')
        return
      }
      
      console.log('✅ [Login] 收到 Token:', access_token.substring(0, 50) + '...')
      
      // 🔧 关键修复：先将 Token 保存到 store，这样 axios 拦截器就能在 getMe() 时获取到它
      // 使用 getState() 来确保存储立即更新，不等待 React 渲染周期
      console.log('💾 [Login] 先保存 Token 到 store...')
      useAuthStore.getState().setToken(access_token)
      
      // 获取用户信息
      console.log('📥 [Login] 获取用户信息...')
      const user = await authApi.getMe()
      console.log('✅ [Login] 用户详情 (完整 JSON):', JSON.stringify(user, null, 2))
      
      // 保存完整的用户信息和 Token
      console.log('💾 [Login] 保存完整信息到 store...')
      useAuthStore.getState().setAuth(user, access_token)
      
      // 验证是否保存成功
      const finalStore = useAuthStore.getState()
      console.log('🔍 [Login] 验证存储:', { 
        token: finalStore.token ? finalStore.token.substring(0, 30) + '...' : null,
        isAuthenticated: finalStore.isAuthenticated,
        user: finalStore.user?.username
      })
      
      // 🚀 确保状态已保存后再导航
      setTimeout(() => {
        console.log('🚀 [Login] 导航到应用...')
        navigate('/app')
      }, 100)
    } catch (err: any) {
      console.error('❌ [Login] 登录失败:', err)
      console.error('❌ [Login] 错误详情:', err.response?.data)
      setError(err.response?.data?.detail || '登录失败，请检查邮箱和密码')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050810] flex items-center justify-center px-6 relative overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* 背景装饰 */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3b82f6]/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#06d6a0]/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
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
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm text-center">
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
