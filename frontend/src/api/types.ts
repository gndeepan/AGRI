// Mirrors docs/ARCHITECTURE.md §4. Keep in sync with the backend contract.
import type { Polygon } from 'geojson'

export type DataKind =
  | 'observed'
  | 'forecast'
  | 'climatology'
  | 'modelled'
  | 'user_entered'
  | 'simulated'
  | 'model_output'
  | 'estimate'

export interface Provenance {
  provider: string
  dataset: string
  kind: DataKind
  retrieved_at: string
  resolution?: string | null
  license?: string | null
  attribution?: string | null
  cache_status: 'fresh' | 'cached' | 'stale'
  notes?: string[]
}

export interface LatLon {
  lat: number
  lon: number
}

export type Language = 'en' | 'ta'
export type AreaUnit = 'acre' | 'hectare'

export interface UserPreferences {
  language: Language
  region: string | null
  area_unit: AreaUnit
  timezone: string
}

export interface UserOut {
  id: string
  email: string
  full_name: string
  role: 'farmer' | 'admin'
  email_verified: boolean
  preferences: UserPreferences
  created_at: string
}

export interface LandMetrics {
  area_m2: number
  area_ha: number
  area_acres: number
  perimeter_m: number
  centroid: LatLon
  representative_point: LatLon
  bbox: [number, number, number, number]
  vertex_count: number
}

export interface ActiveCycleRef {
  id: string
  crop_name: string
  stage_key: string | null
  stage_name: string | null
}

export interface LandSummary {
  id: string
  name: string
  metrics: LandMetrics
  boundary: Polygon
  active_cycle: ActiveCycleRef | null
  updated_at: string
}

export interface Terrain {
  elevation_m: number | null
  slope_deg: number | null
  relief_m: number | null
  provenance: Provenance
}

export interface LandDetail extends LandSummary {
  notes: string | null
  village: string | null
  district: string | null
  state: string | null
  terrain: Terrain | null
  boundary_disclaimer: string
  created_at: string
}

export interface GeoSearchResult {
  name: string | null
  display_name: string | null
  lat: number
  lon: number
  bbox?: [number, number, number, number] | null
  kind: string
}

export interface ReverseGeo {
  village: string | null
  district: string | null
  state: string | null
  display_name: string | null
}

export interface WeatherCurrent {
  time: string
  temperature_c: number
  feels_like_c: number
  humidity_pct: number
  precipitation_mm: number
  cloud_cover_pct: number
  wind_speed_kmh: number
  wind_direction_deg: number
  wind_gusts_kmh: number
  pressure_hpa: number
  is_day: boolean
  weather_code: number
  /** Added for the live sky; optional because older cached bundles may lack them. */
  /** Seconds covered by the precipitation sums (Open-Meteo current: 900). */
  interval_s?: number | null
  visibility_m?: number | null
  rain_mm?: number | null
  showers_mm?: number | null
  snowfall_cm?: number | null
  cloud_cover_low_pct?: number | null
  cloud_cover_mid_pct?: number | null
  cloud_cover_high_pct?: number | null
}

export type WeatherDayKind = 'observed' | 'forecast' | 'climatology'

export interface WeatherDaily {
  date: string
  tmin_c: number
  tmax_c: number
  tmean_c: number
  precipitation_mm: number
  precipitation_probability_pct: number | null
  wind_speed_max_kmh: number
  wind_gusts_max_kmh: number
  wind_direction_dominant_deg: number
  humidity_mean_pct: number | null
  sunrise: string | null
  sunset: string | null
  weather_code: number | null
  et0_mm: number | null
  cloud_cover_mean_pct?: number | null
  kind: WeatherDayKind
}

export interface WeatherHourly {
  time: string
  temperature_c: number
  precipitation_mm: number
  precipitation_probability_pct: number
  wind_speed_kmh: number
  cloud_cover_pct: number
  humidity_pct: number
  weather_code?: number | null
  visibility_m?: number | null
  rain_mm?: number | null
  showers_mm?: number | null
  cloud_cover_low_pct?: number | null
  cloud_cover_mid_pct?: number | null
  cloud_cover_high_pct?: number | null
  wind_direction_deg?: number | null
  wind_gusts_kmh?: number | null
  is_day?: boolean | null
}

export interface Alert {
  id: string
  severity: 'info' | 'watch' | 'warning'
  title: string
  message: string
  starts: string
  ends: string | null
  source: string
  kind: DataKind
  land_id?: string
  land_name?: string
}

export interface WeatherBundle {
  location: LatLon
  timezone: string
  /** Offset of the field's local time from UTC; hourly/current times are local wall-clock strings. */
  utc_offset_seconds?: number
  current: WeatherCurrent
  hourly: WeatherHourly[]
  daily: WeatherDaily[]
  alerts: Alert[]
  provenance: Provenance
}

