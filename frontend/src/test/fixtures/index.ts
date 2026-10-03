/**
 * SYNTHETIC DEVELOPMENT FIXTURES — not real weather, soil or crop data.
 * Used only by unit tests (MSW). Never import from application code.
 */
import type { Crop, CycleDetail, LandDetail, LandMetrics, NotificationOut, TimelineDay, UserOut } from '@/api/types'

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

const range = (d: string) => ({ earliest: d, expected: d, latest: d })

export const fixtureCrop: Crop = {
  slug: 'paddy',
  name: { en: 'Paddy (Rice)', ta: 'நெல்' },
  scientific_name: 'Oryza sativa',
  category: 'cereal',
  image_url: null,
  seasons: [],
  duration_days: [100, 150],
  water_requirement_mm: [1000, 1800],
  temp_optimal_c: [20, 35],
  ph_range: [5.5, 7.5],
  suitable_textures: ['clay'],
  methods: ['transplanting', 'direct_seeding_wet'],
  description: { en: 'Fixture crop', ta: 'Fixture crop' },
  references: [],
  varieties: [],
}

export const fixtureCycle: CycleDetail = {
  id: 'cycle-fixture',
  land_id: 'land-fixture',
  land_name: 'Fixture plot',
  crop: fixtureCrop,
  variety: null,
  status: 'active',
  method: 'transplanting',
  anchor_date: '2026-08-10',
  anchor_type: 'transplanting',
  nursery_sowing_date: '2026-07-20',
  irrigation_method: 'flood',
  water_availability: 'assured',
  planting_density: null,
  notes: null,
  stages: [],
  harvest_window: range('2026-11-20'),
  current: null,
  model: { name: 'fixture-model', version: '0', base_temp_c: 10, assumptions: [], missing_inputs: [], references: [] },
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

export const fixtureNotifications: NotificationOut[] = [
  { id: 'n1', title: 'Fixture plot: Scout for stem borer', body: 'Due 03 Oct', kind: 'task', link: null, read_at: null, created_at: '2026-10-02T08:00:00Z' },
  { id: 'n2', title: 'Fixture plot: Heavy rain expected', body: null, kind: 'alert', link: null, read_at: '2026-10-01T08:00:00Z', created_at: '2026-10-01T07:00:00Z' },
]
