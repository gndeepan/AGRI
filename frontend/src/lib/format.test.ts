import { describe, expect, it } from 'vitest'
import { formatArea, formatCoord, formatMeters, windDirLabel } from './format'

describe('format', () => {
  it('formats area in the preferred unit', () => {
    expect(formatArea({ area_acres: 2.4711, area_ha: 1 }, 'acre')).toBe('2.47 ac')
    expect(formatArea({ area_acres: 2.4711, area_ha: 1 }, 'hectare')).toBe('1 ha')
    expect(formatArea({ area_acres: 24.711, area_ha: 10 }, 'acre')).toBe('24.7 ac')
    expect(formatArea({ area_acres: 1, area_ha: 0.4 }, 'acre', 'ta')).toContain('ஏக்கர்')
  })
  it('formats perimeter and coordinates', () => {
    expect(formatMeters(845.3)).toBe('845 m')
    expect(formatMeters(1250)).toBe('1.25 km')
    expect(formatCoord(10.7905, 'lat')).toBe('10.79050° N')
    expect(formatCoord(-0.5, 'lon')).toBe('0.50000° W')
  })
  it('labels wind direction', () => {
    expect(windDirLabel(225)).toBe('SW')
    expect(windDirLabel(359)).toBe('N')
    expect(windDirLabel(-90)).toBe('W')
  })
})
