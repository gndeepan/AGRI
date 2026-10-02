# Bhoomi AI — Architecture & API Contract

This document is the source of truth shared by the backend (`backend/`) and the
frontend (`frontend/`). Change the contract here first, then in code.

## 1. Shape of the system

```
 Browser (React 19 + Vite)                     Docker Compose
 ┌──────────────────────────┐   /api (proxy)  ┌───────────────────────────────┐
 │ Map (MapLibre+terra-draw)│ ──────────────▶ │ api: FastAPI (modular monolith)│
 │ Dashboard / Plans / Chat │                 │  ├─ auth     ├─ crops          │
 │ Virtual field (R3F, lazy)│                 │  ├─ lands    ├─ planning       │
 └──────────────────────────┘                 │  ├─ environment (providers)    │
                                              │  ├─ records  ├─ assistant      │
                                              │  └─ admin                      │
                                              ├─ worker: scheduled refresh jobs│
                                              ├─ db: PostgreSQL 16 + PostGIS   │
                                              ├─ redis: cache, locks, rate-limit│
                                              └─ mailpit: dev SMTP + web inbox │
                                              └───────────────────────────────┘
 External (server-side only): Open-Meteo (forecast, archive, elevation),
 ISRIC SoilGrids v2, OSM Nominatim (geocoding), Google Gemini (assistant).
```

* **Modular monolith.** `backend/app/modules/<domain>/` each own `models.py`,
  `schemas.py`, `service.py`, `router.py`. Cross-module calls go through
  services, never through another module's router.
* **Provider adapters.** `modules/environment/providers/` define Protocols
  (`WeatherProvider`, `SoilProvider`, `ElevationProvider`, `Geocoder`). Business
  logic depends on the Protocol; concrete adapters are chosen in config.
* **No provider calls per animation frame.** The frontend fetches a cycle
  timeline once (daily resolution) and interpolates visuals locally.
* **Provenance everywhere.** Every environmental value carries a `Provenance`
  object; DB keeps raw payloads (`environmental_observations.raw`) separate from
  normalized values and from model output (`crop_stage_predictions`).

## 2. Data kinds (used in UI labels)

| kind          | meaning                                                         |
|---------------|-----------------------------------------------------------------|
| `observed`    | measured / reanalysis-observed values for past dates             |
| `forecast`    | provider forecast inside its horizon (Open-Meteo: 16 days)       |
| `climatology` | multi-year daily mean for the calendar day, beyond the horizon   |
| `modelled`    | gridded model estimate (e.g. SoilGrids) — not a lab test         |
| `user_entered`| entered by the farmer (soil test, observation)                   |
| `simulated`   | visual-only effect in the virtual field                          |
| `model_output`| Bhoomi crop-development model output                             |

## 3. Auth

* Password hashing: argon2 (`argon2-cffi`).
* Access JWT (15 min) in httpOnly cookie `bhoomi_access`; opaque refresh token
  (30 days, stored hashed in `refresh_tokens`) in httpOnly cookie
  `bhoomi_refresh` scoped to `/api/v1/auth`. `SameSite=Lax`, `Secure` in prod.
* Mutating requests must send `X-Requested-With: bhoomi` (simple CSRF guard on
  top of SameSite).
