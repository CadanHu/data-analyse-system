import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)

  if (!isAuthenticated) {
    // 如果未登录，重定向到登录页
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
