import { Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ArrowRight, CalendarCheck, Droplets, Layers, Map, Plus, Sprout, Wind } from 'lucide-react'
import { useDashboard, useUpdateTask } from '@/api/queries'
import type { CycleDetail, TaskOut } from '@/api/types'
import { useAuth } from '@/stores/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/common/States'
import { PageHeader, Stat } from '@/components/common/PageHeader'
import { AlertList } from '@/components/common/AlertList'
import { DataKindBadge } from '@/components/common/DataKindBadge'
import { WeatherIcon, weatherCodeKey } from '@/components/common/WeatherIcon'
import { FieldThumb } from '@/components/common/FieldThumb'
import { formatArea, formatDate, formatNumber, i18nText, windDirLabel } from '@/lib/format'
import { GlobeZoom, TAMIL_NADU_BBOX, type GlobeField } from '@/features/globe'

function greetingKey() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const user = useAuth((s) => s.user)
  const q = useDashboard()
  const unit = user?.preferences.area_unit ?? 'acre'
  const lang = i18n.language

  if (q.isPending)
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    )
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const d = q.data

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={user?.preferences.region ?? t('dashboard.yourFarm')}
        title={t(`dashboard.greeting.${greetingKey()}`, { name: d.user.full_name.split(' ')[0] })}
        subtitle={t('dashboard.subtitle')}
        actions={
          <Button asChild>
            <Link to="/app/map"><Plus /> {t('dashboard.addField')}</Link>
          </Button>
        }
      />

      <FieldsGlobe fields={d.fields} totals={d.totals} unit={unit} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('dashboard.totalArea')} icon={<Layers className="size-3.5" />} value={formatArea(d.totals, unit, lang)} />
        <Stat label={t('dashboard.fields')} icon={<Map className="size-3.5" />} value={d.totals.fields} />
        <Stat label={t('dashboard.activeCrops')} icon={<Sprout className="size-3.5" />} value={d.totals.active_cycles} />
        <Stat label={t('dashboard.upcomingTasks')} icon={<CalendarCheck className="size-3.5" />} value={d.upcoming_tasks.length} />
      </div>

      {d.fields.length === 0 ? (
        <EmptyState
          title={t('dashboard.noFieldsTitle')}
          body={t('dashboard.noFieldsBody')}
          action={<Button asChild><Link to="/app/map">{t('dashboard.drawFirst')}</Link></Button>}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <WeatherCard data={d.weather_today} />
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t('dashboard.activeCrops')}</CardTitle>
                <Button asChild variant="ghost" size="sm"><Link to="/app/plans">{t('common.viewAll')} <ArrowRight /></Link></Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {d.active_cycles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('dashboard.noCycles')}</p>
                ) : (
                  d.active_cycles.map((c) => <CycleRow key={c.id} c={c} />)
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t('dashboard.myFields')}</CardTitle>
                <Button asChild variant="ghost" size="sm"><Link to="/app/map">{t('dashboard.openMap')} <ArrowRight /></Link></Button>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {d.fields.map((f) => (
                  <Link key={f.id} to={`/app/lands/${f.id}`} className="group flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-paddy-400 hover:bg-muted/50">
                    <FieldThumb boundary={f.boundary} className="size-14 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{formatArea(f.metrics, unit, lang)}</div>
                      {f.active_cycle && <Badge className="mt-1">{f.active_cycle.crop_name}{f.active_cycle.stage_name ? ` · ${f.active_cycle.stage_name}` : ''}</Badge>}
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-5">
            <Card>
              <CardHeader><CardTitle>{t('dashboard.alerts')}</CardTitle></CardHeader>
              <CardContent><AlertList alerts={d.alerts} compact /></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t('dashboard.upcomingTasks')}</CardTitle>
                <Button asChild variant="ghost" size="sm"><Link to="/app/tasks">{t('common.viewAll')}</Link></Button>
              </CardHeader>
              <CardContent>
                {d.upcoming_tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('tasks.none')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {d.upcoming_tasks.slice(0, 6).map((task) => <TaskLine key={task.id} task={task} />)}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskLine({ task }: { task: TaskOut }) {
  const { t, i18n } = useTranslation()
  const m = useUpdateTask(task.cycle_id)
  return (
    <li className="flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-paddy-700"
        checked={task.status === 'done'}
        aria-label={t('tasks.markDone', { title: task.title })}
        onChange={(e) => m.mutate({ id: task.id, status: e.target.checked ? 'done' : 'pending' })}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{task.title}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {formatDate(task.due_date, 'EEE d MMM', i18n.language)}
          <Badge variant="outline">{t(`tasks.category.${task.category}`)}</Badge>
          {task.weather_sensitive && <Badge variant="sky">{t('tasks.weatherSensitive')}</Badge>}
        </div>
      </div>
    </li>
  )
}

function CycleRow({ c }: { c: CycleDetail }) {
  const { t, i18n } = useTranslation()
  const stage = c.stages.find((s) => s.key === c.current?.stage_key)
  const daysLeft = differenceInCalendarDays(parseISO(c.harvest_window.expected), new Date())
  const spread = differenceInCalendarDays(parseISO(c.harvest_window.latest), parseISO(c.harvest_window.earliest))
  const pct = Math.round((c.current?.stage_progress ?? 0) * 100)
  return (
    <Link to={`/app/plans/${c.id}`} className="block rounded-xl border border-border p-4 transition hover:border-paddy-400">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{i18nText(c.crop.name, i18n.language)} · <span className="text-muted-foreground">{c.land_name}</span></div>
          <div className="text-xs text-muted-foreground">
            {stage ? i18nText(stage.name, i18n.language) : t(`cycle.status.${c.status}`)}
            {c.current && ` · ${t('timeline.das', { n: c.current.das })}`}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-semibold tabular-nums">{daysLeft > 0 ? t('dashboard.daysToHarvest', { n: daysLeft }) : t('dashboard.harvestWindow')}</div>
          <div className="text-[11px] text-muted-foreground">± {Math.ceil(spread / 2)} {t('common.days')} · <DataKindBadge kind="model_output" /></div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-paddy-400 via-paddy-500 to-sun-500" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  )
}

function WeatherCard({ data }: { data: import('@/api/types').Dashboard['weather_today'] }) {
  const { t, i18n } = useTranslation()
  if (!data) return null
  const c = data.current
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-sky-deep to-paddy-800 p-5 text-soil-50">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest opacity-80">{t('weather.now')}</div>
            <div className="mt-1 flex items-end gap-3">
              <span className="font-display text-5xl font-semibold tabular-nums">{Math.round(c.temperature_c)}°</span>
              <span className="pb-2 text-sm opacity-90">{t('weather.feelsLike', { v: Math.round(c.feels_like_c) })}</span>
            </div>
            <div className="text-sm opacity-90">{t(`weather.codes.${weatherCodeKey(c.weather_code)}`)}</div>
          </div>
          <WeatherIcon code={c.weather_code} isDay={c.is_day} className="size-14 opacity-90" />
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <span className="inline-flex items-center gap-1"><Droplets className="size-4" /> {c.humidity_pct}%</span>
          <span className="inline-flex items-center gap-1"><Wind className="size-4" /> {formatNumber(c.wind_speed_kmh, 0)} km/h {windDirLabel(c.wind_direction_deg)}</span>
          <span>{t('weather.rainNow', { v: formatNumber(c.precipitation_mm, 1) })}</span>
        </div>
      </div>
      <CardContent className="no-scrollbar flex gap-2 overflow-x-auto pt-4">
        {data.daily.filter((d) => d.kind !== 'observed').slice(0, 7).map((d) => (
          <div key={d.date} className="flex min-w-[72px] flex-col items-center gap-1 rounded-xl bg-muted/60 p-2 text-xs">
            <span className="font-medium">{formatDate(d.date, 'EEE', i18n.language)}</span>
            <WeatherIcon code={d.weather_code} className="size-5" />
            <span className="tabular-nums">{Math.round(d.tmax_c)}° / {Math.round(d.tmin_c)}°</span>
            <span className="tabular-nums text-sky-deep dark:text-sky-soft">{formatNumber(d.precipitation_mm, 1)} mm</span>
          </div>
        ))}
      </CardContent>
      <div className="flex items-center justify-between px-5 pb-4 text-xs text-muted-foreground">
        <DataKindBadge kind="forecast" />
        <Link to={`/app/lands/${data.land_id}/environment`} className="font-medium text-paddy-700 hover:underline dark:text-paddy-300">{t('dashboard.fullWeather')}</Link>
      </div>
    </Card>
  )
}

type DashboardData = import('@/api/types').Dashboard

function FieldsGlobe({ fields, totals, unit }: { fields: DashboardData['fields']; totals: DashboardData['totals']; unit: 'acre' | 'hectare' }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const lang = i18n.language
  const globeFields = useMemo<GlobeField[]>(
    () =>
      fields.map((f) => ({
        id: f.id,
        name: f.name,
        label: `${f.name} · ${formatArea(f.metrics, unit, lang)}`,
        boundary: f.boundary,
        bbox: f.metrics.bbox,
      })),
    [fields, unit, lang],
  )
  if (failed) return null
  const empty = fields.length === 0
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-[#0a1624] shadow-sm">
      <Suspense fallback={<div className="h-[340px] animate-pulse bg-[#0a1624] sm:h-[460px]" />}>
        <GlobeZoom
          className="h-[340px] sm:h-[460px]"
          fields={globeFields}
          fallbackBbox={TAMIL_NADU_BBOX}
          onFieldClick={(id) => navigate(`/app/lands/${id}`)}
          onFailed={() => setFailed(true)}
        />
      </Suspense>
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-4 pb-10 text-soil-50 sm:p-6 sm:pb-14">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sun-300">{t('globe.heroEyebrow')}</div>
        {empty ? (
          <>
            <div className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{t('globe.noFieldsTitle')}</div>
            <p className="mt-1 max-w-md text-sm text-soil-100/85">{t('globe.noFieldsHint')}</p>
            <Button asChild variant="gold" size="sm" className="pointer-events-auto mt-3">
              <Link to="/app/map"><Plus /> {t('dashboard.drawFirst')}</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="mt-1 font-display text-2xl font-semibold tabular-nums sm:text-3xl">
              {t('globe.heroSummary', { count: totals.fields, area: formatArea(totals, unit, lang) })}
            </div>
            <p className="mt-1 max-w-md text-xs text-soil-100/75">{t('globe.imageryNote')}</p>
          </>
        )}
      </div>
    </section>
  )
}
