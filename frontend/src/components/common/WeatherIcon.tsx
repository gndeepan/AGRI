import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react'

/** WMO weather interpretation codes (as used by Open-Meteo). */
export function WeatherIcon({ code, isDay = true, className }: { code: number | null | undefined; isDay?: boolean; className?: string }) {
  const c = code ?? 0
  const Icon =
    c === 0 ? (isDay ? Sun : Moon)
    : c <= 2 ? CloudSun
    : c === 3 ? Cloud
    : c <= 48 ? CloudFog
    : c <= 57 ? CloudDrizzle
    : c <= 67 ? CloudRain
    : c <= 77 ? CloudSnow
    : c <= 82 ? CloudRain
    : c <= 86 ? CloudSnow
    : CloudLightning
  return <Icon className={className} aria-hidden />
}

export function weatherCodeKey(code: number | null | undefined): string {
  const c = code ?? 0
  if (c === 0) return 'clear'
  if (c <= 2) return 'partlyCloudy'
  if (c === 3) return 'overcast'
  if (c <= 48) return 'fog'
  if (c <= 57) return 'drizzle'
  if (c <= 67) return 'rain'
  if (c <= 82) return 'showers'
  if (c >= 95) return 'thunderstorm'
  return 'rain'
}
