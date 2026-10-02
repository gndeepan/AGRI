import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { notificationsApi } from '@/api/endpoints'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export function NotificationBell({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => notificationsApi.list(), refetchInterval: 5 * 60_000 })
  const unread = (q.data ?? []).filter((n) => !n.read_at).length

  async function read(id: string) {
    await notificationsApi.markRead(id).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className={cn('relative', className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="relative rounded-full p-2 hover:bg-muted" aria-label={t('notifications.label', { count: unread })} aria-expanded={open}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-sun-500 text-[10px] font-bold text-paddy-950">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-2 shadow-xl lg:left-0 lg:right-auto">
          <div className="px-2 py-1.5 text-sm font-semibold">{t('notifications.title')}</div>
          {(q.data ?? []).length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">{t('notifications.none')}</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {q.data!.map((n) => {
                const body = (
                  <>
                    <div className={cn('text-sm', !n.read_at && 'font-semibold')}>{n.title}</div>
                    {n.body && <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground">{formatDate(n.created_at, 'd MMM HH:mm', i18n.language)}</div>
                  </>
                )
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link to={n.link} onClick={() => { void read(n.id); setOpen(false) }} className="block rounded-xl px-2 py-2 hover:bg-muted">{body}</Link>
                    ) : (
                      <button type="button" onClick={() => read(n.id)} className="block w-full rounded-xl px-2 py-2 text-left hover:bg-muted">{body}</button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
