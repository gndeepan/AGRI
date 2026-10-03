import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Popover from '@radix-ui/react-popover'
import { Bell, CheckCheck, X } from 'lucide-react'
import { notificationsApi } from '@/api/endpoints'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Portalled to <body> so it never sits inside the sidebar's stacking context or under the map;
 * Radix keeps it on-screen (collision padding) and handles focus, Esc and outside clicks.
 * On phones it becomes a full-width sheet under the header.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => notificationsApi.list(), refetchInterval: 5 * 60_000 })
  const items = q.data ?? []
  const unread = items.filter((n) => !n.read_at)

  async function read(id: string) {
    await notificationsApi.markRead(id).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  async function readAll() {
    await Promise.all(unread.map((n) => notificationsApi.markRead(n.id).catch(() => undefined)))
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn('relative rounded-full p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
          aria-label={t('notifications.label', { count: unread.length })}
        >
          <Bell className="size-5" />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-sun-500 text-[10px] font-bold text-paddy-950">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-[1000] flex max-h-[min(32rem,calc(100dvh-5rem))] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-border bg-card shadow-2xl outline-none',
            'max-sm:w-[calc(100vw-1.5rem)]',
          )}
          aria-label={t('notifications.title')}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">{t('notifications.title')}</div>
            <div className="flex items-center gap-1">
              {unread.length > 0 && (
                <button type="button" onClick={() => void readAll()} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-primary hover:bg-muted">
                  <CheckCheck className="size-3.5" /> {t('notifications.markAll')}
                </button>
              )}
              <Popover.Close className="rounded-full p-1 hover:bg-muted" aria-label={t('common.close')}>
                <X className="size-4" />
              </Popover.Close>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t('notifications.none')}</p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {items.map((n) => {
                const body = (
                  <>
                    <div className="flex items-start gap-2">
                      {!n.read_at && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-sun-500" />}
                      <div className="min-w-0">
                        <div className={cn('text-sm', !n.read_at && 'font-semibold')}>{n.title}</div>
                        {n.body && <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                        <div className="text-[10px] text-muted-foreground">{formatDate(n.created_at, 'd MMM HH:mm', i18n.language)}</div>
                      </div>
                    </div>
                  </>
                )
                const cls = 'block w-full rounded-xl px-2 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link to={n.link} onClick={() => { void read(n.id); setOpen(false) }} className={cls}>{body}</Link>
                    ) : (
                      <button type="button" onClick={() => void read(n.id)} className={cls}>{body}</button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
