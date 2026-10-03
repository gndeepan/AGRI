import { describe, expect, it } from 'vitest'
import { CYCLE_MS, cropAt, seamAt, seasonAt, stageIndex } from './season'
import { degrade, pickTier } from './login3d/tier'
import { applySeason, createUniforms, sunAt } from './login3d/scene'

describe('season clock', () => {
  it('stays within 0..1 and wraps', () => {
    for (const ms of [0, 1, CYCLE_MS / 3, CYCLE_MS - 1, CYCLE_MS * 7 + 123]) {
      const s = seasonAt(performance.now() + ms)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(1)
    }
  })

  it('maps season position to the four captioned stages in order', () => {
    expect([0, 0.3, 0.6, 0.95].map(stageIndex)).toEqual([0, 1, 2, 3])
  })

  it('is deterministic and ripens: water drains, grain heads grow, crop turns golden', () => {
    expect(cropAt(0.4)).toEqual(cropAt(0.4))
    const early = cropAt(0.05)
    const late = cropAt(0.88)
    expect(late.water).toBeLessThan(early.water)
    expect(late.panicle).toBeGreaterThan(early.panicle)
    expect(late.leaf[0]).toBeGreaterThan(early.leaf[0])
  })

  it('fades the crop only around the loop seam', () => {
    expect(seamAt(0.5)).toBe(1)
    expect(seamAt(0.0)).toBe(0)
    expect(seamAt(0.995)).toBeLessThan(0.5)
  })
})

describe('login scene tiers', () => {
  it('picks conservative tiers for phones and weak CPUs', () => {
    expect(pickTier({ mobile: true, cores: 8 })).toBe('low')
    expect(pickTier({ cores: 4 })).toBe('low')
    expect(pickTier({ cores: 10, dpr: 2 })).toBe('high')
    expect(pickTier({ cores: 6 })).toBe('mid')
  })
  it('degrades one step at a time down to low', () => {
    expect(degrade('high')).toBe('mid')
    expect(degrade('mid')).toBe('low')
    expect(degrade('low')).toBe('low')
  })
})

describe('login scene lighting', () => {
  it('keeps the sun between golden hour and late morning, ahead of the camera', () => {
    for (let i = 0; i <= 20; i++) {
      const sun = sunAt(i / 20)
      expect(sun.elevationDeg).toBeGreaterThanOrEqual(8.9)
      expect(sun.elevationDeg).toBeLessThanOrEqual(25.1)
      expect(sun.dir.z).toBeLessThan(0)
    }
  })
  it('writes the same uniforms for the same season', () => {
    const a = createUniforms()
    const b = createUniforms()
    applySeason(a, 0.62)
    applySeason(b, 0.62)
    expect(a.uSunColor.value.toArray()).toEqual(b.uSunColor.value.toArray())
    expect(a.uGrow.value).toBe(b.uGrow.value)
  })
})
