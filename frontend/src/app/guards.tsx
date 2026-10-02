import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/endpoints'
import { setAuthLostHandler } from '@/api/client'
import { qk } from '@/api/queries'
import { useAuth } from '@/stores/auth'
import { PageSpinner } from '@/components/layout/PageSpinner'
import i18n from '@/i18n'

/** Loads the session once and keeps the auth store in sync. */
export function useSession() {
  const setUser = useAuth((s) => s.setUser)
  const q = useQuery({ queryKey: qk.me, queryFn: authApi.me, retry: false, staleTime: 5 * 60_000 })
  useEffect(() => {
    if (q.isSuccess) {
      setUser(q.data)
      if (q.data.preferences.language && q.data.preferences.language !== i18n.language)
        void i18n.changeLanguage(q.data.preferences.language)
    } else if (q.isError) setUser(null)
  }, [q.isSuccess, q.isError, q.data, setUser])
  return q
}

export function RequireAuth() {
  const q = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    setAuthLostHandler(() => navigate('/login', { replace: true, state: { from: location.pathname } }))
  }, [navigate, location.pathname])
  if (q.isPending) return <PageSpinner />
  if (q.isError) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

export function PublicOnly() {
  const q = useSession()
  if (q.isPending) return <PageSpinner />
  if (q.isSuccess) return <Navigate to="/app" replace />
  return <Outlet />
}

export function RequireAdmin() {
  const user = useAuth((s) => s.user)
  if (user && user.role !== 'admin') return <Navigate to="/app" replace />
  return <Outlet />
}
