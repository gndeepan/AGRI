import { describe, expect, it } from 'vitest'
import { fogForVisibility, precipKindForCode, toSkyParams } from './params'
import { fallbackGradient, lightProbe, skyPalette } from './palette'
import { activeEvent, boltSegments, eventInSlot, flashEnvelope, MAX_SCREEN_FLASH, SLOT_S } from './lightning'
import { PRESETS, presetParams } from './presets'

const ctx = (h: number) => ({ lat: 10.79, lon: 79.14, date: new Date(Date.UTC(2026, 9, 2, h - 5, -30)) })

describe('toSkyParams (synthetic weather)', () => {
  it('maps WMO codes to precipitation kinds', () => {
    expect(precipKindForCode(0)).toBe('none')
    expect(precipKindForCode(53)).toBe('drizzle')
    expect(precipKindForCode(63)).toBe('rain')
    expect(precipKindForCode(81)).toBe('showers')
    expect(precipKindForCode(95)).toBe('rain')
    expect(precipKindForCode(null)).toBe('none')
  })

  it('is deterministic', () => {
    const w = { weather_code: 63, rain_mm: 4, cloud_cover_pct: 100, wind_speed_kmh: 12, wind_direction_deg: 90 }
    expect(toSkyParams(w, ctx(15))).toEqual(toSkyParams(w, ctx(15)))
  })

  it('shows thunder only for codes 95, 96 and 99', () => {
    for (let code = 0; code <= 99; code++) {
      const p = toSkyParams({ weather_code: code, rain_mm: 20, showers_mm: 20, cloud_cover_low_pct: 100 }, ctx(15))
      expect(p.thunder).toBe([95, 96, 99].includes(code) ? 1 : 0)
    }
  })

  it('has no rain without precipitation data or a rain code', () => {
    const p = toSkyParams({ weather_code: 3, cloud_cover_pct: 100, precipitation_mm: 0 }, ctx(12))
    expect(p.rainIntensity).toBe(0)
    expect(p.wetness).toBe(0)
    expect(p.overcast).toBeGreaterThan(0.5)
  })

  it('normalises the 15-minute current sum to mm/h', () => {
    const p = toSkyParams({ weather_code: 63, rain_mm: 1, interval_s: 900 }, ctx(12))
    expect(p.rainRateMmH).toBe(4)
  })

  it('derives fog from visibility', () => {
    expect(fogForVisibility(20000)).toBe(0)
    expect(fogForVisibility(5000)).toBe(0)
    expect(fogForVisibility(2000)).toBeGreaterThan(0.3)
    expect(fogForVisibility(300)).toBeGreaterThan(0.9)
    expect(fogForVisibility(null)).toBe(0)
  })

  it('knows day from night by sun elevation', () => {
    const noon = toSkyParams({}, ctx(12))
    expect(noon.sunElevation).toBeGreaterThan(0.8)
    expect(noon.sunElevation).toBeLessThan(Math.PI / 2)
    // Morning sun is in the east (compass bearing between 0 and 180 degrees).
    const morning = toSkyParams({}, ctx(8))
    expect(morning.sunAzimuth).toBeGreaterThan(0)
    expect(morning.sunAzimuth).toBeLessThan(Math.PI)
    expect(toSkyParams({}, ctx(23)).sunElevation).toBeLessThan(-0.3)
    expect(skyPalette(toSkyParams({}, ctx(12))).daylight).toBe(1)
    expect(skyPalette(toSkyParams({}, ctx(23))).daylight).toBe(0)
  })

  it('leaves droplets on the glass after recent rain', () => {
    const p = toSkyParams({ weather_code: 2 }, { ...ctx(12), recentRainMm: 3 })
    expect(p.rainIntensity).toBe(0)
    expect(p.wetness).toBeGreaterThan(0)
  })
})

describe('palette and light probe', () => {
  it('produces a gradient and sane lighting for every preset', () => {
    for (const preset of PRESETS) {
      const p = presetParams(preset.key)
      expect(fallbackGradient(p)).toMatch(/^linear-gradient/)
      const probe = lightProbe(p)
      expect(probe.keyIntensity).toBeGreaterThanOrEqual(0)
      expect(probe.keyIntensity).toBeLessThanOrEqual(1)
      expect(Math.hypot(...probe.keyDirection)).toBeCloseTo(1, 3)
    }
  })

  it('makes a storm darker than a clear day and night darker still', () => {
    const key = (k: string) => lightProbe(presetParams(k)).keyIntensity
    expect(key('clear-day')).toBeGreaterThan(key('thunderstorm'))
    expect(key('thunderstorm')).toBeGreaterThan(key('rainy-night'))
    expect(key('thunderstorm')).toBeLessThan(0.5)
  })
})

describe('lightning', () => {
  it('never fires without thunder', () => {
    for (let s = 0; s < 500; s++) expect(eventInSlot(0.42, 0, s)).toBeNull()
  })

  it('is deterministic and limited to one event per slot (photosensitivity)', () => {
    let events = 0
    for (let s = 0; s < 400; s++) {
      const e = eventInSlot(0.42, 1, s)
      expect(e).toEqual(eventInSlot(0.42, 1, s))
      if (e) {
        events++
        expect(e.t0).toBeGreaterThanOrEqual(s * SLOT_S)
        expect(e.t0 + 0.6).toBeLessThanOrEqual((s + 1) * SLOT_S + 1e-9)
      }
    }
    expect(events).toBeGreaterThan(100)
    expect(events).toBeLessThan(300)
    expect(SLOT_S).toBeGreaterThanOrEqual(1)
    expect(MAX_SCREEN_FLASH).toBeLessThanOrEqual(0.35)
  })

  it('has a bounded flash envelope and a bolt that reaches the ground', () => {
    let e = null
    for (let s = 0; s < 50 && !e; s++) e = eventInSlot(0.7, 1, s)
    expect(e).not.toBeNull()
    expect(activeEvent(0.7, 1, e!.t0 + 0.01)).toEqual(e)
    for (let dt = 0; dt < 0.7; dt += 0.01) {
      const v = flashEnvelope(e!, e!.t0 + dt)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    const segs = boltSegments(e!)
    expect(segs.length).toBeGreaterThan(100)
    expect(Math.min(...segs.map((s) => s.y2))).toBeLessThan(0.05)
    expect(boltSegments(e!)).toEqual(segs)
  })
})