export interface SoilLayer {
  depth: '0-5cm' | '5-15cm' | '15-30cm'
  sand_pct: number | null
  silt_pct: number | null
  clay_pct: number | null
  ph: number | null
  soc_g_per_kg: number | null
  cec_cmol_per_kg: number | null
  bulk_density: number | null
}

export interface SoilTest {
  id: string
  sample_date: string
  lab_name: string | null
  ph: number | null
  ec_ds_m: number | null
  organic_carbon_pct: number | null
  n_kg_ha: number | null
  p_kg_ha: number | null
  k_kg_ha: number | null
  texture: string | null
  notes: string | null
  created_at: string
}

export interface SoilProfile {
  texture_class: string | null
  layers: SoilLayer[]
  drainage_hint: string | null
  irrigation_suitability: string | null
  limitations: string[]
  provenance: Provenance
  soil_tests: SoilTest[]
}

export type SoilTestInput = Omit<SoilTest, 'id' | 'created_at'>

export interface I18nText {
  en: string
  ta: string
}

export interface Ref {
  title: string
  publisher: string
  url: string
}

export interface Season {
  key: 'kuruvai' | 'samba' | 'thaladi' | 'navarai' | 'kharif' | 'rabi' | 'summer'
  name: I18nText
  sowing_window: { start: string; end: string }
}

export type VarietyGroup = 'tn' | 'kerala' | 'national' | 'traditional' | 'custom'

export interface Variety {
  id: string
  name: string
  duration_days: number
  duration_range: [number, number]
  duration_group: 'short' | 'medium' | 'long'
  seasons: string[]
  notes: string | null
  reference: Ref | null
  aliases: string[]
  grain_type: string | null
  group: VarietyGroup | null
  institute: string | null
  release_year: number | null
  regions: string[]
  seasons_text: string | null
  verified: boolean
  source: 'catalog' | 'user' | 'ai_suggested'
  is_custom: boolean
}

export interface ImageCredit {
  author: string
  license: string
  source_url: string
  title: string
}

export interface VarietySuggestion {
  kind: 'ai_generated'
  model: string
  matched_catalog_variety_id: string | null
  name: string
  aliases: string[]
  duration_days_range: [number, number]
  duration_group: 'short' | 'medium' | 'long'
  grain_type: string | null
  typical_seasons: string[]
  regions: string[]
  institute: string | null
  notes: string
  confidence: 'low' | 'medium' | 'high'
  caveats: string[]
  sources_hint: string[]
  recognized: boolean
}

export interface VarietySuggestResult {
  query: string
  matches: (Variety & { match_score: number })[]
  suggestion: VarietySuggestion | null
}

export interface VarietyCreate {
  name: string
  duration_days_range: [number, number]
  grain_type?: string | null
  aliases?: string[]
  seasons?: string[]
  regions?: string[]
  notes?: string | null
  source: 'user' | 'ai_suggested'
  ai_model?: string | null
  ai_confidence?: 'low' | 'medium' | 'high' | null
}

export interface Crop {
  slug: string
  name: I18nText
  scientific_name: string
  category: string
  image_url: string | null
  image_credit?: ImageCredit | null
  plannable?: boolean
  seasons: Season[]
  duration_days: [number, number]
  water_requirement_mm: [number, number]
  temp_optimal_c: [number, number]
  ph_range: [number, number]
  suitable_textures: string[]
  methods: string[]
  description: I18nText
  references: Ref[]
  varieties: Variety[]
  confidence?: 'data_backed' | 'preliminary'
  stages?: { key: string; name: I18nText; order: number }[]
}

export type IrrigationAvailability = 'assured' | 'limited' | 'rainfed'

export interface Recommendation {
  crop: Crop
  score: number
  suitability: 'suitable' | 'marginal' | 'unsuitable'
  confidence: 'data_backed' | 'preliminary'
  season: Season | null
  sowing_window: { start: string; end: string } | null
  reasons: string[]
  risks: string[]
  limitations: string[]
  inputs_used: Record<string, Provenance>
}

export interface DateRange3 {
  earliest: string
  expected: string
  latest: string
}

export interface StagePrediction {
  key: string
  name: I18nText
  order: number
  start: DateRange3
  end: DateRange3
  gdd_start: number
  gdd_end: number
  source: 'model_output' | 'user_entered'
  observed_on: string | null
}

export type CycleStatus = 'planned' | 'active' | 'harvested' | 'abandoned'
export type CultivationMethod = 'transplanting' | 'direct_seeding_wet' | 'direct_seeding_dry' | 'sowing'
export type IrrigationMethod = 'flood' | 'awd' | 'drip' | 'sprinkler' | 'rainfed'

