import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '@/api'
import { useTranslation } from '@/hooks/useTranslation'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleSendCode = async () => {
    if (!email) {
      setError('请先输入邮箱地址')
      return
    }
    setError('')
    setIsSendingCode(true)
    try {
      await authApi.sendCode(email)
      setCountdown(60)
      setError('')
      alert('验证码请求成功！如果没收到邮件，请查看后端控制台输出。')
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      setError(err.response?.data?.detail || '验证码发送失败')
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (!verificationCode) {
      setError('请输入验证码')
      return
    }

    setIsLoading(true)

    try {
      console.log('📝 [Register] 发送注册请求:', { 
        username, 
        email, 
        password: password.substring(0, 3) + '***', 
        verification_code: verificationCode 
      })
      await authApi.register({ username, email, password, verification_code: verificationCode })
      navigate('/login', { state: { message: '注册成功，请登录' } })
    } catch (err: any) {
      setError(err.response?.data?.detail || '注册失败，请检查填写内容')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050810] flex items-center justify-center px-6 relative overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* 背景装饰 */}
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
          <h1 className="text-3xl font-bold text-white tracking-tight">{t('register.title')}</h1>
          <p className="text-gray-400 mt-2">Join DataPulse AI · Intelligent Data Experience</p>
          <div className="mt-4 flex justify-center">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl text-sm text-center">
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
              <div className="flex gap-2">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]/50 transition-all"
                  placeholder="example@mail.com"
                />
                <button
                  type="button"
                  disabled={isSendingCode || countdown > 0}
                  onClick={handleSendCode}
                  className="px-4 bg-white/10 hover:bg-white/20 text-xs font-bold rounded-2xl border border-white/10 transition-all disabled:opacity-50 min-w-[100px]"
                >
                  {countdown > 0 ? `${countdown}s` : 'Send Code'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 ml-1">Verification Code</label>
              <input
                type="text"
                name="verification_code"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]/50 transition-all"
                placeholder="6-digit code"
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
