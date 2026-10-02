import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { TimelineDay } from '@/api/types'
import type { FieldVisualState, GrowthStageKey } from '@/features/field3d/types'
import { clamp, lerp } from './utils'

export const GROWTH_STAGES: GrowthStageKey[] = [
  'fallow',
  'nursery',
  'establishment',
  'tillering',
  'stem_elongation',
  'panicle_initiation',
  'flowering',
  'grain_filling',
  'maturity',
  'harvested',
]

/** Backend stage keys that don't match the visual vocabulary 1:1. */
const STAGE_ALIASES: Record<string, GrowthStageKey> = {
  pre_sowing: 'fallow',
  land_preparation: 'fallow',
  sowing: 'nursery',
  germination: 'nursery',
  seedling: 'nursery',
  emergence: 'establishment',
  transplanting: 'establishment',
  vegetative: 'tillering',
  active_tillering: 'tillering',
  max_tillering: 'stem_elongation',
  booting: 'panicle_initiation',
  heading: 'flowering',
  anthesis: 'flowering',
  reproductive: 'panicle_initiation',
  milk: 'grain_filling',
  dough: 'grain_filling',
  ripening: 'grain_filling',
  yield_formation: 'grain_filling',
  physiological_maturity: 'maturity',
  harvest: 'maturity',
  post_harvest: 'harvested',
}

/** Rough stage by whole-cycle progress, used only when the backend key is unknown. */
const PROGRESS_BANDS: [number, GrowthStageKey][] = [
  [0.12, 'establishment'],
  [0.35, 'tillering'],
  [0.5, 'stem_elongation'],
  [0.62, 'panicle_initiation'],
  [0.7, 'flowering'],
  [0.9, 'grain_filling'],
  [1.01, 'maturity'],
]

export function toGrowthStage(key: string | null | undefined, cycleProgress = 0): GrowthStageKey {
  if (key && (GROWTH_STAGES as string[]).includes(key)) return key as GrowthStageKey
  if (key && STAGE_ALIASES[key]) return STAGE_ALIASES[key]
  for (const [limit, stage] of PROGRESS_BANDS) if (cycleProgress < limit) return stage
  return 'maturity'
}

/** Paddy stages during which the field is normally kept flooded / saturated. */
const FLOODED_STAGES = new Set<GrowthStageKey>([
  'establishment',
  'tillering',
  'stem_elongation',
  'panicle_initiation',
  'flowering',
])

export interface VisualOptions {
  cropSlug?: string
  irrigationMethod?: string
  /** Fallback when a day has no dominant wind direction (e.g. climatology rows). */
  windDirectionDeg?: number
}

/**
 * IMD's definition of a "rainy day" (≥ 2.5 mm). Smaller totals are drizzle or trace
 * amounts spread over many hours and don't get a rain animation.
 */
export const RAIN_MIN_MM = 2.5

/** Maps a rain *rate* (mm/hour) to a 0..1 visual intensity; light rain still reads as rain. */
export function rainRateToIntensity(mmPerHour: number): number {
  if (!(mmPerHour > 0)) return 0
  return clamp(0.15 + 0.85 * (1 - Math.exp(-mmPerHour / 6)))
}

/** Maps a daily total (mm) to a 0..1 visual intensity, assuming it falls over a few hours. */
export function rainToIntensity(mm: number | null | undefined): number {
  if (!mm || mm < RAIN_MIN_MM) return 0
  return rainRateToIntensity(mm / estimatedRainHours(mm))
}

/** When Open-Meteo doesn't report precipitation_hours: heavier days tend to rain longer. */
function estimatedRainHours(mm: number): number {
  return clamp(Math.round(mm / 3), 1, 12)
}

/** Stable 0..1 hash of a string (FNV-1a). Same date → same simulated rain timing. */
function hashString01(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 4294967296
}

export interface RainWindow {
  /** Local hours, 0..24. Timing within the day is simulated; the total and duration are data. */
  start: number
  end: number
  /** Visual intensity inside the window. */
  intensity: number
  mm: number
  hours: number
}

