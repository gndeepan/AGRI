import { toSkyParams, type SkyParams, type WeatherLike } from './params'

/** Synthetic conditions for the dev gallery and tests — not live data. Location: Thanjavur. */
const LAT = 10.79
const LON = 79.14
/** Local (IST, UTC+5:30) wall-clock time on a fixed date. */
const at = (h: number, m = 0, day = 2) => new Date(Date.UTC(2026, 9, day, h - 5, m - 30))

export interface SkyPreset { key: string; label: string; weather: WeatherLike; date: Date; recentRainMm?: number }

export const PRESETS: SkyPreset[] = [
  { key: 'dawn', label: 'Dawn', date: at(5, 52), weather: { weather_code: 1, cloud_cover_pct: 25, cloud_cover_low_pct: 10, cloud_cover_mid_pct: 20, cloud_cover_high_pct: 35, visibility_m: 18000, wind_speed_kmh: 9, wind_direction_deg: 250, humidity_pct: 80 } },
  { key: 'clear-day', label: 'Clear day', date: at(11), weather: { weather_code: 0, cloud_cover_pct: 5, cloud_cover_low_pct: 2, cloud_cover_mid_pct: 0, cloud_cover_high_pct: 8, visibility_m: 24000, wind_speed_kmh: 8, wind_direction_deg: 220, humidity_pct: 55 } },
  { key: 'golden-hour', label: 'Golden hour', date: at(17, 35), weather: { weather_code: 1, cloud_cover_pct: 25, cloud_cover_low_pct: 12, cloud_cover_mid_pct: 15, cloud_cover_high_pct: 30, visibility_m: 20000, wind_speed_kmh: 10, wind_direction_deg: 200, humidity_pct: 65 } },
  { key: 'partly-cloudy', label: 'Partly cloudy', date: at(14), weather: { weather_code: 2, cloud_cover_pct: 50, cloud_cover_low_pct: 42, cloud_cover_mid_pct: 25, cloud_cover_high_pct: 20, visibility_m: 18000, wind_speed_kmh: 14, wind_direction_deg: 240, humidity_pct: 60 } },
  { key: 'mostly-cloudy', label: 'Mostly cloudy (80%)', date: at(10, 30), weather: { weather_code: 2, cloud_cover_pct: 80, cloud_cover_low_pct: 80, cloud_cover_mid_pct: 30, cloud_cover_high_pct: 20, visibility_m: 16000, wind_speed_kmh: 16, wind_direction_deg: 230, humidity_pct: 68 } },
  { key: 'overcast', label: 'Overcast', date: at(13), weather: { weather_code: 3, cloud_cover_pct: 100, cloud_cover_low_pct: 95, cloud_cover_mid_pct: 80, cloud_cover_high_pct: 60, visibility_m: 12000, wind_speed_kmh: 12, wind_direction_deg: 60, humidity_pct: 78 } },
  { key: 'drizzle', label: 'Drizzle', date: at(9), weather: { weather_code: 53, cloud_cover_pct: 100, cloud_cover_low_pct: 92, cloud_cover_mid_pct: 85, cloud_cover_high_pct: 40, rain_mm: 0.5, visibility_m: 8000, wind_speed_kmh: 8, wind_direction_deg: 70, humidity_pct: 90 } },
  { key: 'heavy-rain', label: 'Heavy rain', date: at(15), weather: { weather_code: 65, cloud_cover_pct: 100, cloud_cover_low_pct: 100, cloud_cover_mid_pct: 100, cloud_cover_high_pct: 80, rain_mm: 12, visibility_m: 3500, wind_speed_kmh: 28, wind_direction_deg: 60, humidity_pct: 96 } },
  { key: 'thunderstorm', label: 'Thunderstorm', date: at(16, 30), weather: { weather_code: 95, cloud_cover_pct: 100, cloud_cover_low_pct: 100, cloud_cover_mid_pct: 100, cloud_cover_high_pct: 100, rain_mm: 4, showers_mm: 9, visibility_m: 4000, wind_speed_kmh: 34, wind_direction_deg: 250, humidity_pct: 95 } },
  { key: 'fog', label: 'Fog', date: at(6, 40), weather: { weather_code: 45, cloud_cover_pct: 100, cloud_cover_low_pct: 100, cloud_cover_mid_pct: 10, cloud_cover_high_pct: 0, visibility_m: 350, wind_speed_kmh: 3, wind_direction_deg: 0, humidity_pct: 99 } },
  { key: 'clear-night', label: 'Clear night', date: at(22, 0, 24), weather: { weather_code: 0, cloud_cover_pct: 8, cloud_cover_low_pct: 3, cloud_cover_mid_pct: 5, cloud_cover_high_pct: 10, visibility_m: 24000, wind_speed_kmh: 6, wind_direction_deg: 200, humidity_pct: 70 } },
  { key: 'moonlit-night', label: 'Moonlit, partly cloudy', date: at(21, 30, 24), weather: { weather_code: 2, cloud_cover_pct: 55, cloud_cover_low_pct: 52, cloud_cover_mid_pct: 20, cloud_cover_high_pct: 15, visibility_m: 20000, wind_speed_kmh: 12, wind_direction_deg: 210, humidity_pct: 72 } },
  { key: 'rainy-night', label: 'Rainy night', date: at(23), weather: { weather_code: 63, cloud_cover_pct: 100, cloud_cover_low_pct: 100, cloud_cover_mid_pct: 90, cloud_cover_high_pct: 70, rain_mm: 4.5, visibility_m: 6000, wind_speed_kmh: 18, wind_direction_deg: 80, humidity_pct: 95 } },
]

export function presetParams(key: string): SkyParams {
  const p = PRESETS.find((x) => x.key === key) ?? PRESETS[0]
  return toSkyParams(p.weather, { lat: LAT, lon: LON, date: p.date, recentRainMm: p.recentRainMm })
}
