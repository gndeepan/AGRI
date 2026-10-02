import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useCycles } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/common/PageHeader'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/common/States'
import { formatDate, i18nText } from '@/lib/format'

export default function Plans() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const q = useCycles()
  return (
    <div className="space-y-6">
      <PageHeader title={t('plans.title')} subtitle={t('plans.subtitle')} actions={<Button asChild><Link to="/app/plans/new"><Plus /> {t('land.newPlan')}</Link></Button>} />
      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <CardSkeleton key={i} />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title={t('plans.none')} body={t('plans.noneBody')} action={<Button asChild><Link to="/app/plans/new">{t('land.newPlan')}</Link></Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((c) => {
            const stage = c.stages.find((s) => s.key === c.current?.stage_key)
            return (
              <Link key={c.id} to={`/app/plans/${c.id}`} className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="h-2 bg-muted"><div className="h-full bg-gradient-to-r from-paddy-400 to-sun-500" style={{ width: `${Math.round((c.current?.stage_progress ?? 0) * 100)}%` }} /></div>
                <div className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-xl font-semibold">{i18nText(c.crop.name, lang)}{c.variety ? ` · ${c.variety.name}` : ''}</h2>
                      <p className="text-sm text-muted-foreground">{c.land_name}</p>
                    </div>
                    <Badge variant={c.status === 'active' ? 'default' : 'outline'}>{t(`cycle.status.${c.status}`)}</Badge>
                  </div>
                  <p className="text-sm">{stage ? i18nText(stage.name, lang) : '—'}{c.current ? ` · ${t('timeline.das', { n: c.current.das })}` : ''}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('plans.harvestRange', {
                      from: formatDate(c.harvest_window.earliest, 'd MMM', lang),
                      to: formatDate(c.harvest_window.latest, 'd MMM yyyy', lang),
                    })}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
