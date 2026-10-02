import { useTranslation } from 'react-i18next'
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import type { Alert } from '@/api/types'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const STYLE = {
  info: 'border-sky-deep/30 bg-sky-soft/40 text-sky-deep dark:text-sky-soft',
  watch: 'border-sun-500/40 bg-sun-300/20',
  warning: 'border-orange-500/40 bg-orange-100/60 dark:bg-orange-900/20',
} as const

export function AlertList({ alerts, compact }: { alerts: Alert[]; compact?: boolean }) {
  const { t, i18n } = useTranslation()
  if (alerts.length === 0) return <p className="text-sm text-muted-foreground">{t('alerts.none')}</p>
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const Icon = a.severity === 'warning' ? AlertOctagon : a.severity === 'watch' ? AlertTriangle : Info
        return (
          <li key={a.id} className={cn('rounded-xl border p-3', STYLE[a.severity])}>
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                  {a.title}
                  <span className="text-[11px] font-medium opacity-70">
                    {a.source === 'bhoomi_rules' ? t('alerts.ruleBased') : a.source}
                  </span>
                </div>
                {!compact && <p className="mt-0.5 text-sm opacity-90">{a.message}</p>}
                <p className="mt-1 text-xs opacity-70">
                  {formatDate(a.starts, 'd MMM HH:mm', i18n.language)}
                  {a.ends ? ` – ${formatDate(a.ends, 'd MMM HH:mm', i18n.language)}` : ''}
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
