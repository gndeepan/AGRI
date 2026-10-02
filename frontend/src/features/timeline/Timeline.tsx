import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { TimelineDay } from '@/api/types'
import { useSimulation } from '@/stores/simulation'
import { dayIndexForDate, hourLabel, stageMarkers } from '@/lib/timeline'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const STAGE_COLORS: Record<string, string> = {
  fallow: '#b18a58',
  nursery: '#9cc47c',
  establishment: '#7fb069',
  tillering: '#5a9447',
  stem_elongation: '#437735',
  panicle_initiation: '#355d2c',
  flowering: '#e6bb5c',
  grain_filling: '#c9a24a',
  maturity: '#a5822f',
  harvested: '#8f6a3f',
}

export function stageColor(key: string) {
  return STAGE_COLORS[key] ?? '#7fb069'
}

const SPEEDS = [0.25, 1, 3, 7]

function useIsCompact() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const on = () => setCompact(window.innerWidth < 640)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return compact
}

/** Today's position (fractional, includes current hour) on this timeline, or null if outside. */
export function todayPosition(timeline: TimelineDay[]): number | null {
  if (!timeline.length) return null
  const now = new Date()
  const idx = dayIndexForDate(timeline, now)
  const iso = format(now, 'yyyy-MM-dd')
  if (iso < timeline[0].date || iso > timeline[timeline.length - 1].date) return null
  return idx + (now.getHours() + now.getMinutes() / 60) / 24
}

interface Props {
  timeline: TimelineDay[]
  stageName: (key: string) => string
}

/**
 * Scroll/drag-driven agricultural calendar. The viewport centre is the playhead:
 * scrolling the track (wheel, touch, drag, keys) moves the simulation clock.
 * No network requests happen while scrubbing — everything is local interpolation.
 */
