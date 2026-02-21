import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function Welcome() {
  const navigate = useNavigate()

  useEffect(() => {
    // 可以在这里检查用户是否已登录
    // 如果已登录，直接跳转到 dashboard
    // navigate('/dashboard')
  }, [navigate])

  return (
    <div className="min-h-screen bg-primary">
      {/* 简化的欢迎页面，完整版请使用 welcome.html */}
      <div className="container mx-auto px-6 py-20">
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-white to-accent-blue bg-clip-text text-transparent">
            DataPulse
          </h1>
          <p className="text-xl text-gray-400 mb-8">
            智能数据分析助理
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-8 py-4 bg-gradient-to-r from-accent-blue to-accent-cyan rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            进入控制台
          </button>
        </div>
      </div>
    </div>
  )
}

export default Welcome
