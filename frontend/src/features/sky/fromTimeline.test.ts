import { describe, expect, it } from 'vitest'
import type { TimelineDay, WeatherHourly } from '@/api/types'
import { rainWindow, visualStateAt } from '@/lib/timeline'
import { applySkyToVisual, localInstant, skyAtPosition } from './fromTimeline'

// Synthetic fixtures — not real weather.
const PLACE = { lat: 10.79, lon: 79.14, utcOffsetSeconds: 19800 }

function day(i: number, kind: 'observed' | 'forecast' | 'climatology', rain = 0, cloud: number | null = 40): TimelineDay {
  return {
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    das: i, dat: null, stage_key: 'tillering', stage_local_progress: i / 10, cycle_progress: i / 20, gdd_cumulative: i * 18,
    weather: {
      tmin_c: 24, tmax_c: 33, precipitation_mm: rain, precipitation_hours: rain > 0 ? 4 : 0,
      wind_speed_max_kmh: 20, wind_direction_dominant_deg: 45, humidity_mean_pct: 75, cloud_cover_mean_pct: cloud,
      sunrise: null, sunset: null, kind,
    },
    tasks: [], events: [], warnings: [],
  }
}

function hourRow(time: string, over: Partial<WeatherHourly> = {}): WeatherHourly {
  return {
    time, temperature_c: 30, precipitation_mm: 0, precipitation_probability_pct: 10, wind_speed_kmh: 10, cloud_cover_pct: 20,
    humidity_pct: 70, weather_code: 1, visibility_m: 20000, rain_mm: 0, showers_mm: 0, cloud_cover_low_pct: 10,
    cloud_cover_mid_pct: 5, cloud_cover_high_pct: 5, wind_direction_deg: 90, wind_gusts_kmh: 20, is_day: true, ...over,
  }
}

const timeline = [day(0, 'observed', 12), day(1, 'forecast', 0, 30), day(2, 'climatology', 9, 70)]

describe('skyAtPosition', () => {
  it('is deterministic for the same position', () => {
    expect(skyAtPosition(timeline, 1.5, PLACE)).toEqual(skyAtPosition(timeline, 1.5, PLACE))
  })

  it('converts local field time to the right instant (IST)', () => {
    expect(localInstant('2026-10-02', 12, 19800).toISOString()).toBe('2026-10-02T06:30:00.000Z')
    // Local noon: the sun is high; local midnight: below the horizon.
    expect(skyAtPosition(timeline, 1.5, PLACE).params.sunElevation).toBeGreaterThan(0.9)
    expect(skyAtPosition(timeline, 1.0, PLACE).params.sunElevation).toBeLessThan(0)
  })

  it('rains only inside the daily rain window on observed days, and never thunders from daily data', () => {
    const win = rainWindow(timeline[0])!
    const inside = skyAtPosition(timeline, (win.start + win.end) / 2 / 24, PLACE)
    const outside = skyAtPosition(timeline, ((win.end + 1) % 24) / 24, PLACE)
    expect(inside.source).toBe('daily')
    expect(inside.params.rainRateMmH).toBeCloseTo(12 / 4, 1)
    expect(inside.params.thunder).toBe(0)
    expect(outside.params.rainRateMmH).toBe(0)
  })

  it('climatology days get cloud but no rain or lightning', () => {
    for (let h = 0; h < 24; h++) {
      const s = skyAtPosition(timeline, 2 + h / 24, PLACE)
      expect(s.source).toBe('climatology')
      expect(s.params.rainRateMmH).toBe(0)
      expect(s.params.thunder).toBe(0)
    }
  })

  it('uses the hourly forecast where it covers the hour, including thunderstorms', () => {
    const hourly = [
      hourRow('2026-10-02T15:00', { weather_code: 95, rain_mm: 8, precipitation_mm: 8, cloud_cover_low_pct: 90 }),
      hourRow('2026-10-02T16:00', { weather_code: 3, cloud_cover_low_pct: 95 }),
    ]
    const storm = skyAtPosition(timeline, 1 + 15.2 / 24, { ...PLACE, hourly })
    expect(storm.source).toBe('hourly')
    expect(storm.params.thunder).toBe(1)
    expect(storm.params.rainRateMmH).toBeGreaterThan(5)
    // Outside the hourly rows the daily row is used again.
    expect(skyAtPosition(timeline, 1 + 9 / 24, { ...PLACE, hourly }).source).toBe('daily')
  })

  it('applySkyToVisual makes the 3D rain follow the sky', () => {
    const hourly = [hourRow('2026-10-02T10:00'), hourRow('2026-10-02T11:00')]
    const pos = 1 + 10.5 / 24
    const dry = applySkyToVisual(visualStateAt(timeline, pos), skyAtPosition(timeline, pos, { ...PLACE, hourly }))
    expect(dry.rainIntensity).toBe(0)
    expect(dry.weatherKind).toBe('forecast')
    const wetHourly = [hourRow('2026-10-02T10:00', { weather_code: 63, rain_mm: 4 }), hourRow('2026-10-02T11:00', { weather_code: 63, rain_mm: 4 })]
    const wet = applySkyToVisual(visualStateAt(timeline, pos), skyAtPosition(timeline, pos, { ...PLACE, hourly: wetHourly }))
    expect(wet.rainIntensity).toBeGreaterThan(0.4)
    expect(wet.groundWetness).toBeGreaterThan(0.5)
  })
})
