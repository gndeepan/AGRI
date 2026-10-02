import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  ClipboardList,
  CloudRain,
  Droplets,
  Eye,
  FileDown,
  MessageCircle,
  RefreshCw,
  Thermometer,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react'
import { cyclesApi } from '@/api/endpoints'
import { qk, useCycle, useLand, useTimeline, useUpdateTask, useWeather } from '@/api/queries'
import type { CycleDetail, TimelineDay } from '@/api/types'
import { VirtualField, detectWebGL } from '@/features/field3d'
import { WEBGL_FAILED_EVENT } from '@/features/field3d/WebGLBoundary'
import type { FieldVisualState } from '@/features/field3d/types'
import { Field2D } from '@/features/timeline/Field2D'
import { applySkyToVisual, skyAtPosition } from '@/features/sky/fromTimeline'
import type { SkyParams } from '@/features/sky/params'
import { Timeline, stageColor, todayPosition } from '@/features/timeline/Timeline'
import { useSimulation } from '@/stores/simulation'
import { useUi } from '@/stores/ui'
import { nextStageAfter, toGrowthStage, visualStateAt, type VisualOptions } from '@/lib/timeline'
import { formatDate, formatNumber, i18nText } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DataKindBadge } from '@/components/common/DataKindBadge'
import { AlertList } from '@/components/common/AlertList'
import { CardSkeleton, ErrorState } from '@/components/common/States'
import { cn } from '@/lib/utils'

/**
 * Dev-only: lets visual checks force a weather state (e.g. a thunderstorm) without real data:
 * `window.__bhoomiSkyOverride = (p) => ({ ...p, thunder: 1, ... })`. Never active in production.
 */
const devSkyOverride: ((p: SkyParams) => SkyParams) | null = import.meta.env.DEV
  ? (p) => {
      const f = (window as unknown as { __bhoomiSkyOverride?: (p: SkyParams) => SkyParams }).__bhoomiSkyOverride
      return f ? f(p) : p
    }
  : null

export default function FieldExperience() {
  const { cycleId } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const cycle = useCycle(cycleId)
  const timeline = useTimeline(cycleId)
  const qc = useQueryClient()
  const [recomputing, setRecomputing] = useState(false)

  const stageName = useCallback(
    (key: string) => {
      const s = cycle.data?.stages.find((x) => x.key === key) ?? cycle.data?.crop.stages?.find((x) => x.key === key)
      return s ? i18nText(s.name, lang) : t(`stages.${key}`, { defaultValue: key })
    },
    [cycle.data, lang, t],
  )

  // Dev builds expose the simulation clock so e2e/visual checks can scrub to exact dates.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __bhoomiSim?: typeof useSimulation }).__bhoomiSim = useSimulation
  }, [])

  // Start at "today" (or the beginning) whenever a new timeline arrives.
  const initKey = useRef<string | null>(null)
  useEffect(() => {
    if (!timeline.data || initKey.current === cycleId) return
    initKey.current = cycleId ?? null
    const s = useSimulation.getState()
    s.setPlaying(false)
    s.setPosition(todayPosition(timeline.data) ?? 0.5)
  }, [timeline.data, cycleId])

  async function recompute() {
    if (!cycleId) return
    setRecomputing(true)
    try {
      await cyclesApi.recompute(cycleId)
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.cycle(cycleId) }),
        qc.invalidateQueries({ queryKey: qk.timeline(cycleId) }),
      ])
      toast.success(t('field.recomputed'))
    } catch {
      toast.error(t('errors.generic'))
    } finally {
      setRecomputing(false)
    }
  }

  if (cycle.isError) return <ErrorState error={cycle.error} onRetry={() => cycle.refetch()} />
  if (timeline.isError) return <ErrorState error={timeline.error} onRetry={() => timeline.refetch()} />

  const c = cycle.data
  const tl = timeline.data

  return (
    <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-10 lg:-mt-10">
      {/* immersive scene */}
      <section className="relative h-[58svh] min-h-[340px] w-full overflow-hidden bg-paddy-950 sm:h-[64svh]">
        {c && tl ? <SceneLayer cycle={c} timeline={tl} /> : <Skeleton className="h-full w-full rounded-none" />}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 bg-gradient-to-b from-black/45 to-transparent p-4 sm:p-6">
          <div className="pointer-events-auto text-soil-50">
            {c ? (
              <>
                <Link to={`/app/lands/${c.land_id}`} className="text-xs font-medium uppercase tracking-widest text-soil-100/80 hover:underline">{c.land_name}</Link>
                <h1 className="font-display text-2xl font-semibold drop-shadow sm:text-4xl">
                  {i18nText(c.crop.name, lang)}{c.variety ? <span className="font-normal opacity-80"> · {c.variety.name}</span> : null}
                </h1>
              </>
            ) : (
              <Skeleton className="h-10 w-48 opacity-30" />
            )}
            {tl && <SceneReadout timeline={tl} stageName={stageName} />}
          </div>
          <SceneControls />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          <p className="glass pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-medium sm:text-xs">
            <Eye className="size-3.5 shrink-0" /> {t('field.banner')}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-10">
        {tl && c ? (
          tl.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('field.noTimeline')}</p>
          ) : (
            <Timeline timeline={tl} stageName={stageName} />
          )
        ) : (
          <Skeleton className="h-36" />
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to={`/app/plans/${cycleId}/records`}><ClipboardList /> {t('field.records')}</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to={`/app/assistant?cycle=${cycleId}`}><MessageCircle /> {t('field.askAssistant')}</Link></Button>
          <Button asChild variant="outline" size="sm"><a href={cycleId ? cyclesApi.exportUrl(cycleId) : '#'} target="_blank" rel="noreferrer"><FileDown /> {t('field.exportPdf')}</a></Button>
          <Button variant="outline" size="sm" onClick={recompute} disabled={recomputing}><RefreshCw className={cn(recomputing && 'animate-spin')} /> {t('field.recompute')}</Button>
        </div>

        {c && tl ? (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <DayPanel cycle={c} timeline={tl} stageName={stageName} />
            <div className="space-y-5">
              <StagesCard cycle={c} />
              <ModelCard cycle={c} />
            </div>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2"><CardSkeleton lines={6} /><CardSkeleton lines={6} /></div>
        )}
      </div>
    </div>
  )
}

