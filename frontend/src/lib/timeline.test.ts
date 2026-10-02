import { describe, expect, it } from 'vitest'
import type { TimelineDay } from '@/api/types'
import { dateAtPosition, dayIndexForDate, hourLabel, rainToIntensity, rainWindow, stageMarkers, toGrowthStage, visualStateAt } from './timeline'

// Synthetic fixture — not real weather.
function day(
  i: number,
  stage: string,
  local: number,
  rain = 0,
  kind: 'observed' | 'forecast' | 'climatology' = 'forecast',
  rainHours: number | null = null,
): TimelineDay {
  return {
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    das: i,
    dat: null,
    stage_key: stage,
    stage_local_progress: local,
    cycle_progress: i / 10,
    gdd_cumulative: i * 18,
    weather: {
      tmin_c: 25,
      tmax_c: 34,
      precipitation_mm: rain,
      precipitation_hours: rainHours,
      wind_speed_max_kmh: 10 + i,
      wind_direction_dominant_deg: kind === 'climatology' ? null : 90,
      humidity_mean_pct: 70,
      cloud_cover_mean_pct: null,
      sunrise: null,
      sunset: null,
      kind,
    },
    tasks: [],
    events: local === 0 ? [{ type: 'stage_start', stage_key: stage }] : [],
    warnings: [],
  }
}

const tl: TimelineDay[] = [
  day(0, 'establishment', 0),
  day(1, 'establishment', 0.5),
  day(2, 'tillering', 0, 30),
  day(3, 'tillering', 0.5, 0, 'climatology'),
]

describe('visualStateAt', () => {
  it('is deterministic for the same position', () => {
    expect(visualStateAt(tl, 1.37)).toEqual(visualStateAt(tl, 1.37))
  })

  it('interpolates stage progress within a stage', () => {
    const s = visualStateAt(tl, 0.5)
    expect(s.stageKey).toBe('establishment')
    expect(s.stageProgress).toBeCloseTo(0.25)
    expect(s.hourOfDay).toBeCloseTo(12)
  })

  it('runs stage progress toward 1 before a stage change', () => {
    const s = visualStateAt(tl, 1.9)
    expect(s.stageKey).toBe('establishment')
    expect(s.stageProgress).toBeGreaterThan(0.9)
  })

  it('clamps out-of-range positions', () => {
    expect(visualStateAt(tl, -5).cycleProgress).toBe(0)
    expect(visualStateAt(tl, 99).stageKey).toBe('tillering')
  })

  it('labels the weather kind of the day', () => {
    expect(visualStateAt(tl, 3.2).weatherKind).toBe('climatology')
  })

  it('keeps paddy flooded during vegetative stages but not when rainfed', () => {
    expect(visualStateAt(tl, 2.2, { cropSlug: 'paddy', irrigationMethod: 'flood' }).standingWater).toBe(true)
    expect(visualStateAt(tl, 2.2, { cropSlug: 'paddy', irrigationMethod: 'rainfed' }).standingWater).toBe(false)
    expect(visualStateAt(tl, 2.2, { cropSlug: 'groundnut' }).standingWater).toBe(false)
  })

  it('returns a simulated default for an empty timeline', () => {
    expect(visualStateAt([], 3).weatherKind).toBe('simulated')
  })
})

describe('weather-driven rain', () => {
  // Synthetic days: a 4-hour 12 mm forecast shower, a wet climatology day, a 0.4 mm trace day.
  const wet: TimelineDay[] = [
    day(0, 'tillering', 0.1, 12, 'forecast', 4),
    day(1, 'tillering', 0.2, 0, 'forecast', 0),
    day(2, 'tillering', 0.3, 9, 'climatology'),
    day(3, 'tillering', 0.4, 0.4, 'observed', 1),
    day(4, 'tillering', 0.5, 6, 'observed'),
  ]
  const hours = Array.from({ length: 96 }, (_, k) => k / 4)

  it('rains only inside a deterministic window as long as precipitation_hours', () => {
    const win = rainWindow(wet[0])!
    expect(win.end - win.start).toBeCloseTo(4)
    expect(win.start).toBeGreaterThanOrEqual(0)
    expect(win.end).toBeLessThanOrEqual(24)
    expect(rainWindow(wet[0])).toEqual(win)
    for (const h of hours) {
      const r = visualStateAt(wet, h / 24).rainIntensity
      if (h < win.start || h > win.end) expect(r).toBe(0)
    }
    const mid = (win.start + win.end) / 2 / 24
    expect(visualStateAt(wet, mid).rainIntensity).toBeCloseTo(win.intensity)
  })

  it('never animates rain from climatology, however wet the average', () => {
    expect(rainWindow(wet[2])).toBeNull()
    for (const h of hours) expect(visualStateAt(wet, 2 + h / 24).rainIntensity).toBe(0)
    expect(visualStateAt(wet, 2.5).cloudCover).toBeGreaterThan(0.2)
  })

  it('ignores trace amounts and estimates duration when hours are missing', () => {
    expect(rainWindow(wet[3])).toBeNull()
    const est = rainWindow(wet[4])!
    expect(est.hours).toBe(2)
    expect(rainToIntensity(0.5)).toBe(0)
    expect(rainWindow(day(9, 'tillering', 0, 1.8, 'forecast', 8))).toBeNull()
  })

  it('keeps the ground wet for a while after the rain stops, then dries', () => {
    const win = rainWindow(wet[0])!
    const after = (h: number) => visualStateAt(wet, (win.end + h) / 24).groundWetness ?? 0
    expect(after(0.5)).toBeGreaterThan(0.5)
    expect(after(1)).toBeGreaterThan(after(6))
    expect(visualStateAt(wet, win.start / 24 - 0.05).groundWetness).toBe(0)
  })

  it('uses the dominant wind direction, interpolated along the short arc', () => {
    const s = visualStateAt(wet, 0.5)
    expect(s.windDirectionDeg).toBeCloseTo(90)
    expect(visualStateAt(wet, 2, { windDirectionDeg: 200 }).windDirectionDeg).toBeCloseTo(200)
    expect(visualStateAt(wet, 2.5, { windDirectionDeg: 200 }).windDirectionDeg).toBeCloseTo(145)
  })
})

describe('helpers', () => {
  it('maps unknown stage keys by alias or progress', () => {
    expect(toGrowthStage('heading')).toBe('flowering')
    expect(toGrowthStage('mystery', 0.95)).toBe('maturity')
    expect(toGrowthStage('tillering')).toBe('tillering')
  })

  it('finds date indices and markers', () => {
    expect(dayIndexForDate(tl, '2026-07-03')).toBe(2)
    expect(dayIndexForDate(tl, '2030-01-01')).toBe(3)
    expect(dateAtPosition(tl, 2.8)).toBe('2026-07-03')
    expect(stageMarkers(tl).map((m) => m.stageKey)).toEqual(['establishment', 'tillering'])
  })

  it('formats the hour of a fractional position', () => {
    expect(hourLabel(4.25)).toBe('06:00')
    expect(rainToIntensity(0)).toBe(0)
  })
})