/**
 * When it rains on this day, if at all. Only observed or forecast days with at least
 * RAIN_MIN_MM get a window: climatology is a multi-year average, so "3 mm" there does
 * not mean it rains that day and must never drive a rain animation.
 */
export function rainWindow(day: TimelineDay | undefined): RainWindow | null {
  const w = day?.weather
  if (!w || (w.kind !== 'observed' && w.kind !== 'forecast')) return null
  const mm = w.precipitation_mm ?? 0
  if (!(mm >= RAIN_MIN_MM)) return null
  const reported = w.precipitation_hours
  const hours = clamp(reported && reported > 0 ? reported : estimatedRainHours(mm), 0.75, 24)
  if (hours >= 20) return { start: 0, end: 24, intensity: rainRateToIntensity(mm / hours), mm, hours }
  // Tamil Nadu showers favour afternoon/evening: centre the window between 12:00 and 20:00.
  const centre = 12 + hashString01(day.date) * 8
  const start = clamp(centre - hours / 2, 0, 24 - hours)
  return { start, end: start + hours, intensity: rainRateToIntensity(mm / hours), mm, hours }
}

const RAMP_H = 0.4
/** Rain intensity at `hour` (may be > 24 when asking about a previous day's window). */
function rainInWindow(win: RainWindow | null, hour: number): number {
  if (!win) return 0
  if (hour < win.start || hour > win.end) return 0
  const edge = Math.min(hour - win.start, win.end - hour)
  const ramp = win.start <= 0 && hour - win.start < RAMP_H ? 1 : clamp(edge / RAMP_H)
  return win.intensity * ramp * ramp * (3 - 2 * ramp)
}

const DRY_HOURS = 4
/** Surface wetness: 1 while raining, then decaying over a few hours. */
function wetnessFrom(win: RainWindow | null, hour: number): number {
  if (!win || hour < win.start) return 0
  if (hour <= win.end) return clamp(0.5 + win.intensity)
  return clamp(0.5 + win.intensity) * Math.exp(-(hour - win.end) / DRY_HOURS)
}

function cloudFor(day: TimelineDay | undefined): number {
  const w = day?.weather
  if (!w) return 0.2
  if (w.cloud_cover_mean_pct != null) return clamp(w.cloud_cover_mean_pct / 100)
  // No cloud data: a visual-only guess from the day's rain (climatology included — cloudier, not rainy).
  const mm = w.precipitation_mm ?? 0
  return clamp(0.15 + (1 - Math.exp(-mm / 10)) * 0.6)
}

/** Interpolates compass bearings along the shorter arc. */
function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return (((a + d * t) % 360) + 360) % 360
}

function standingWaterFor(stage: GrowthStageKey, stageProgress: number, opts: VisualOptions): boolean {
  const isPaddy = (opts.cropSlug ?? 'paddy').includes('paddy') || (opts.cropSlug ?? '').includes('rice')
  if (!isPaddy) return false
  if (opts.irrigationMethod === 'rainfed' || opts.irrigationMethod === 'drip' || opts.irrigationMethod === 'sprinkler')
    return false
  if (FLOODED_STAGES.has(stage)) return true
  // Fields are typically drained ~10–15 days before harvest: keep water in the first half of grain filling.
  return stage === 'grain_filling' && stageProgress < 0.5
}

/**
 * Deterministic visual state for a fractional position on the daily timeline.
 * `position` = days since timeline[0].date; the fractional part is the time of day.
 * Same input always yields the same output, so scrubbing back and forth is stable.
 */
