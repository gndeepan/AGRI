/**
 * SYNTHETIC DEVELOPMENT FIXTURES — not real weather, soil or crop data.
 * Used only by unit tests (MSW). Never import from application code.
 */
import type { LandDetail, LandMetrics, TimelineDay, UserOut } from '@/api/types'

export const fixtureUser: UserOut = {
  id: 'u-fixture',
  email: 'fixture.farmer@example.test',
  full_name: 'Fixture Farmer',
  role: 'farmer',
  email_verified: true,
  preferences: { language: 'en', region: 'Thanjavur', area_unit: 'acre', timezone: 'Asia/Kolkata' },
  created_at: '2026-01-01T00:00:00Z',
}

export const fixtureMetrics: LandMetrics = {
  area_m2: 8093.71,
  area_ha: 0.809371,
  area_acres: 2.0,
  perimeter_m: 360.2,
  centroid: { lat: 10.787, lon: 79.138 },
  representative_point: { lat: 10.787, lon: 79.138 },
  bbox: [79.137, 10.786, 79.139, 10.788],
  vertex_count: 4,
}

export const fixtureLand: LandDetail = {
  id: 'land-fixture',
  name: 'Fixture plot',
  metrics: fixtureMetrics,
  boundary: {
    type: 'Polygon',
    coordinates: [[[79.137, 10.786], [79.139, 10.786], [79.139, 10.788], [79.137, 10.788], [79.137, 10.786]]],
  },
  active_cycle: null,
  updated_at: '2026-06-01T00:00:00Z',
  notes: null,
  village: null,
  district: 'Thanjavur',
  state: 'Tamil Nadu',
  terrain: null,
  boundary_disclaimer: 'Representative boundary drawn by the user; not a legal survey.',
  created_at: '2026-06-01T00:00:00Z',
}

export function fixtureTimeline(days = 10): TimelineDay[] {
  return Array.from({ length: days }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    das: i,
    dat: null,
    stage_key: i < 5 ? 'establishment' : 'tillering',
    stage_local_progress: i < 5 ? i / 5 : (i - 5) / 5,
    cycle_progress: i / days,
    gdd_cumulative: i * 18,
    weather: null,
    tasks: [],
    events: i === 0 || i === 5 ? [{ type: 'stage_start' as const, stage_key: i < 5 ? 'establishment' : 'tillering' }] : [],
    warnings: [],
  }))
}
