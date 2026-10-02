import { NavLink, Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Home, LogOut, Map, MessageCircle, Settings, ShieldCheck, Sprout } from 'lucide-react'
import { authApi } from '@/api/endpoints'
import { useAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'

const NAV = [
  { to: '/app', key: 'dashboard', icon: Home, end: true },
  { to: '/app/map', key: 'fields', icon: Map },
  { to: '/app/plans', key: 'plans', icon: Sprout },
  { to: '/app/tasks', key: 'tasks', icon: CalendarCheck },
  { to: '/app/assistant', key: 'assistant', icon: MessageCircle },
] as const

export function AppShell() {
  const { t } = useTranslation()
  const user = useAuth((s) => s.user)
  const qc = useQueryClient()
  const navigate = useNavigate()

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      qc.clear()
      navigate('/login', { replace: true })
    }
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
      isActive ? 'bg-paddy-800 text-soil-50 dark:bg-paddy-300 dark:text-paddy-950' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card/60 px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center justify-between px-2">
          <Logo />
          <NotificationBell />
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label={t('nav.main')}>
          {NAV.map(({ to, key, icon: Icon, ...rest }) => (
            <NavLink key={to} to={to} className={linkCls} end={'end' in rest}>
              <Icon className="size-4" /> {t(`nav.${key}`)}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink to="/app/admin" className={linkCls}>
              <ShieldCheck className="size-4" /> {t('nav.admin')}
            </NavLink>
          )}
        </nav>
        <div className="space-y-1 border-t border-border pt-4">
          <NavLink to="/app/profile" className={linkCls}>
            <Settings className="size-4" /> {t('nav.profile')}
          </NavLink>
          <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
            <LogOut className="size-4" /> {t('nav.logout')}
          </button>
          {user && <p className="truncate px-3 pt-2 text-xs text-muted-foreground">{user.email}</p>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center">
            <NotificationBell />
            <NavLink to="/app/profile" aria-label={t('nav.profile')} className="rounded-full p-2 hover:bg-muted">
              <Settings className="size-5" />
            </NavLink>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV.map(({ to, key, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium', isActive ? 'text-paddy-700 dark:text-paddy-300' : 'text-muted-foreground')
            }
          >
            <Icon className="size-5" />
            <span className="truncate">{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