export function visualStateAt(timeline: TimelineDay[], position: number, opts: VisualOptions = {}): FieldVisualState {
  if (timeline.length === 0) {
    return {
      stageKey: 'fallow',
      stageProgress: 0,
      cycleProgress: 0,
      hourOfDay: 12,
      cloudCover: 0.2,
      rainIntensity: 0,
      windSpeedKmh: 6,
      windDirectionDeg: opts.windDirectionDeg ?? 225,
      standingWater: false,
      weatherKind: 'simulated',
      groundWetness: 0,
      humidityPct: null,
    }
  }
  const maxPos = timeline.length - 1 + 0.999
  const p = clamp(position, 0, maxPos)
  const i = Math.floor(p)
  const frac = p - i
  const hour = frac * 24
  const a = timeline[i]
  const b = timeline[Math.min(i + 1, timeline.length - 1)]
  const prev = i > 0 ? timeline[i - 1] : undefined

  const cycleProgress = clamp(lerp(a.cycle_progress, b.cycle_progress, frac))
  const sameStage = a.stage_key === b.stage_key && b !== a
  const stageProgress = clamp(
    sameStage ? lerp(a.stage_local_progress, b.stage_local_progress, frac) : lerp(a.stage_local_progress, 1, frac * 0.999),
  )
  const stageKey = a.das < 0 && !a.stage_key ? 'fallow' : toGrowthStage(a.stage_key, cycleProgress)

  // Rain only falls inside today's window; yesterday's late rain can still leave the ground wet.
  const today = rainWindow(a)
  const yesterday = rainWindow(prev)
  const rain = rainInWindow(today, hour)
  const groundWetness = Math.max(wetnessFrom(today, hour), wetnessFrom(yesterday, hour + 24))

  const windA = a.weather?.wind_speed_max_kmh ?? 6
  const windB = b.weather?.wind_speed_max_kmh ?? windA
  const fallbackDir = opts.windDirectionDeg ?? 225
  const dirA = a.weather?.wind_direction_dominant_deg ?? fallbackDir
  const dirB = b.weather?.wind_direction_dominant_deg ?? dirA
  const baseCloud = lerp(cloudFor(a), cloudFor(b), frac)

  return {
    stageKey,
    stageProgress,
    cycleProgress,
    hourOfDay: hour,
    sunrise: a.weather?.sunrise ?? null,
    sunset: a.weather?.sunset ?? null,
    // Rain needs a cloud deck overhead even when the daily mean cover is modest.
    cloudCover: Math.max(baseCloud, rain > 0 ? 0.75 + rain * 0.25 : 0),
    rainIntensity: rain,
    windSpeedKmh: lerp(windA, windB, frac),
    windDirectionDeg: lerpAngle(dirA, dirB, frac),
    standingWater: standingWaterFor(stageKey, stageProgress, opts),
    weatherKind: a.weather?.kind ?? 'simulated',
    groundWetness,
    humidityPct: a.weather?.humidity_mean_pct ?? null,
  }
}

export function dayIndexForDate(timeline: TimelineDay[], date: Date | string): number {
  if (timeline.length === 0) return 0
  const d = typeof date === 'string' ? parseISO(date) : date
  return clamp(differenceInCalendarDays(d, parseISO(timeline[0].date)), 0, timeline.length - 1)
}

export function dateAtPosition(timeline: TimelineDay[], position: number): string {
  if (timeline.length === 0) return format(new Date(), 'yyyy-MM-dd')
  return format(addDays(parseISO(timeline[0].date), Math.floor(clamp(position, 0, timeline.length - 1))), 'yyyy-MM-dd')
}

export interface StageMarker {
  index: number
  stageKey: string
}

export function stageMarkers(timeline: TimelineDay[]): StageMarker[] {
  const out: StageMarker[] = []
  timeline.forEach((d, index) => {
    for (const e of d.events) if (e.type === 'stage_start') out.push({ index, stageKey: e.stage_key })
  })
  if (out.length === 0) {
    // Fall back to detecting key changes.
    timeline.forEach((d, index) => {
      if (index === 0 || timeline[index - 1].stage_key !== d.stage_key) out.push({ index, stageKey: d.stage_key })
    })
  }
  return out
}

export function nextStageAfter(timeline: TimelineDay[], index: number): StageMarker | null {
  return stageMarkers(timeline).find((m) => m.index > index) ?? null
}

/** Hour (0–24) from a fractional position: purely a function of the fractional part. */
export function hourLabel(position: number): string {
  const h = (position - Math.floor(position)) * 24
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
