import type { TimelineDay, WeatherHourly } from '@/api/types'
import type { FieldVisualState } from '@/features/field3d/types'
import { rainRateAt, rainRateToIntensity } from '@/lib/timeline'
import { toSkyParams, type SkyParams, type WeatherLike } from './params'

/**
 * The live sky for a point on a crop timeline. Pure and deterministic, so scrubbing back and
 * forth always shows the same sky:
 * - hours covered by the land's hourly forecast use that row (weather code, cloud layers,
 *   rain/showers, visibility, wind), blended between neighbouring hours;
 * - other observed/forecast days are derived from the daily row: cloud from the daily mean, rain
 *   only inside the day's rain window (same logic as the 3D rain), never thunder (daily rows have
 *   no weather code);
 * - climatology days get a "typical" sky: cloud only, no rain, no lightning.
 */

export type SkySource = 'hourly' | 'daily' | 'climatology' | 'none'

export interface TimelineSkyContext {
  lat: number
  lon: number
  hourly?: WeatherHourly[] | null
  /** Field's offset from UTC; timeline dates and hourly times are local wall-clock. */
  utcOffsetSeconds?: number | null
}

export interface TimelineSky {
  params: SkyParams
  source: SkySource
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const pad = (n: number) => String(n).padStart(2, '0')

/** IST unless the bundle says otherwise; elsewhere a solar-time estimate from longitude. */
export function offsetFor(ctx: TimelineSkyContext): number {
  if (ctx.utcOffsetSeconds != null) return ctx.utcOffsetSeconds
  return ctx.lon > 68 && ctx.lon < 98 ? 19800 : Math.round(ctx.lon / 15) * 3600
}

/** UTC instant for a local date ("YYYY-MM-DD") and fractional local hour. */
export function localInstant(date: string, hour: number, offsetSeconds: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + hour * 3_600_000 - offsetSeconds * 1000)
}

const hourIndexCache = new WeakMap<WeatherHourly[], Map<string, number>>()
function hourIndex(rows: WeatherHourly[]): Map<string, number> {
  let m = hourIndexCache.get(rows)
  if (!m) {
    m = new Map(rows.map((r, i) => [r.time.slice(0, 13), i]))
    hourIndexCache.set(rows, m)
  }
  return m
}

const num = (a: number | null | undefined, b: number | null | undefined, t: number) =>
  a == null ? (b ?? null) : b == null ? a : lerp(a, b, t)

/** Blend two hourly rows; categorical fields come from the nearer hour. */
function blendHourly(a: WeatherHourly, b: WeatherHourly, t: number): WeatherLike {
  const near = t < 0.5 ? a : b
  let dir = a.wind_direction_deg ?? null
  if (dir != null && b.wind_direction_deg != null) {
    const d = ((((b.wind_direction_deg - dir) % 360) + 540) % 360) - 180
    dir = (((dir + d * t) % 360) + 360) % 360
  }
  return {
    weather_code: near.weather_code ?? null,
    cloud_cover_pct: num(a.cloud_cover_pct, b.cloud_cover_pct, t),
    cloud_cover_low_pct: num(a.cloud_cover_low_pct, b.cloud_cover_low_pct, t),
    cloud_cover_mid_pct: num(a.cloud_cover_mid_pct, b.cloud_cover_mid_pct, t),
    cloud_cover_high_pct: num(a.cloud_cover_high_pct, b.cloud_cover_high_pct, t),
    precipitation_mm: num(a.precipitation_mm, b.precipitation_mm, t),
    rain_mm: num(a.rain_mm, b.rain_mm, t),
    showers_mm: num(a.showers_mm, b.showers_mm, t),
    visibility_m: num(a.visibility_m, b.visibility_m, t),
    wind_speed_kmh: num(a.wind_speed_kmh, b.wind_speed_kmh, t),
    wind_direction_deg: dir,
    humidity_pct: num(a.humidity_pct, b.humidity_pct, t),
    interval_s: 3600,
  }
}

/** WMO rain intensity code for a rate: slight < 2.5 mm/h ≤ moderate < 7.6 mm/h ≤ heavy. */
function rainCode(rate: number): number {
  return rate >= 7.6 ? 65 : rate >= 2.5 ? 63 : 61
}

