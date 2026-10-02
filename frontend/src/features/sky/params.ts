import * as SunCalc from 'suncalc'

/**
 * Maps Open-Meteo weather (current or one hourly row) plus place and time to the inputs of the
 * sky renderer. Pure and deterministic: the same weather, place and instant always give the same sky.
 * Every visual element is traceable to a data field; nothing is invented (lightning only for
 * WMO thunderstorm codes 95/96/99).
 */

export type PrecipKind = 'none' | 'drizzle' | 'rain' | 'showers' | 'snow'

export interface SkyParams {
  /** Sun position in radians; azimuth is a compass bearing (clockwise from north). */
  sunAzimuth: number
  sunElevation: number
  moonAzimuth: number
  moonElevation: number
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
  moonPhase: number
  /** Cloud cover per layer, 0..1. */
  cloudLow: number
  cloudMid: number
  cloudHigh: number
  /** 0..1 flat grey stratiform dome (overcast, drizzle, fog). */
  overcast: number
  /** 0..1 towering convective cloud (showers, thunderstorms). */
  convective: number
  precipKind: PrecipKind
  /** Liquid precipitation rate in mm/h (rain + showers, normalised to one hour). */
  rainRateMmH: number
  /** 0..1 visual intensity derived from the rate. */
  rainIntensity: number
  /** 0..1, only > 0 for WMO thunderstorm codes. */
  thunder: number
  windSpeedKmh: number
  /** Meteorological "from" direction, degrees. */
  windDirectionDeg: number
  /** 0..1 fog density from visibility (and WMO fog codes). */
  fog: number
  /** 0..1 low-lying mist: humid, calm air around dawn/dusk. */
  mist: number
  /** 0..1 water on the glass (raining now, or droplets left from recent rain). */
  wetness: number
  /** Deterministic seed for noise/lightning (derived from the hour). */
  seed: number
  weatherCode: number | null
}

/** The subset of a WeatherCurrent / WeatherHourly row this module reads. */
export interface WeatherLike {
  weather_code?: number | null
  cloud_cover_pct?: number | null
  cloud_cover_low_pct?: number | null
  cloud_cover_mid_pct?: number | null
  cloud_cover_high_pct?: number | null
  precipitation_mm?: number | null
  rain_mm?: number | null
  showers_mm?: number | null
  snowfall_cm?: number | null
  visibility_m?: number | null
  wind_speed_kmh?: number | null
  wind_direction_deg?: number | null
  humidity_pct?: number | null
  /** Seconds covered by the precipitation sums: 900 for Open-Meteo "current", 3600 for hourly. */
  interval_s?: number | null
}

export interface SkyContext {
  lat: number
  lon: number
  date: Date
  /** mm of rain in the previous few hours — leaves droplets on the glass after rain stops. */
  recentRainMm?: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const pct = (v: number | null | undefined) => (v == null ? null : clamp01(v / 100))
const RAD = Math.PI / 180

/** Typical rates implied by a WMO code, used only when the model reports a code but no amount. */
const CODE_RATE: Record<number, number> = {
  51: 0.2, 53: 0.5, 55: 1, 56: 0.3, 57: 1,
  61: 1.5, 63: 4, 65: 10, 66: 1.5, 67: 6,
  80: 2, 81: 6, 82: 15,
  95: 6, 96: 10, 99: 15,
}

export function precipKindForCode(code: number | null | undefined): PrecipKind {
  if (code == null) return 'none'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 95 && code <= 99)) return 'rain'
  if (code >= 80 && code <= 82) return 'showers'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  return 'none'
}

/** Visual intensity: drizzle ≈ 0.1, moderate rain (4 mm/h) ≈ 0.55, heavy (≥ 15 mm/h) → ~0.95. */
export function rainIntensityForRate(rateMmH: number): number {
  if (rateMmH <= 0) return 0
  return clamp01(1 - Math.exp(-rateMmH / 5))
}

/** Fog from visibility: none at ≥ 5 km, dense below ~0.5 km. */
export function fogForVisibility(visibilityM: number | null | undefined): number {
  if (visibilityM == null) return 0
  const km = visibilityM / 1000
  if (km >= 5) return 0
  return clamp01((5 - km) / 4.5) ** 1.3
}