* Roles: `farmer`, `admin`. Every land/cycle/record query filters on
  `owner_id = current_user.id` (404, never 403, for other users' resources).
* Email verification + password reset use single-use hashed tokens, mailed via
  SMTP (Mailpit in dev at http://localhost:8025).

## 4. REST API (`/api/v1`)

All JSON. Errors: `{"detail": str | [...], "code": str?}`. Dates ISO-8601;
`date` = `YYYY-MM-DD`. Geometry = GeoJSON (EPSG:4326, `[lon, lat]`).

### Shared schemas

```ts
Provenance = { provider: string; dataset: string; kind: DataKind;
  retrieved_at: string; resolution?: string | null; license?: string | null;
  attribution?: string | null; cache_status: "fresh"|"cached"|"stale";
  notes?: string[] }
LatLon = { lat: number; lon: number }
UserPreferences = { language: "en"|"ta"; region: string|null;
  area_unit: "acre"|"hectare"; timezone: string }
UserOut = { id; email; full_name; role: "farmer"|"admin"; email_verified: boolean;
  preferences: UserPreferences; created_at }
```

### Auth & users
| method | path | body | returns |
|---|---|---|---|
| POST | /auth/register | `{email, password(min 10), full_name, language?}` | 201 `UserOut` (+cookies) |
| POST | /auth/login | `{email, password}` | `UserOut` (+cookies) |
| POST | /auth/logout | – | 204 |
| POST | /auth/refresh | – (cookie) | `UserOut` (+rotated cookies) |
| GET  | /auth/me | – | `UserOut` |
| POST | /auth/verify-email | `{token}` | `UserOut` |
| POST | /auth/resend-verification | – | 202 |
| POST | /auth/request-password-reset | `{email}` | 202 (always) |
| POST | /auth/reset-password | `{token, new_password}` | 204 |
| PATCH | /users/me | `{full_name?, preferences?: Partial<UserPreferences>}` | `UserOut` |
| DELETE | /users/me | `{password}` | 204 (soft-delete + anonymize, lands purged by job) |

### Geo & lands
```ts
LandMetrics = { area_m2; area_ha; area_acres; perimeter_m; centroid: LatLon;
  representative_point: LatLon; bbox: [minLon, minLat, maxLon, maxLat];
  vertex_count: number }
LandSummary = { id; name; metrics: LandMetrics; boundary: GeoJSON.Polygon;
  active_cycle: { id; crop_name; stage_key; stage_name } | null; updated_at }
LandDetail = LandSummary & { notes: string|null; village: string|null;
  district: string|null; state: string|null; terrain: Terrain|null;
  boundary_disclaimer: string; created_at }
Terrain = { elevation_m: number|null; slope_deg: number|null;
  relief_m: number|null; provenance: Provenance }
```
| method | path | notes |
|---|---|---|
| POST | /geo/measure | `{boundary}` → `LandMetrics` (validates, no save) |
| GET  | /geo/search?q= | → `[{name, display_name, lat, lon, bbox?, kind}]` (Nominatim proxy, cached, 1 rps) |
| GET  | /geo/reverse?lat=&lon= | → `{village, district, state, display_name}` |
| GET  | /lands | → `LandSummary[]` |
| POST | /lands | `{name, boundary, notes?}` → 201 `LandDetail` |
| GET  | /lands/{id} | `LandDetail` |
| PATCH | /lands/{id} | `{name?, boundary?, notes?}` → `LandDetail` |
| DELETE | /lands/{id} | 204 (soft delete) |

Geometry validation (422 with `code`): not a Polygon (`not_polygon`), < 3
distinct vertices (`too_few_vertices`), self-intersecting (`invalid_geometry`),
holes allowed, area < 10 m² (`too_small`) or > 10 km² (`too_large`), coords out
of range (`out_of_range`). Area/perimeter are **geodesic** (pyproj `Geod` WGS84
in Python; PostGIS `ST_Area(geography)` used as the DB-side cross-check).

### Environment
```ts
WeatherCurrent = { time; temperature_c; feels_like_c; humidity_pct;
  precipitation_mm; cloud_cover_pct; wind_speed_kmh; wind_direction_deg;
  wind_gusts_kmh; pressure_hpa; is_day: boolean; weather_code: number }
WeatherDaily = { date; tmin_c; tmax_c; tmean_c; precipitation_mm;
  precipitation_probability_pct: number|null; wind_speed_max_kmh;
  wind_gusts_max_kmh; wind_direction_dominant_deg; humidity_mean_pct|null;
  sunrise: string|null; sunset: string|null; weather_code|null;
  et0_mm: number|null; kind: "observed"|"forecast"|"climatology" }
WeatherHourly = { time; temperature_c; precipitation_mm; precipitation_probability_pct;
  wind_speed_kmh; cloud_cover_pct; humidity_pct }
WeatherBundle = { location: LatLon; timezone; current: WeatherCurrent;
  hourly: WeatherHourly[] /*48h*/; daily: WeatherDaily[] /*past 7 + 16 fcst*/;
  alerts: Alert[]; provenance: Provenance }
Alert = { id; severity: "info"|"watch"|"warning"; title; message; starts: string;
  ends: string|null; source: "bhoomi_rules"|string; kind: DataKind }
SoilProfile = { texture_class: string|null; layers: [{ depth: "0-5cm"|"5-15cm"|"15-30cm";
  sand_pct; silt_pct; clay_pct; ph; soc_g_per_kg; cec_cmol_per_kg; bulk_density }];
  drainage_hint: string|null; irrigation_suitability: string|null;
  limitations: string[]; provenance: Provenance; soil_tests: SoilTest[] }
SoilTest = { id; sample_date; lab_name|null; ph|null; ec_ds_m|null;
  organic_carbon_pct|null; n_kg_ha|null; p_kg_ha|null; k_kg_ha|null;
  texture|null; notes|null; created_at }
```
| method | path | notes |
|---|---|---|
| GET | /lands/{id}/weather | `WeatherBundle` (cache 30 min in Redis + DB snapshot) |
| GET | /lands/{id}/weather/daily?start=&end= | `WeatherDaily[]` mixing observed/forecast/climatology by date |
| GET | /lands/{id}/soil | `SoilProfile` (cache 30 days) |
| POST | /lands/{id}/soil-tests | create `SoilTest` |
| DELETE | /lands/{id}/soil-tests/{test_id} | 204 |
| GET | /lands/{id}/terrain | `Terrain` |

### Crops & recommendations
```ts
Crop = { slug; name: {en, ta}; scientific_name; category; image_url;
  seasons: Season[]; duration_days: [min, max]; water_requirement_mm: [min,max];
  temp_optimal_c: [min,max]; ph_range: [min,max]; suitable_textures: string[];
  methods: string[]; description: {en, ta}; references: Ref[]; varieties: Variety[] }
Variety = { id; name; duration_days: number; duration_group: "short"|"medium"|"long";
  seasons: string[]; notes; reference: Ref|null }
Season = { key: "kuruvai"|"samba"|"thaladi"|"navarai"|"kharif"|"rabi"|"summer";
  name: {en, ta}; sowing_window: {start: "MM-DD", end: "MM-DD"} }
Ref = { title; publisher; url }
Recommendation = { crop: Crop; score: number /*0-100*/;
  suitability: "suitable"|"marginal"|"unsuitable";
  confidence: "data_backed"|"preliminary"; season: Season|null;
  sowing_window: {start: date, end: date}|null; reasons: string[];
  risks: string[]; limitations: string[]; inputs_used: Record<string, Provenance> }
```
| method | path | notes |
|---|---|---|
| GET | /crops | `Crop[]` |
| GET | /crops/{slug} | `Crop` |
| GET | /lands/{id}/recommendations?sowing_date=&irrigation=assured\|limited\|rainfed | `Recommendation[]` sorted by score |

### Crop cycles (plans), timeline, tasks, records
```ts
StagePrediction = { key; name: {en, ta}; order; start: {earliest, expected, latest};
  end: {earliest, expected, latest}; gdd_start; gdd_end; source: "model_output"|"user_entered";
  observed_on: date|null }
CycleDetail = { id; land_id; land_name; crop: Crop; variety: Variety|null;
  status: "planned"|"active"|"harvested"|"abandoned";
  method: "transplanting"|"direct_seeding_wet"|"direct_seeding_dry"|"sowing";
  anchor_date: date; anchor_type: "sowing"|"transplanting"; nursery_sowing_date: date|null;
  irrigation_method: "flood"|"awd"|"drip"|"sprinkler"|"rainfed";
  water_availability: "assured"|"limited"|"rainfed"; planting_density: string|null;
  notes: string|null; stages: StagePrediction[];
  harvest_window: {earliest, expected, latest};
  current: { date; das: number; stage_key; stage_progress: number /*0..1 whole cycle*/ } | null;
  model: { name; version; base_temp_c; assumptions: string[]; missing_inputs: string[];
           references: Ref[] };
  created_at; updated_at }
TimelineDay = { date; das: number; dat: number|null /*days after transplant*/;
  stage_key; stage_local_progress: number; cycle_progress: number;
  gdd_cumulative: number;
  weather: { tmin_c; tmax_c; precipitation_mm; wind_speed_max_kmh; humidity_mean_pct;
             cloud_cover_mean_pct|null; precipitation_hours|null; wind_direction_dominant_deg|null;
             sunrise; sunset; kind } | null;
  tasks: TaskOut[]; events: [{type:"stage_start", stage_key}]; warnings: Alert[] }
TaskOut = { id; cycle_id; title; description; category:
  "irrigation"|"nutrient"|"weed"|"pest_scouting"|"field_prep"|"harvest"|"observation"|"custom";
  due_date; window_end: date|null; status: "pending"|"done"|"skipped";
  weather_sensitive: boolean; source: "plan_template"|"user"|"assistant_suggested";
  completed_at|null }
```
| method | path | notes |
|---|---|---|
| GET | /cycles?land_id=&status= | `CycleDetail[]` (stages included) |
| POST | /cycles | `{land_id, crop_slug, variety_id?, method, anchor_date, anchor_type, nursery_sowing_date?, irrigation_method, water_availability, planting_density?, notes?}` → 201 `CycleDetail` (generates stages + template tasks) |
| GET | /cycles/{id} | `CycleDetail` |
| PATCH | /cycles/{id} | edit fields; anchor/variety change triggers recompute |
| POST | /cycles/{id}/recompute | re-run model with latest weather |
| GET | /cycles/{id}/timeline?start=&end= | `TimelineDay[]` (default: anchor-7 .. latest harvest+7) |
| GET/POST | /cycles/{id}/tasks | list / create custom task |
| PATCH/DELETE | /tasks/{id} | update status/fields |
| GET/POST | /cycles/{id}/observations | `{observed_on, stage_key?, plant_height_cm?, notes, pest_or_disease?, severity?: "low"|"medium"|"high"}`; an observation with `stage_key` anchors that stage (observations override model) |
| GET/POST | /cycles/{id}/irrigation | `{date, method, duration_hours?, water_depth_mm?, notes?}` |
| GET/POST | /cycles/{id}/inputs | `{date, input_type: "fertilizer"|"pesticide"|"seed"|"labour"|"machinery"|"other", product, quantity, unit, cost_inr?, notes?}` |
| GET | /cycles/{id}/export.pdf | PDF plan summary |
| GET | /dashboard | `{user, totals:{area_ha, area_acres, fields, active_cycles}, fields: LandSummary[], active_cycles: CycleDetail[], upcoming_tasks: TaskOut[], alerts: Alert[], weather_today: {land_id, current, daily: WeatherDaily[]}|null}` |

### Assistant (Gemini)
| method | path | notes |
|---|---|---|
| GET | /assistant/conversations | list |
| POST | /assistant/conversations | `{land_id?, cycle_id?, title?}` |
| GET | /assistant/conversations/{id} | with messages |
| POST | /assistant/conversations/{id}/messages | `{content}` → `{user_message, assistant_message: {id, role, content, sources: Ref[], context: {land?, cycle?, weather_kind?}, suggested_actions: [{type:"create_task", payload}]}}` |
| POST | /assistant/actions/confirm | `{message_id, action_index}` — only path through which an assistant suggestion changes data |

Assistant rules: grounded on server-built context (field metrics, weather,
soil with provenance, cycle stages, tasks, curated knowledge snippets from
`backend/app/modules/assistant/knowledge/`); must state uncertainty, never give
pesticide doses beyond the label/official guidance, refer to the local
Agricultural Officer / KVK / TNAU for high-impact decisions; replies in the
user's language. If `GEMINI_API_KEY` is unset → 503 `assistant_unavailable`.

### Admin
| GET | /admin/providers | provider health: last success, last error, p50 latency, error rate, circuit state |
| GET | /admin/stats | users, lands, cycles counts |
| GET | /health | `{status, db, redis}` (no auth) |

## 5. Crop development model (v0.1, transparent)

`bhoomi-rice-phenology 0.1`:
* Rice phase lengths follow the widely used IRRI rule of thumb: the
  reproductive phase (panicle initiation → flowering) is ≈35 days and ripening
  (flowering → maturity) ≈30 days at typical tropical temperatures, largely
  independent of cultivar; the vegetative phase absorbs differences in variety
  duration.
* Thermal time: GDD = max(0, min(Tmean, 35) − 10 °C). Each stage's calendar
  length at a 28 °C reference mean (18 GDD/day) is converted to a GDD
  requirement; actual stage dates come from accumulating GDD on the daily
  series (observed → forecast → climatology).
* Uncertainty band widens with the share of the stage computed from
  climatology (±2 days within forecast horizon, up to ±7 days on climatology).
* Farmer observations of a stage start re-anchor the model from that point.
* Other crops: stage-fraction templates per crop (documented in the crop seed),
  labelled `preliminary`.

## 6. Repository layout

```
backend/   FastAPI app, Alembic migrations, seed, worker, pytest
frontend/  React 19 + Vite + Tailwind v4 + shadcn-style ui, MapLibre, R3F
docs/      ARCHITECTURE.md, DATA_SOURCES.md
docker-compose.yml, .env.example, Makefile
```

## 7. Backend notes (additive to the contract)

* Rice `stage_key`s, in order: `nursery` (only for transplanting), `establishment`, `tillering`, `panicle_initiation`, `flowering`, `grain_filling`, `maturity`. Other crops (preliminary template) use: `establishment`, `vegetative`, `flowering`, `yield_formation`, `maturity`.
* `Crop` also carries `confidence: "data_backed"|"preliminary"` and `stages: [{key, name:{en,ta}, order}]`.
* `WeatherBundle.daily` rows and `TimelineDay.weather` include `cloud_cover_mean_pct` and `precipitation_hours` (Open-Meteo daily `precipitation_hours`; always `null` for climatology rows, which are multi-year means and must not drive a rain animation). `TimelineDay.weather` also carries `wind_direction_dominant_deg` (null on climatology). The dashboard's `weather_today` also includes `provenance`. Dashboard alerts carry `land_id` and `land_name`.
* Extra endpoints:
  * `DELETE /cycles/{id}` (soft delete)
  * `GET /notifications?unread_only=`
  * `POST /notifications/{id}/read`
* `TimelineDay.weather` is `null` for a date when every provider is down. The crop model then uses its 28 °C reference temperature for that day and widens uncertainty.
* Assistant messages also return `confirmed_actions: number[]` and `created_at`.

## 8. Live sky (weather visualisation)

* `WeatherBundle` additions (all additive): `utc_offset_seconds`; `current.interval_s`, `visibility_m`, `rain_mm`, `showers_mm`, `snowfall_cm`, `cloud_cover_low_pct`, `cloud_cover_mid_pct`, `cloud_cover_high_pct`; each `hourly` row also has `weather_code`, `visibility_m`, `rain_mm`, `showers_mm`, `cloud_cover_low/mid/high_pct`, `wind_direction_deg`, `wind_gusts_kmh`, `is_day`. `hourly` now covers 72 hours from now. Live weather is cached for 10 minutes; `provenance.retrieved_at` drives the "updated hh:mm" label.
* `frontend/src/features/sky/`: `toSkyParams(weather, {lat, lon, date})` maps a current or hourly row to sky inputs (pure, tested). `createSkyRenderer(canvas)` is a headless WebGL2 renderer with `render(params, timeSeconds, opts)` and `lightProbe(params)` (key light direction/colour, ambient, fog) so a 3D scene can be lit by the same sky. `<LiveSky params glass sound />` wraps it with pause-when-hidden, reduced-motion and a CSS-gradient fallback.
* Honesty rules: lightning is drawn only for WMO thunderstorm codes 95/96/99; rain only when the model reports precipitation or a rain code; the strike timing and position are simulated. The UI states that this is model data, not radar or lightning sensors.
* Photosensitivity: at most one lightning event per 2.4 s, capped flash brightness, and no flashes at all under `prefers-reduced-motion`.
* Dev gallery of every state: `/dev/sky` (development builds only), `?only=<key>`, `&bolt=1`.
