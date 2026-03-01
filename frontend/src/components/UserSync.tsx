import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { authApi } from '../api'

/**
 * 隐形组件：专门负责同步用户信息，解决“用户名不显示”或“数据结构错误”的问题
 */
export default function UserSync() {
  const { isAuthenticated, user, setAuth, token } = useAuthStore()

  useEffect(() => {
    // 如果已登录但没有用户名，或者需要强制刷新
    if (isAuthenticated && token && (!user || !user.username)) {
      console.log('🔄 [UserSync] 开始同步用户信息...')
      authApi.getMe()
        .then(userData => {
          console.log('✅ [UserSync] 同步成功:', userData.username)
          // 重新存入 store
          setAuth(userData, token)
        })
        .catch(err => {
          console.error('❌ [UserSync] 同步失败:', err)
        })
    }
  }, [isAuthenticated, token, user, setAuth])

  return null
}