/** Renders 3D (paddy, WebGL available) or the 2D fallback, driven by the shared simulation clock. */
function SceneLayer({ cycle, timeline }: { cycle: CycleDetail; timeline: TimelineDay[] }) {
  const { t } = useTranslation()
  const { sceneQuality, soundEnabled } = useUi()
  const [webgl, setWebgl] = useState(() => detectWebGL())
  useEffect(() => {
    const off = () => setWebgl(false)
    window.addEventListener(WEBGL_FAILED_EVENT, off)
    return () => window.removeEventListener(WEBGL_FAILED_EVENT, off)
  }, [])
  const opts: VisualOptions = useMemo(
    () => ({ cropSlug: cycle.crop.slug, irrigationMethod: cycle.irrigation_method }),
    [cycle.crop.slug, cycle.irrigation_method],
  )
  // The scene is built at the true shape and scale of the drawn field.
  const land = useLand(cycle.land_id)
  const position = useSimulation((s) => s.position)
  // The same live sky as the dashboard: hourly forecast where available, else derived from the day.
  const weather = useWeather(cycle.land_id)
  const centroid = land.data?.metrics.centroid
  const sky = useMemo(() => {
    if (!centroid) return null
    const s = skyAtPosition(timeline, position, {
      lat: centroid.lat, lon: centroid.lon, hourly: weather.data?.hourly, utcOffsetSeconds: weather.data?.utc_offset_seconds,
    })
    return devSkyOverride ? { ...s, params: devSkyOverride(s.params) } : s
  }, [timeline, position, centroid, weather.data])
  const state: FieldVisualState = useMemo(() => {
    const base = visualStateAt(timeline, position, opts)
    return sky ? applySkyToVisual(base, sky) : base
  }, [timeline, position, opts, sky])
  // Every plannable crop has a 3D scene; the 2D illustration is only the no-WebGL fallback.
  const use3D = webgl

  return (
    <>
      {use3D ? (
        <Suspense fallback={<Field2D state={state} className="absolute inset-0" />}>
          <VirtualField
            state={state}
            boundary={land.data?.boundary}
            cropSlug={cycle.crop.slug}
            irrigationMethod={cycle.irrigation_method}
            sky={sky?.params}
            quality={sceneQuality}
            soundEnabled={soundEnabled}
            className="absolute inset-0"
          />
        </Suspense>
      ) : (
        <Field2D state={state} className="absolute inset-0" />
      )}
      {!use3D && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[11px] text-soil-50">
          {t('field.noWebgl')}
        </div>
      )}
    </>
  )
}

