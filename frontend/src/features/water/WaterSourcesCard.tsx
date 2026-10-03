import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Polygon } from 'geojson'
import { CircleDot, Container, Droplet, Droplets, ExternalLink, MapPinned, Route, Waves } from 'lucide-react'
import type { WaterKind, WaterSource } from '@/api/types'
import { useWaterSources } from '@/api/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/States'
import { ProvenanceBadge } from '@/components/common/DataKindBadge'
import { cn } from '@/lib/utils'
import { KIND_COLOR, RADII_M, WATER_KINDS, countByKind, formatDistance, formatWaterArea, waterName } from './format'

// MapLibre is a large chunk; load it only when the card is on screen.
const WaterMiniMap = lazy(() => import('./WaterMiniMap').then((m) => ({ default: m.WaterMiniMap })))

const KIND_ICON: Record<WaterKind, typeof Waves> = {
  river: Waves, canal: Route, stream: Droplet, drain: Droplet, tank: Container, pond: Droplets, lake: Waves, well: CircleDot,
}
const COLLAPSED = 8

export function WaterSourcesCard({ landId, boundary }: { landId: string; boundary: Polygon }) {
  const { t, i18n } = useTranslation()
  const [radius, setRadius] = useState<number>(5000)
  const [kind, setKind] = useState<WaterKind | 'all'>('all')
  const [expanded, setExpanded] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const q = useWaterSources(landId, radius)
  const km = radius / 1000

  const sources = q.data?.sources
  const counts = useMemo(() => countByKind(sources ?? []), [sources])
  const visible = useMemo(() => (sources ?? []).filter((s) => kind === 'all' || s.kind === kind), [sources, kind])
  const shown = expanded ? visible : visible.slice(0, COLLAPSED)

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2"><Waves className="size-4" /> {t('waterSources.title')}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{t('waterSources.subtitle')}</p>
        </div>
        {q.data && <ProvenanceBadge provenance={q.data.provenance} />}
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="group" aria-label={t('waterSources.radiusLabel')} className="inline-flex rounded-full border border-border bg-muted/50 p-0.5">
          {RADII_M.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={radius === r}
              onClick={() => { setRadius(r); setKind('all'); setExpanded(false); setFocusId(null) }}
              className={cn('rounded-full px-3 py-1 text-xs font-medium transition', radius === r ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {t('waterSources.within', { km: r / 1000 })}
            </button>
          ))}
        </div>

        {q.isPending ? (
          <div className="space-y-2" aria-live="polite">
            <p className="text-sm text-muted-foreground">{t('waterSources.loading')}</p>
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <>
            {q.data.provenance.cache_status === 'stale' && (
              <p className="rounded-lg bg-sun-300/20 px-3 py-2 text-xs">{t('waterSources.stale')}</p>
            )}
            <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl sm:h-96" />}>
              <WaterMiniMap field={boundary} sources={q.data.sources} radiusM={radius} focusId={focusId} />
            </Suspense>

            {q.data.sources.length === 0 ? (
              <p className="rounded-xl bg-muted p-4 text-sm">{t('waterSources.empty', { km })}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('waterSources.title')}>
                  <Chip active={kind === 'all'} onClick={() => { setKind('all'); setExpanded(false) }}>
                    {t('waterSources.all')} <span className="tabular-nums opacity-70">{q.data.sources.length}</span>
                  </Chip>
                  {WATER_KINDS.filter((k) => counts[k]).map((k) => (
                    <Chip key={k} active={kind === k} onClick={() => { setKind(k); setExpanded(false) }} color={KIND_COLOR[k]}>
                      {t(`waterSources.kind.${k}`).split(' (')[0]} <span className="tabular-nums opacity-70">{counts[k]}</span>
                    </Chip>
                  ))}
                </div>

                {visible.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('waterSources.emptyKind', { kind: t(`waterSources.kind.${kind as WaterKind}`), km })}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {shown.map((s) => (
                      <SourceRow key={s.id} s={s} lang={i18n.language} focused={focusId === s.id} onFocus={() => setFocusId(s.id)} />
                    ))}
                  </ul>
                )}
                {visible.length > COLLAPSED && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? t('waterSources.showLess') : t('waterSources.showMore', { n: visible.length })}
                  </Button>
                )}
              </>
            )}
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {q.data.limitations.map((l) => <li key={l}>{l}</li>)}
              <li>{t('waterSources.attribution')}</li>
            </ul>
            <Button asChild variant="outline" size="sm">
              <Link to={`/app/map?land=${landId}&water=1`}><MapPinned /> {t('waterSources.showOnMap')}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        active ? 'border-paddy-600 bg-paddy-600 text-white' : 'border-border bg-card hover:bg-muted',
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </button>
  )
}

function SourceRow({ s, lang, focused, onFocus }: { s: WaterSource; lang: string; focused: boolean; onFocus: () => void }) {
  const { t } = useTranslation()
  const Icon = KIND_ICON[s.kind]
  const kindLabel = t(`waterSources.kind.${s.kind}`)
  const name = waterName(s, lang) ?? t('waterSources.unnamed', { kind: kindLabel.split(' (')[0].toLowerCase() })
  const detail = [
    s.area_m2 != null ? t('waterSources.area', { area: formatWaterArea(s.area_m2) }) : null,
    s.length_in_radius_m != null ? t('waterSources.length', { length: formatDistance(s.length_in_radius_m) }) : null,
  ].filter(Boolean)
  return (
    <li className={cn('flex items-center gap-3 py-2.5', focused && 'bg-muted/60')}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: KIND_COLOR[s.kind] }} aria-hidden>
        <Icon className="size-4" />
      </span>
      <button type="button" onClick={onFocus} className="min-w-0 flex-1 text-left" aria-label={`${name}, ${kindLabel}`}>
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {kindLabel}
          {detail.length ? ` · ${detail.join(' · ')}` : ''}
        </div>
      </button>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tabular-nums">{s.adjoining ? t('waterSources.adjoining') : formatDistance(s.distance_m)}</div>
        {s.direction && !s.adjoining && <div className="text-xs text-muted-foreground">{t('waterSources.toThe', { dir: t(`waterSources.dir.${s.direction}`) })}</div>}
        {s.seasonal && <Badge variant="outline" className="mt-0.5">{t('waterSources.seasonal')}</Badge>}
      </div>
      <a href={s.osm_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={t('waterSources.openOsm')}>
        <ExternalLink className="size-3.5" />
      </a>
    </li>
  )
}
