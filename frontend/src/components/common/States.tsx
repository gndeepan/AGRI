import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RotateCw, Sprout } from 'lucide-react'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { t } = useTranslation()
  const e = error instanceof ApiError ? error : null
  const msg =
    e?.status === 0
      ? t('errors.network')
      : e?.code === 'assistant_unavailable'
        ? t('errors.assistantUnavailable')
        : e?.status && e.status >= 500
          ? t('errors.server')
          : e?.message || t('errors.generic')
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center', className)}>
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm">{msg}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string
  body?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-paddy-100 text-paddy-700 dark:bg-paddy-800 dark:text-paddy-200">
        {icon ?? <Sprout className="size-6" />}
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  )
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 rounded-2xl border border-border bg-card p-5', className)} aria-busy>
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  )
}

export function UnavailableValue({ label }: { label?: string }) {
  const { t } = useTranslation()
  return <span className="text-muted-foreground">{label ?? t('common.unavailable')}</span>
}