function hourSeed(date: Date, lat: number, lon: number): number {
  const hour = Math.floor(date.getTime() / 3_600_000)
  let h = (hour * 374761393 + Math.round(lat * 1000) * 668265263 + Math.round(lon * 1000) * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function toSkyParams(w: WeatherLike, ctx: SkyContext): SkyParams {
  const code = w.weather_code ?? null
  const sun = SunCalc.getPosition(ctx.date, ctx.lat, ctx.lon)
  const moon = SunCalc.getMoonPosition(ctx.date, ctx.lat, ctx.lon)
  const illum = SunCalc.getMoonIllumination(ctx.date)

  // Precipitation: Open-Meteo sums cover `interval_s`; normalise to mm/h.
  const hours = (w.interval_s ?? 3600) / 3600 || 1
  const liquid = (w.rain_mm ?? 0) + (w.showers_mm ?? 0)
  const measured = (liquid > 0 ? liquid : (w.precipitation_mm ?? 0)) / hours
  let kind = precipKindForCode(code)
  if (kind === 'none' && measured > 0.05) kind = (w.showers_mm ?? 0) > (w.rain_mm ?? 0) ? 'showers' : 'rain'
  const rate = kind === 'none' || kind === 'snow' ? 0 : measured > 0 ? measured : (CODE_RATE[code ?? -1] ?? 0)

  // Cloud layers: prefer the model's low/mid/high split; otherwise apportion total cover.
  const total = pct(w.cloud_cover_pct) ?? (code != null && code >= 3 ? 0.9 : code === 2 ? 0.5 : code === 1 ? 0.2 : 0)
  let low = pct(w.cloud_cover_low_pct) ?? total * 0.7
  let mid = pct(w.cloud_cover_mid_pct) ?? total * 0.45
  const high = pct(w.cloud_cover_high_pct) ?? total * 0.3
  if (kind !== 'none') low = Math.max(low, 0.65 + rate * 0.02)
  if (code === 3) low = Math.max(low, 0.85)

  const thunder = code === 95 || code === 96 || code === 99 ? 1 : 0
  const convective = thunder ? 1 : kind === 'showers' ? clamp01(0.45 + rate / 20) : 0
  if (convective > 0) mid = Math.max(mid, 0.5)
  const stratiform = code === 3 || code === 45 || code === 48 || kind === 'drizzle' || (kind === 'rain' && !thunder)
  const overcast = stratiform ? clamp01((low - 0.55) / 0.35) : 0

  let fog = fogForVisibility(w.visibility_m)
  if (code === 45 || code === 48) fog = Math.max(fog, 0.7)

  // suncalc 2.x reports degrees, azimuth clockwise from north.
  const elevDeg = sun.altitude
  const humid = (w.humidity_pct ?? 0) >= 88
  const calm = (w.wind_speed_kmh ?? 99) < 8
  const lowSun = elevDeg > -8 && elevDeg < 12
  const mist = humid && calm && lowSun && kind === 'none' ? clamp01(((w.humidity_pct ?? 0) - 88) / 10) * 0.6 : 0

  const rainIntensity = rainIntensityForRate(rate)
  const recent = ctx.recentRainMm ?? 0
  const wetness = rainIntensity > 0 ? clamp01(0.35 + rainIntensity) : recent > 0.2 ? clamp01(0.15 + recent / 20) : 0

  return {
    sunAzimuth: sun.azimuth * RAD,
    sunElevation: sun.altitude * RAD,
    moonAzimuth: moon.azimuth * RAD,
    moonElevation: moon.altitude * RAD,
    moonPhase: illum.phase,
    cloudLow: clamp01(low),
    cloudMid: clamp01(mid),
    cloudHigh: clamp01(high),
    overcast,
    convective,
    precipKind: kind,
    rainRateMmH: Math.round(rate * 100) / 100,
    rainIntensity,
    thunder,
    windSpeedKmh: w.wind_speed_kmh ?? 0,
    windDirectionDeg: w.wind_direction_deg ?? 225,
    fog,
    mist,
    wetness,
    seed: hourSeed(ctx.date, ctx.lat, ctx.lon),
    weatherCode: code,
  }
}
