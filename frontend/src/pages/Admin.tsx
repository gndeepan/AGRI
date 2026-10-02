import { useTranslation } from 'react-i18next'
import { Activity } from 'lucide-react'
import { useAdminStats, useProviders } from '@/api/queries'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, Stat } from '@/components/common/PageHeader'
import { CardSkeleton, ErrorState } from '@/components/common/States'
import { formatDate, formatNumber } from '@/lib/format'

export default function Admin() {
  const { t, i18n } = useTranslation()
  const providers = useProviders()
  const stats = useAdminStats()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('nav.admin')} title={t('admin.title')} subtitle={t('admin.subtitle')} />
      {stats.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('admin.users')} value={stats.data.users} />
          <Stat label={t('admin.lands')} value={stats.data.lands} />
          <Stat label={t('admin.cycles')} value={stats.data.cycles} />
          <Stat label={t('admin.activeCycles')} value={stats.data.active_cycles} />
        </div>
      )}
      {providers.isPending ? (
        <CardSkeleton lines={6} />
      ) : providers.isError ? (
        <ErrorState error={providers.error} onRetry={() => providers.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.data.map((p) => {
            const variant = p.circuit_state === 'open' ? 'danger' : p.circuit_state === 'half_open' ? 'warn' : 'default'
            return (
              <Card key={p.provider}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Activity className="size-4" /> {p.source?.name ?? p.provider}</CardTitle>
                  <Badge variant={variant}>{t(`admin.circuit.${p.circuit_state}`)}</Badge>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">{t('admin.calls')}</dt><dd className="tabular-nums">{p.calls} / {p.errors} {t('admin.errors')}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t('admin.errorRate')}</dt><dd className="tabular-nums">{p.error_rate != null ? `${formatNumber(p.error_rate * 100, 1)}%` : '—'}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t('admin.p50')}</dt><dd className="tabular-nums">{p.p50_latency_ms != null ? `${formatNumber(p.p50_latency_ms, 0)} ms` : '—'}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t('admin.lastSuccess')}</dt><dd>{p.last_success_at ? formatDate(p.last_success_at, 'd MMM HH:mm', i18n.language) : '—'}</dd></div>
                    {p.last_error && (
                      <div className="col-span-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                        {p.last_error_at && formatDate(p.last_error_at, 'd MMM HH:mm', i18n.language)} · {p.last_error}
                      </div>
                    )}
                    {p.source && (
                      <div className="col-span-2 text-xs text-muted-foreground">
                        {p.source.license}{p.source.rate_limit ? ` · ${p.source.rate_limit}` : ''}
                      </div>
                    )}
                  </dl>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