export interface CycleDetail {
  id: string
  land_id: string
  land_name: string
  crop: Crop
  variety: Variety | null
  status: CycleStatus
  method: CultivationMethod
  anchor_date: string
  anchor_type: 'sowing' | 'transplanting'
  nursery_sowing_date: string | null
  irrigation_method: IrrigationMethod
  water_availability: IrrigationAvailability
  planting_density: string | null
  notes: string | null
  stages: StagePrediction[]
  harvest_window: DateRange3
  current: { date: string; das: number; stage_key: string; stage_progress: number } | null
  model: {
    name: string
    version: string
    base_temp_c: number
    assumptions: string[]
    missing_inputs: string[]
    references: Ref[]
  }
  created_at: string
  updated_at: string
}

export interface CycleCreate {
  land_id: string
  crop_slug: string
  variety_id?: string | null
  method: CultivationMethod
  anchor_date: string
  anchor_type: 'sowing' | 'transplanting'
  nursery_sowing_date?: string | null
  irrigation_method: IrrigationMethod
  water_availability: IrrigationAvailability
  planting_density?: string | null
  notes?: string | null
}

export type TaskCategory =
  | 'irrigation'
  | 'nutrient'
  | 'weed'
  | 'pest_scouting'
  | 'field_prep'
  | 'harvest'
  | 'observation'
  | 'custom'

export interface TaskOut {
  id: string
  cycle_id: string
  title: string
  description: string
  category: TaskCategory
  due_date: string
  window_end: string | null
  status: 'pending' | 'done' | 'skipped'
  weather_sensitive: boolean
  source: 'plan_template' | 'user' | 'assistant_suggested'
  completed_at: string | null
}

export interface TimelineWeather {
  tmin_c: number
  tmax_c: number
  precipitation_mm: number
  /** Hours with rain (Open-Meteo). Null for climatology rows and older cached data. */
  precipitation_hours?: number | null
  wind_speed_max_kmh: number
  wind_direction_dominant_deg?: number | null
  humidity_mean_pct: number | null
  cloud_cover_mean_pct: number | null
  sunrise: string | null
  sunset: string | null
  kind: WeatherDayKind
}

export interface TimelineDay {
  date: string
  das: number
  dat: number | null
  stage_key: string
  stage_local_progress: number
  cycle_progress: number
  gdd_cumulative: number
  weather: TimelineWeather | null
  tasks: TaskOut[]
  events: { type: 'stage_start'; stage_key: string }[]
  warnings: Alert[]
}

export interface Observation {
  id: string
  observed_on: string
  stage_key: string | null
  plant_height_cm: number | null
  notes: string
  pest_or_disease: string | null
  severity: 'low' | 'medium' | 'high' | null
  created_at: string
}

export interface IrrigationRecord {
  id: string
  date: string
  method: string
  duration_hours: number | null
  water_depth_mm: number | null
  notes: string | null
}

export interface InputApplication {
  id: string
  date: string
  input_type: 'fertilizer' | 'pesticide' | 'seed' | 'labour' | 'machinery' | 'other'
  product: string
  quantity: number | null
  unit: string | null
  cost_inr: number | null
  notes: string | null
}

export interface Dashboard {
  user: UserOut
  totals: { area_ha: number; area_acres: number; fields: number; active_cycles: number }
  fields: LandSummary[]
  active_cycles: CycleDetail[]
  upcoming_tasks: TaskOut[]
  alerts: Alert[]
  weather_today: { land_id: string; current: WeatherCurrent; daily: WeatherDaily[]; provenance?: Provenance } | null
}

export interface SuggestedAction {
  type: 'create_task'
  payload: Record<string, unknown>
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Ref[]
  context?: { land?: string; cycle?: string; weather_kind?: string }
  suggested_actions?: SuggestedAction[]
  confirmed_actions?: number[]
  created_at?: string
}

export interface Conversation {
  id: string
  title: string | null
  land_id: string | null
  cycle_id: string | null
  created_at: string
  updated_at?: string
  messages?: AssistantMessage[]
}

export interface ProviderHealth {
  provider: string
  calls: number
  errors: number
  error_rate: number | null
  p50_latency_ms: number | null
  last_success_at: string | null
  last_error_at: string | null
  last_error: string | null
  circuit_state: 'closed' | 'open' | 'half_open'
  source: { name: string; license: string | null; rate_limit: string | null; url: string | null } | null
}

export interface AdminStats {
  users: number
  lands: number
  cycles: number
  active_cycles: number
}

export interface NotificationOut {
  id: string
  title: string
  body: string | null
  kind: string
  link: string | null
  read_at: string | null
  created_at: string
}