export function skyAtPosition(timeline: TimelineDay[], position: number, ctx: TimelineSkyContext): TimelineSky {
  const offset = offsetFor(ctx)
  if (timeline.length === 0) {
    const now = new Date()
    return { params: toSkyParams({ cloud_cover_pct: 20 }, { lat: ctx.lat, lon: ctx.lon, date: now }), source: 'none' }
  }
  const p = clamp(position, 0, timeline.length - 1 + 0.999)
  const i = Math.floor(p)
  const hour = (p - i) * 24
  const day = timeline[i]
  const date = localInstant(day.date, hour, offset)
  const skyCtx = { lat: ctx.lat, lon: ctx.lon, date }

  // Hourly forecast rows for this local hour (and the next, for blending).
  const rows = ctx.hourly
  if (rows && rows.length > 0) {
    const idx = hourIndex(rows)
    const h = Math.floor(hour)
    const ia = idx.get(`${day.date}T${pad(h)}`)
    if (ia != null) {
      const a = rows[ia]
      const b = rows[Math.min(ia + 1, rows.length - 1)]
      return { params: toSkyParams(blendHourly(a, b, hour - h), skyCtx), source: 'hourly' }
    }
  }

  const w = day.weather
  if (!w) return { params: toSkyParams({ cloud_cover_pct: 20 }, skyCtx), source: 'none' }
  const cloudPct = w.cloud_cover_mean_pct ?? clamp(0.15 + (1 - Math.exp(-(w.precipitation_mm ?? 0) / 10)) * 0.6) * 100
  const windMean = (w.wind_speed_max_kmh ?? 8) * 0.65
  if (w.kind === 'climatology') {
    // A multi-year average says nothing about rain or storms on this exact day.
    return {
      params: toSkyParams(
        { cloud_cover_pct: cloudPct, wind_speed_kmh: windMean, wind_direction_deg: w.wind_direction_dominant_deg ?? null, humidity_pct: w.humidity_mean_pct },
        skyCtx,
      ),
      source: 'climatology',
    }
  }
  const rate = rainRateAt(day, hour)
  const weather: WeatherLike = {
    weather_code: rate > 0 ? rainCode(rate) : null,
    cloud_cover_pct: rate > 0 ? Math.max(cloudPct, 85) : cloudPct,
    precipitation_mm: rate,
    rain_mm: rate,
    wind_speed_kmh: windMean,
    wind_direction_deg: w.wind_direction_dominant_deg ?? null,
    humidity_pct: w.humidity_mean_pct,
    interval_s: 3600,
  }
  return { params: toSkyParams(weather, skyCtx), source: 'daily' }
}

/**
 * Makes the 3D field's rain, cloud and wind agree with the sky. Hourly forecast data overrides the
 * daily estimate (including "no rain" for a dry forecast hour).
 */
export function applySkyToVisual(state: FieldVisualState, sky: TimelineSky): FieldVisualState {
  const p = sky.params
  if (sky.source === 'none') return state
  const rain = p.precipKind === 'snow' ? 0 : rainRateToIntensity(p.rainRateMmH)
  const cloud = clamp(Math.max(p.cloudLow, p.overcast, p.cloudMid * 0.7, p.cloudHigh * 0.35))
  return {
    ...state,
    cloudCover: cloud,
    rainIntensity: rain,
    windSpeedKmh: p.windSpeedKmh,
    windDirectionDeg: p.windDirectionDeg,
    groundWetness: Math.max(state.groundWetness ?? 0, rain > 0 ? clamp(0.5 + rain) : 0),
    weatherKind: sky.source === 'hourly' ? 'forecast' : state.weatherKind,
  }
}

/** A sky for callers that only have a visual state (no timeline/place): Thanjavur by default. */
export function skyFromVisualState(state: FieldVisualState, place = { lat: 10.79, lon: 79.14 }, date = new Date()): SkyParams {
  const local = new Date(date)
  const day = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`
  const rate = state.rainIntensity > 0 ? -6 * Math.log(1 - Math.min(0.99, (state.rainIntensity - 0.15) / 0.85)) : 0
  return toSkyParams(
    {
      weather_code: rate > 0 ? rainCode(rate) : null,
      cloud_cover_pct: state.cloudCover * 100,
      precipitation_mm: Math.max(0, rate),
      rain_mm: Math.max(0, rate),
      wind_speed_kmh: state.windSpeedKmh,
      wind_direction_deg: state.windDirectionDeg,
      humidity_pct: state.humidityPct ?? null,
      interval_s: 3600,
    },
    { ...place, date: localInstant(day, state.hourOfDay, offsetFor(place)) },
  )
}
