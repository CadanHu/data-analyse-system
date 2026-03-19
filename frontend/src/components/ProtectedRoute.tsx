import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore, isTokenValid } from '@/stores/authStore'

export default function ProtectedRoute() {
  const { isAuthenticated, token, user, setAuth } = useAuthStore()

  // If store says unauthenticated but we have a locally valid token, restore session
  if (!isAuthenticated && isTokenValid(token) && user) {
    setAuth(user, token!)
    return <Outlet />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