function SceneReadout({ timeline, stageName }: { timeline: TimelineDay[]; stageName: (k: string) => string }) {
  const { t, i18n } = useTranslation()
  const idx = useSimulation((s) => Math.min(timeline.length - 1, Math.max(0, Math.floor(s.position))))
  const d = timeline[idx]
  if (!d) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-soil-50/90">
      <span className="font-semibold">{formatDate(d.date, 'EEE, d MMM yyyy', i18n.language)}</span>
      <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-paddy-950" style={{ background: stageColor(toGrowthStage(d.stage_key)) }}>
        {stageName(d.stage_key)}
      </span>
      <span className="text-xs">{d.das >= 0 ? t('timeline.das', { n: d.das }) : t('timeline.beforeSowing', { n: -d.das })}{d.dat != null && d.dat >= 0 ? ` · ${t('timeline.dat', { n: d.dat })}` : ''}</span>
    </div>
  )
}

function SceneControls() {
  const { t } = useTranslation()
  const { soundEnabled, setSoundEnabled, sceneQuality, setSceneQuality } = useUi()
  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      <select
        value={sceneQuality}
        onChange={(e) => setSceneQuality(e.target.value as 'auto' | 'low' | 'high')}
        aria-label={t('field.quality')}
        className="glass h-9 rounded-full px-3 text-xs font-medium outline-none"
      >
        {(['auto', 'low', 'high'] as const).map((q) => <option key={q} value={q}>{t(`field.qualities.${q}`)}</option>)}
      </select>
      <Button size="icon-sm" variant="outline" className="glass" onClick={() => setSoundEnabled(!soundEnabled)} aria-pressed={soundEnabled} aria-label={soundEnabled ? t('field.soundOff') : t('field.soundOn')}>
        {soundEnabled ? <Volume2 /> : <VolumeX />}
      </Button>
    </div>
  )
}

