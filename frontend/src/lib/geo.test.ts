import { describe, expect, it } from 'vitest'
import type { Polygon } from 'geojson'
import { isSelfIntersecting, normalizeRing, previewMetrics } from './geo'

// Synthetic ~100 m × 100 m square near Thanjavur (not a real field).
const d = 100 / 111_320
const lat = 10.787
const dLon = d / Math.cos((lat * Math.PI) / 180)
const square: Polygon = {
  type: 'Polygon',
  coordinates: [[[79.138, lat], [79.138 + dLon, lat], [79.138 + dLon, lat + d], [79.138, lat + d], [79.138, lat]]],
}

describe('previewMetrics', () => {
  it('computes ~1 ha for a 100 m square with geodesic area', () => {
    const m = previewMetrics(square)!
    expect(m.area_m2).toBeGreaterThan(9_900)
    expect(m.area_m2).toBeLessThan(10_100)
    expect(m.area_acres).toBeCloseTo(m.area_m2 / 4046.8564224, 6)
    expect(m.perimeter_m).toBeGreaterThan(395)
    expect(m.perimeter_m).toBeLessThan(405)
    expect(m.vertex_count).toBe(4)
  })

  it('closes open rings and drops duplicates', () => {
    expect(normalizeRing([[0, 0], [1, 0], [1, 0], [1, 1]])).toEqual([[0, 0], [1, 0], [1, 1], [0, 0]])
  })

  it('returns null for degenerate polygons', () => {
    expect(previewMetrics({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] })).toBeNull()
  })

  it('detects a bow-tie as self-intersecting', () => {
    const bowtie: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] }
    expect(isSelfIntersecting(bowtie)).toBe(true)
    expect(isSelfIntersecting(square)).toBe(false)
  })
})