export function Timeline({ timeline, stageName }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const compact = useIsCompact()
  const DAY_W = compact ? 16 : 28
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const playing = useSimulation((s) => s.playing)
  const speed = useSimulation((s) => s.speed)
  const dayIndex = useSimulation((s) => Math.floor(s.position))
  const { setPlaying, setSpeed, setPosition } = useSimulation.getState()
  const markers = useMemo(() => stageMarkers(timeline), [timeline])
  const todayPos = useMemo(() => todayPosition(timeline), [timeline])
  const maxPos = Math.max(0, timeline.length - 0.001)
  const maxRain = useMemo(() => Math.max(10, ...timeline.map((d) => d.weather?.precipitation_mm ?? 0)), [timeline])
  const dragging = useRef<{ x: number; left: number } | null>(null)

  // Measure the viewport so the centre line maps to the playhead.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Store → scroll (programmatic seeks, playback). Subscribed outside React render for 60fps.
  useEffect(() => {
    const sync = (pos: number) => {
      const el = scrollRef.current
      if (!el) return
      const target = pos * DAY_W
      if (Math.abs(el.scrollLeft - target) > 1) el.scrollLeft = target
    }
    sync(useSimulation.getState().position)
    return useSimulation.subscribe((s) => sync(s.position))
  }, [DAY_W, width])

  // Playback loop.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const s = useSimulation.getState()
      const next = s.position + dt * s.speed
      if (next >= maxPos) {
        s.setPosition(maxPos)
        s.setPlaying(false)
        return
      }
      s.setPosition(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, maxPos])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const pos = el.scrollLeft / DAY_W
    const cur = useSimulation.getState().position
    // Ignore echoes of our own programmatic scrolls (sub-pixel rounding).
    if (Math.abs(pos - cur) * DAY_W <= 1) return
    if (useSimulation.getState().playing) setPlaying(false)
    setPosition(Math.min(maxPos, Math.max(0, pos)))
  }

  function seek(pos: number) {
    setPlaying(false)
    setPosition(Math.min(maxPos, Math.max(0, pos)))
  }

  function jumpStage(dir: 1 | -1) {
    const cur = useSimulation.getState().position
    const list = dir === 1 ? markers.filter((m) => m.index > Math.floor(cur) + 0.01) : markers.filter((m) => m.index < Math.floor(cur)).reverse()
    if (list[0]) seek(list[0].index + 0.5)
    else seek(dir === 1 ? maxPos : 0)
  }

  function onKey(e: React.KeyboardEvent) {
    const cur = useSimulation.getState().position
    const step = e.shiftKey ? 7 : 1
    if (e.key === 'ArrowRight') seek(cur + step)
    else if (e.key === 'ArrowLeft') seek(cur - step)
    else if (e.key === 'Home') seek(0)
    else if (e.key === 'End') seek(maxPos)
    else if (e.key === ' ') {
      e.preventDefault()
      setPlaying(!playing)
      return
    } else return
    e.preventDefault()
  }

  const pad = width / 2
  const current = timeline[Math.min(dayIndex, timeline.length - 1)]

  return (
    <div className="space-y-3">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          <Button size="icon-sm" variant="ghost" onClick={() => jumpStage(-1)} aria-label={t('timeline.prevStage')} title={t('timeline.prevStage')}><SkipBack /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => seek(useSimulation.getState().position - 1)} aria-label={t('timeline.prevDay')}><ChevronLeft /></Button>
          <Button size="icon-sm" onClick={() => setPlaying(!playing)} aria-label={playing ? t('timeline.pause') : t('timeline.play')}>
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => seek(useSimulation.getState().position + 1)} aria-label={t('timeline.nextDay')}><ChevronRight /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => jumpStage(1)} aria-label={t('timeline.nextStage')} title={t('timeline.nextStage')}><SkipForward /></Button>
        </div>
        <label className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">{t('timeline.speed')}</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-transparent font-semibold outline-none" aria-label={t('timeline.speed')}>
            {SPEEDS.map((s) => <option key={s} value={s}>{t('timeline.speedValue', { n: s })}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <span className="sr-only">{t('timeline.pickDate')}</span>
          <input
            type="date"
            className="bg-transparent text-xs font-semibold outline-none"
            min={timeline[0]?.date}
            max={timeline[timeline.length - 1]?.date}
            value={current?.date ?? ''}
            onChange={(e) => e.target.value && seek(dayIndexForDate(timeline, e.target.value) + 0.5)}
          />
        </label>
        <Button size="sm" variant="outline" onClick={() => todayPos != null && seek(todayPos)} disabled={todayPos == null}>{t('timeline.today')}</Button>
        <HourReadout />
      </div>

      {/* track */}
      <div className="relative rounded-2xl border border-border bg-card">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && scrollRef.current) scrollRef.current.scrollLeft += e.deltaY
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') return // touch uses native scroll
            dragging.current = { x: e.clientX, left: scrollRef.current?.scrollLeft ?? 0 }
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (dragging.current && scrollRef.current) scrollRef.current.scrollLeft = dragging.current.left - (e.clientX - dragging.current.x)
          }}
          onPointerUp={() => (dragging.current = null)}
          onKeyDown={onKey}
          tabIndex={0}
          role="slider"
          aria-label={t('timeline.label')}
          aria-valuemin={0}
          aria-valuemax={timeline.length - 1}
          aria-valuenow={dayIndex}
          aria-valuetext={current ? `${formatDate(current.date, 'd MMMM yyyy', lang)} · ${stageName(current.stage_key)}` : undefined}
          className="no-scrollbar relative cursor-grab overflow-x-auto overflow-y-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          style={{ touchAction: 'pan-x' }}
        >
          <div className="relative" style={{ width: timeline.length * DAY_W + width, height: compact ? 92 : 118 }}>
            {/* stage labels */}
            {markers.map((m) => (
              <div
                key={`${m.index}-${m.stageKey}`}
                className="absolute top-1.5 whitespace-nowrap border-l-2 pl-1.5 text-[10px] font-semibold"
                style={{ left: pad + m.index * DAY_W, borderColor: stageColor(m.stageKey) }}
              >
                {stageName(m.stageKey)}
              </div>
            ))}
            {timeline.map((d, i) => {
              const date = parseISO(d.date)
              const isFirst = date.getDate() === 1 || i === 0
              const rain = d.weather?.precipitation_mm ?? 0
              const clim = d.weather?.kind === 'climatology'
              return (
                <div key={d.date} className="absolute bottom-0" style={{ left: pad + i * DAY_W, width: DAY_W, top: compact ? 22 : 26 }}>
                  <div className="h-2" style={{ background: stageColor(d.stage_key), opacity: clim ? 0.55 : 1 }} />
                  <div className={cn('relative flex h-[calc(100%-0.5rem)] flex-col items-center justify-end border-l border-border/40', clim && 'bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgba(201,162,74,0.12)_4px_6px)]', i === dayIndex && 'bg-paddy-100/60 dark:bg-paddy-800/40')}>
                    {rain > 0.2 && (
                      <div className="absolute bottom-6 w-1.5 rounded-t-sm bg-sky-deep/70" style={{ height: Math.max(2, (rain / maxRain) * (compact ? 26 : 40)) }} title={`${rain.toFixed(1)} mm`} />
                    )}
                    {d.tasks.length > 0 && <div className="absolute top-1 size-1.5 rounded-full bg-sun-500" />}
                    {d.warnings.length > 0 && <div className="absolute top-3.5 size-1.5 rounded-full bg-orange-500" />}
                    <span className={cn('pb-1 text-[9px] tabular-nums text-muted-foreground', !compact || date.getDate() % 5 === 0 ? '' : 'invisible')}>{date.getDate()}</span>
                  </div>
                  {isFirst && <div className="absolute -top-0.5 left-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ top: compact ? 8 : 10 }}>{formatDate(date, 'MMM', lang)}</div>}
                </div>
              )
            })}
            {todayPos != null && (
              <div className="pointer-events-none absolute bottom-0 top-5 w-0.5 bg-sky-deep" style={{ left: pad + todayPos * DAY_W }}>
                <span className="absolute -top-1 left-1 rounded bg-sky-deep px-1 text-[9px] font-semibold text-white">{t('timeline.today')}</span>
              </div>
            )}
          </div>
        </div>
        {/* playhead */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-sun-500">
          <div className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-sun-500" />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sun-500" /> {t('timeline.legendTask')}</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-orange-500" /> {t('timeline.legendWarning')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-1.5 rounded-sm bg-sky-deep/70" /> {t('timeline.legendRain')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgba(201,162,74,0.5)_3px_5px)]" /> {t('timeline.legendClimatology')}</span>
        <span>{t('timeline.keys')}</span>
      </div>
    </div>
  )
}

function HourReadout() {
  const label = useSimulation((s) => hourLabel(s.position).slice(0, 2) + ':00')
  const { t } = useTranslation()
  return (
    <span className="ml-auto rounded-full bg-paddy-900 px-3 py-1.5 font-mono text-xs text-soil-50" aria-label={t('timeline.simTime')}>
      {label}
    </span>
  )
}