function DayPanel({ cycle, timeline, stageName }: { cycle: CycleDetail; timeline: TimelineDay[]; stageName: (k: string) => string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const idx = useSimulation((s) => Math.min(timeline.length - 1, Math.max(0, Math.floor(s.position))))
  const d = timeline[idx]
  const next = useMemo(() => nextStageAfter(timeline, idx), [timeline, idx])
  const update = useUpdateTask(cycle.id)
  if (!d) return null
  const w = d.weather
  const nextDate = next ? timeline[next.index]?.date : null
  const pred = cycle.stages.find((s) => s.key === d.stage_key)

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{formatDate(d.date, 'EEEE, d MMMM yyyy', lang)}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.das >= 0 ? t('timeline.das', { n: d.das }) : t('timeline.beforeSowing', { n: -d.das })}
            {d.dat != null && d.dat >= 0 ? ` · ${t('timeline.dat', { n: d.dat })}` : ''} · {t('field.gdd', { v: formatNumber(d.gdd_cumulative, 0, lang) })}
          </p>
        </div>
        <DataKindBadge kind="model_output" />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: stageColor(toGrowthStage(d.stage_key)) }} />
              <span className="font-display text-lg font-semibold">{stageName(d.stage_key)}</span>
              {pred?.source === 'user_entered' && <Badge variant="outline">{t('field.observedStage')}</Badge>}
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{Math.round(d.stage_local_progress * 100)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${d.stage_local_progress * 100}%`, background: stageColor(toGrowthStage(d.stage_key)) }} />
          </div>
          {pred && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('field.stageRange', {
                from: formatDate(pred.start.expected, 'd MMM', lang),
                to: formatDate(pred.end.expected, 'd MMM', lang),
                early: formatDate(pred.start.earliest, 'd MMM', lang),
                late: formatDate(pred.end.latest, 'd MMM', lang),
              })}
            </p>
          )}
          {next && nextDate && (
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <CalendarClock className="size-4 text-paddy-600" />
              {t('field.nextStage', { stage: stageName(next.stageKey), days: differenceInCalendarDays(parseISO(nextDate), parseISO(d.date)), date: formatDate(nextDate, 'd MMM', lang) })}
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('field.weather')}</h3>
            {w ? <DataKindBadge kind={w.kind} /> : <Badge variant="warn">{t('field.weatherUnavailable')}</Badge>}
          </div>
          {w ? (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Metric icon={<Thermometer className="size-4 text-sun-500" />} label={t('env.tempRangeShort')} value={`${formatNumber(w.tmin_c, 0)}–${formatNumber(w.tmax_c, 0)}°C`} />
              <Metric
                icon={<CloudRain className="size-4 text-sky-deep" />}
                label={t('env.rain')}
                value={w.kind === 'climatology'
                  ? t('field.typicalRain', { v: formatNumber(w.precipitation_mm, 1) })
                  : `${formatNumber(w.precipitation_mm, 1)} mm${w.precipitation_hours ? ` · ${formatNumber(w.precipitation_hours, 0)} h` : ''}`}
              />
              <Metric icon={<Wind className="size-4 text-soil-500" />} label={t('env.windMax')} value={`${formatNumber(w.wind_speed_max_kmh, 0)} km/h`} />
              <Metric icon={<Droplets className="size-4 text-paddy-600" />} label={t('env.humidity')} value={w.humidity_mean_pct != null ? `${formatNumber(w.humidity_mean_pct, 0)}%` : '—'} />
              {w.kind === 'climatology' && <p className="col-span-full text-xs text-muted-foreground">{t('field.climatologyNote')}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('field.weatherUnavailableBody')}</p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('field.tasksToday')}</h3>
          {d.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('field.noTasksDay')}</p>
          ) : (
            <ul className="space-y-2">
              {d.tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-paddy-700"
                    checked={task.status === 'done'}
                    onChange={(e) => update.mutate({ id: task.id, status: e.target.checked ? 'done' : 'pending' })}
                    aria-label={t('tasks.markDone', { title: task.title })}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{task.title}</div>
                    {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{t(`tasks.category.${task.category}`)}</Badge>
                      {task.weather_sensitive && <Badge variant="sky">{t('tasks.weatherSensitive')}</Badge>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {d.warnings.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="size-4 text-orange-600" /> {t('field.warnings')}</h3>
            <AlertList alerts={d.warnings} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-2.5">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function StagesCard({ cycle }: { cycle: CycleDetail }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t('field.stagePlan')}</CardTitle>
        <Badge variant="gold">{t('field.harvestWindow', { from: formatDate(cycle.harvest_window.earliest, 'd MMM', lang), to: formatDate(cycle.harvest_window.latest, 'd MMM', lang) })}</Badge>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-3 border-l border-border pl-5">
          {[...cycle.stages].sort((a, b) => a.order - b.order).map((s) => (
            <li key={s.key} className="relative">
              <span className="absolute -left-[26px] top-1 size-3 rounded-full ring-4 ring-card" style={{ background: stageColor(toGrowthStage(s.key)) }} />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{i18nText(s.name, lang)}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDate(s.start.expected, 'd MMM', lang)} – {formatDate(s.end.expected, 'd MMM', lang)}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t('field.range', { early: formatDate(s.start.earliest, 'd MMM', lang), late: formatDate(s.end.latest, 'd MMM', lang) })}
                {s.source === 'user_entered' && s.observed_on && ` · ${t('field.observedOn', { date: formatDate(s.observed_on, 'd MMM', lang) })}`}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function ModelCard({ cycle }: { cycle: CycleDetail }) {
  const { t } = useTranslation()
  const m = cycle.model
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen className="size-4" /> {t('field.model')}</CardTitle>
        <p className="text-xs text-muted-foreground">{m.name} v{m.version} · {t('field.baseTemp', { v: m.base_temp_c })}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {m.missing_inputs.length > 0 && (
          <div className="rounded-xl bg-sun-300/20 p-3">
            <div className="mb-1 text-xs font-semibold">{t('field.missingInputs')}</div>
            <ul className="list-disc space-y-0.5 pl-4 text-xs">{m.missing_inputs.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-xs font-semibold">{t('field.assumptions')} ({m.assumptions.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{m.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
        {m.references.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold">{t('field.references')}</div>
            {m.references.map((r) => (
              <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="block text-xs text-paddy-700 hover:underline dark:text-paddy-300">
                {r.title} — {r.publisher}
              </a>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{t('field.notYield')}</p>
      </CardContent>
    </Card>
  )
}
