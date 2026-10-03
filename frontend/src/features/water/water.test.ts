import { describe, expect, it } from 'vitest'
import type { WaterKind, WaterSource } from '@/api/types'
import { countByKind, formatDistance, formatWaterArea, waterName } from './format'
import { waterToCollections, type WaterLabels } from './waterLayers'

const labels: WaterLabels = {
  kind: { river: 'River', canal: 'Canal', stream: 'Stream', drain: 'Drain', tank: 'Tank', pond: 'Pond', lake: 'Lake', well: 'Well' },
  unnamed: (k) => `Unnamed ${k}`,
  direction: (d) => `to the ${d}`,
  away: (d) => `${d} away`,
  adjoining: 'Touches your field',
  seasonal: 'Seasonal',
  openOsm: 'OSM',
}

// Synthetic sources (not real OSM data).
function src(id: string, kind: WaterKind, distance_m: number, geometry: WaterSource['geometry'], extra: Partial<WaterSource> = {}): WaterSource {
  return {
    id, osm_ids: [id], osm_url: `https://www.openstreetmap.org/${id}`, name: null, name_ta: null, kind, seasonal: false,
    distance_m, adjoining: false, bearing_deg: 90, direction: 'E', area_m2: null, length_in_radius_m: null,
    nearest_point: { lat: 10.001, lon: 79.001 }, field_point: { lat: 10, lon: 79 }, geometry, ...extra,
  }
}
const poly: WaterSource['geometry'] = { type: 'Polygon', coordinates: [[[79, 10], [79.1, 10], [79.1, 10.1], [79, 10]]] }
const line: WaterSource['geometry'] = { type: 'LineString', coordinates: [[79, 10], [79.1, 10.1]] }
const point: WaterSource['geometry'] = { type: 'Point', coordinates: [79.05, 10.05] }

describe('water formatting', () => {
  it('formats distances in m and km', () => {
    expect(formatDistance(0)).toBe('0 m')
    expect(formatDistance(57.8)).toBe('58 m')
    expect(formatDistance(1748)).toBe('1.7 km')
    expect(formatDistance(12400)).toBe('12 km')
  })
  it('formats areas in m² and ha', () => {
    expect(formatWaterArea(340)).toBe('340 m²')
    expect(formatWaterArea(21172)).toBe('2.1 ha')
  })
  it('prefers the Tamil name for Tamil and falls back otherwise', () => {
    expect(waterName({ name: 'Grand Anaicut Canal', name_ta: 'பெரிய ஆனைக்கட்டு கால்வாய்' }, 'ta')).toBe('பெரிய ஆனைக்கட்டு கால்வாய்')
    expect(waterName({ name: 'Grand Anaicut Canal', name_ta: 'பெரிய ஆனைக்கட்டு கால்வாய்' }, 'en')).toBe('Grand Anaicut Canal')
    expect(waterName({ name: null, name_ta: 'ஏரி' }, 'en')).toBe('ஏரி')
    expect(waterName({ name: null, name_ta: null }, 'en')).toBeNull()
  })
})

describe('waterToCollections', () => {
  const sources = [
    src('way/1', 'tank', 58, poly, { name: 'Sivagangai Tank', area_m2: 21000 }),
    src('way/2', 'pond', 260, poly),
    src('way/3', 'river', 1700, line, { seasonal: true }),
    src('way/4', 'river', 2000, line),
    src('node/5', 'well', 30, point),
    src('way/6', 'canal', 0, line, { adjoining: true }),
  ]
  const c = waterToCollections(sources, 'en', labels)

  it('splits by geometry type', () => {
    expect(c.areas.features.map((f) => f.properties.id)).toEqual(['way/1', 'way/2'])
    expect(c.lines.features.map((f) => f.properties.id)).toEqual(['way/3', 'way/4', 'way/6'])
    expect(c.points.features.map((f) => f.properties.id)).toEqual(['node/5'])
  })
  it('labels with name or localised unnamed kind, plus distance', () => {
    expect(c.areas.features[0].properties.label).toBe('Sivagangai Tank · 58 m')
    expect(c.areas.features[1].properties.label).toBe('Unnamed Pond · 260 m')
    expect(c.lines.features[2].properties.label).toContain('Touches your field')
  })
  it('draws one dashed link per kind (nearest only) and none for adjoining sources', () => {
    const kinds = c.links.features.map((f) => f.properties.kind).sort()
    expect(kinds).toEqual(['pond', 'river', 'tank', 'well'])
    expect(c.links.features.find((f) => f.properties.kind === 'river')?.properties.distance_m).toBe(1700)
    expect(c.links.features[0].geometry.type).toBe('LineString')
  })
  it('carries the seasonal flag for dashed styling', () => {
    expect(c.lines.features[0].properties.seasonal).toBe(true)
  })
  it('counts by kind', () => {
    expect(countByKind(sources)).toEqual({ tank: 1, pond: 1, river: 2, well: 1, canal: 1 })
  })
})
