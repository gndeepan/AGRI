import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CloudSun, MapPinned, Mountain, Pencil, Sprout, Trash2, Wheat } from 'lucide-react'
import { landsApi } from '@/api/endpoints'
import { qk, useCycles, useLand, useTerrain } from '@/api/queries'
import { useAuth } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/common/PageHeader'
import { CardSkeleton, ErrorState } from '@/components/common/States'
import { ProvenanceBadge } from '@/components/common/DataKindBadge'
import { FieldThumb } from '@/components/common/FieldThumb'
import { MetricsPanel } from '@/features/map/MetricsPanel'
import { formatDate, formatNumber, i18nText } from '@/lib/format'

export default function LandDetail() {
  const { landId } = useParams()
  const { t, i18n } = useTranslation()
  const user = useAuth((s) => s.user)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const land = useLand(landId)
  const terrain = useTerrain(landId)
  const cycles = useCycles({ land_id: landId })

  if (land.isPending) return <div className="grid gap-4 md:grid-cols-2"><CardSkeleton lines={6} /><CardSkeleton lines={6} /></div>
  if (land.isError) return <ErrorState error={land.error} onRetry={() => land.refetch()} />
  const l = land.data
  const place = [l.village, l.district, l.state].filter(Boolean).join(', ')

  async function remove() {
    if (!confirm(t('map.confirmDelete', { name: l.name }))) return
    try {
      await landsApi.remove(l.id)
      qc.invalidateQueries({ queryKey: qk.lands })
      qc.invalidateQueries({ queryKey: qk.dashboard })
      toast.success(t('map.deleted'))
      navigate('/app')
    } catch {
      toast.error(t('errors.generic'))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={place || t('land.field')}
        title={l.name}
        actions={
          <>
            <Button asChild variant="outline"><Link to={`/app/map?edit=${l.id}`}><Pencil /> {t('map.editBoundary')}</Link></Button>
            <Button variant="ghost" onClick={remove} aria-label={t('map.deleteField')}><Trash2 /></Button>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink to={`/app/lands/${l.id}/environment`} icon={<CloudSun className="size-5" />} title={t('land.environment')} body={t('land.environmentBody')} />
        <QuickLink to={`/app/lands/${l.id}/discover`} icon={<Wheat className="size-5" />} title={t('land.discover')} body={t('land.discoverBody')} />
        <QuickLink to={`/app/plans/new?land=${l.id}`} icon={<Sprout className="size-5" />} title={t('land.newPlan')} body={t('land.newPlanBody')} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <FieldThumb boundary={l.boundary} className="size-16" />
            <div>
              <CardTitle>{t('land.measurements')}</CardTitle>
              <p className="text-xs text-muted-foreground">{t('land.updated', { date: formatDate(l.updated_at, 'd MMM yyyy', i18n.language) })}</p>
            </div>
          </CardHeader>
          <CardContent>
            <MetricsPanel metrics={l.metrics} unit={user?.preferences.area_unit ?? 'acre'} source="server" />
            <p className="mt-3 text-xs text-muted-foreground">{l.boundary_disclaimer}</p>
            {l.notes && <p className="mt-3 whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{l.notes}</p>}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Mountain className="size-4" /> {t('land.terrain')}</CardTitle>
              {terrain.data && <ProvenanceBadge provenance={terrain.data.provenance} />}
            </CardHeader>
            <CardContent>
              {terrain.isPending ? (
                <CardSkeleton lines={2} className="border-0 p-0" />
              ) : terrain.isError ? (
                <ErrorState error={terrain.error} onRetry={() => terrain.refetch()} />
              ) : (
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">{t('land.elevation')}</dt><dd className="font-display text-xl font-semibold">{terrain.data.elevation_m != null ? `${formatNumber(terrain.data.elevation_m, 0)} m` : '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t('land.slope')}</dt><dd className="font-display text-xl font-semibold">{terrain.data.slope_deg != null ? `${formatNumber(terrain.data.slope_deg, 1)}°` : '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t('land.relief')}</dt><dd className="font-display text-xl font-semibold">{terrain.data.relief_m != null ? `${formatNumber(terrain.data.relief_m, 0)} m` : '—'}</dd></div>
                  <p className="col-span-3 text-xs text-muted-foreground">{t('land.terrainNote')}</p>
                </dl>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('land.cropCycles')}</CardTitle>
              <Button asChild size="sm"><Link to={`/app/plans/new?land=${l.id}`}>{t('land.newPlan')}</Link></Button>
            </CardHeader>
            <CardContent>
              {cycles.isPending ? (
                <CardSkeleton lines={2} className="border-0 p-0" />
              ) : cycles.isError ? (
                <ErrorState error={cycles.error} onRetry={() => cycles.refetch()} />
              ) : cycles.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('land.noCycles')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {cycles.data.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <div className="font-medium">{i18nText(c.crop.name, i18n.language)}{c.variety ? ` · ${c.variety.name}` : ''}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(`plan.anchor.${c.anchor_type}`)}: {formatDate(c.anchor_date, 'd MMM yyyy', i18n.language)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.status === 'active' ? 'default' : 'outline'}>{t(`cycle.status.${c.status}`)}</Badge>
                        <Button asChild size="sm" variant="outline"><Link to={`/app/plans/${c.id}`}>{t('common.open')}</Link></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Button asChild variant="ghost" className="w-full"><Link to={`/app/map?land=${l.id}`}><MapPinned /> {t('land.viewOnMap')}</Link></Button>
        </div>
      </div>
    </div>
  )
}

function QuickLink({ to, icon, title, body }: { to: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link to={to} className="group flex gap-3 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-paddy-400 hover:shadow-md">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-paddy-100 text-paddy-700 dark:bg-paddy-800 dark:text-paddy-200">{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
    </Link>
  )
}
