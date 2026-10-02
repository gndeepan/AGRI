import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CloudOff, Droplets, Eye, RotateCcw, Volume2, VolumeX, Wind } from 'lucide-react'
import { useWeather } from '@/api/queries'
import type { WeatherBundle, WeatherHourly } from '@/api/types'
import { WeatherIcon, weatherCodeKey } from '@/components/common/WeatherIcon'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber, windDirLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LiveSky } from './LiveSky'
import { toSkyParams, type WeatherLike } from './params'
import { loadSoundPreference, saveSoundPreference, weatherAudio } from './thunder'

export interface WeatherNowCardProps {
  landId: string
  /** When more than one field is given, a selector lets the farmer switch. */
  fields?: { id: string; name: string }[]
  onLandChange?: (id: string) => void
  /** Show the link to the field's full weather page. */
  showLink?: boolean
  className?: string
}

/** Local wall-clock string ("2026-10-02T14:00") at a UTC offset → the instant it denotes. */
export function localToInstant(local: string, utcOffsetSeconds: number): Date {
  return new Date(Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`) - utcOffsetSeconds * 1000)
}

function hourLabel(local: string): string {
  return local.slice(11, 16)
}

function recentRain(hourly: WeatherHourly[], i: number): number {
  let mm = 0
  for (let k = Math.max(0, i - 3); k < i; k++) mm += hourly[k].precipitation_mm ?? 0
  return mm
}

function isDayAt(h: WeatherHourly, sunElevation: number): boolean {
  return h.is_day ?? sunElevation > 0
}

export function WeatherNowCard({ landId, fields, onLandChange, showLink = true, className }: WeatherNowCardProps) {
  const { t } = useTranslation()
  const q = useWeather(landId)
  const [selected, setSelected] = useState<number | null>(null)
  const [sound, setSound] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const stripRef = useRef<HTMLDivElement>(null)

  // The saved preference is restored only on a click (browsers block audio before a gesture).
  const wantsSound = useMemo(loadSoundPreference, [])

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => setSelected(null), [landId])

  if (q.isPending) return <Skeleton className={cn('h-[340px] w-full rounded-3xl', className)} />
  if (q.isError || !q.data)
    return (
      <div className={cn('flex h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-muted/40 text-sm text-muted-foreground', className)}>
        <CloudOff className="size-6" />
        <span>{navigator.onLine ? t('sky.unavailable') : t('sky.offline')}</span>
        <button type="button" className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-2 hover:underline" onClick={() => q.refetch()}>
          <RotateCcw className="size-3.5" /> {t('common.retry')}
        </button>
      </div>
    )

  const w: WeatherBundle = q.data
  const offset = w.utc_offset_seconds ?? 19800
  const loc = w.location
  const hour = selected != null ? w.hourly[selected] : null

  const weather: WeatherLike = hour
    ? { ...hour, interval_s: 3600 }
    : { ...w.current, interval_s: w.current.interval_s ?? 900 }
  const date = hour ? localToInstant(hour.time, offset) : new Date(nowTick)
  const params = toSkyParams(weather, {
    lat: loc.lat,
    lon: loc.lon,
    date,
    recentRainMm: hour && selected != null ? recentRain(w.hourly, selected) : 0,
  })

  const temp = hour ? hour.temperature_c : w.current.temperature_c
  const code = hour ? hour.weather_code : w.current.weather_code
  const isDay = hour ? isDayAt(hour, params.sunElevation) : w.current.is_day
  const windSpeed = hour ? hour.wind_speed_kmh : w.current.wind_speed_kmh
  const windDir = hour ? hour.wind_direction_deg : w.current.wind_direction_deg
  const humidity = hour ? hour.humidity_pct : w.current.humidity_pct
  const visibility = hour ? hour.visibility_m : w.current.visibility_m
  const rainChance = (hour ?? w.hourly[0])?.precipitation_probability_pct
  const today = w.daily.find((d) => d.date === (hour?.time ?? w.current.time).slice(0, 10))
  const fieldName = fields?.find((f) => f.id === landId)?.name
  const updated = new Date(w.provenance.retrieved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dark = params.sunElevation < -0.05 || params.overcast > 0.6 || params.rainIntensity > 0.3

  const toggleSound = () => {
    const next = !sound
    setSound(next)
    saveSoundPreference(next)
    if (next) weatherAudio()?.resume()
    else weatherAudio()?.suspend()
  }

  return (
    <section className={cn('relative isolate min-w-0 overflow-hidden rounded-3xl border border-border shadow-sm', className)} aria-label={t('sky.cardLabel')}>
      <LiveSky params={params} glass sound={sound} className="absolute inset-0 -z-10" />
      {/* Legibility scrim: stronger behind the text on bright skies. */}
      <div className={cn('absolute inset-0 -z-10 bg-gradient-to-b', dark ? 'from-black/25 via-transparent to-black/45' : 'from-black/30 via-black/5 to-black/45')} />

      <div className="flex min-h-[250px] flex-col justify-between p-5 text-white sm:p-6 [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] opacity-90">
              {hour ? t('sky.atTime', { time: hourLabel(hour.time), day: hour.time.slice(8, 10) }) : t('sky.nowAt')}
            </div>
            {fields && fields.length > 1 ? (
              <select
                value={landId}
                onChange={(e) => onLandChange?.(e.target.value)}
                aria-label={t('sky.selectField')}
                className="mt-1 max-w-full truncate rounded-lg border border-white/25 bg-black/25 px-2 py-1 text-sm font-medium backdrop-blur-md [text-shadow:none] focus:outline-none focus:ring-2 focus:ring-white/60"
              >
                {fields.map((f) => <option key={f.id} value={f.id} className="text-black">{f.name}</option>)}
              </select>
            ) : (
              fieldName && <div className="mt-1 truncate text-sm font-medium">{fieldName}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selected != null && (
              <button type="button" onClick={() => setSelected(null)} className="rounded-full border border-white/30 bg-black/25 px-3 py-1.5 text-xs font-medium backdrop-blur-md [text-shadow:none] hover:bg-black/40">
                {t('sky.backToNow')}
              </button>
            )}
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              title={sound ? t('sky.soundOff') : wantsSound ? t('sky.soundResume') : t('sky.soundOn')}
              aria-label={sound ? t('sky.soundOff') : t('sky.soundOn')}
              className="flex size-9 items-center justify-center rounded-full border border-white/30 bg-black/25 backdrop-blur-md hover:bg-black/40"
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-end gap-4">
            <span className="font-display text-7xl font-semibold leading-none tabular-nums sm:text-8xl">{Math.round(temp)}°</span>
            <div className="pb-2">
              <div className="flex items-center gap-2 text-lg font-medium">
                <WeatherIcon code={code} isDay={isDay} className="size-5" />
                {t(`weather.codes.${weatherCodeKey(code)}`)}
              </div>
              <div className="text-sm opacity-90">
                {!hour && t('weather.feelsLike', { v: Math.round(w.current.feels_like_c) })}
                {!hour && today && ' · '}
                {today && t('sky.highLow', { h: Math.round(today.tmax_c), l: Math.round(today.tmin_c) })}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {rainChance != null && <span className="inline-flex items-center gap-1.5"><Droplets className="size-4" /> {t('sky.rainChance', { v: rainChance })}</span>}
            {params.rainRateMmH > 0 && <span>{t('sky.rainRate', { v: formatNumber(params.rainRateMmH, 1) })}</span>}
            <span className="inline-flex items-center gap-1.5"><Wind className="size-4" /> {formatNumber(windSpeed, 0)} km/h{windDir != null ? ` ${windDirLabel(windDir)}` : ''}</span>
            <span>{t('sky.humidity', { v: humidity })}</span>
            {visibility != null && <span className="inline-flex items-center gap-1.5"><Eye className="size-4" /> {formatNumber(visibility / 1000, visibility < 10000 ? 1 : 0)} km</span>}
          </div>
        </div>
      </div>

      <div className="bg-black/35 text-white backdrop-blur-md">
        <div ref={stripRef} className="no-scrollbar flex snap-x gap-1 overflow-x-auto px-3 py-3" role="listbox" aria-label={t('sky.hourly')}>
          {w.hourly.map((h, i) => {
            const active = selected === i || (selected == null && i === 0)
            const newDay = i > 0 && h.time.slice(11, 13) === '00'
            return (
              <button
                key={h.time}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => setSelected(i === 0 ? null : i)}
                className={cn(
                  'flex min-w-[58px] snap-start flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs transition-colors',
                  active ? 'bg-white/25 font-semibold' : 'hover:bg-white/10',
                  newDay && 'ml-2 border-l border-white/20 pl-3',
                )}
              >
                <span className="opacity-90">{i === 0 ? t('weather.now') : hourLabel(h.time)}</span>
                <WeatherIcon code={h.weather_code} isDay={h.is_day ?? true} className="size-4" />
                <span className="tabular-nums">{Math.round(h.temperature_c)}°</span>
                <span className={cn('tabular-nums text-[10px]', (h.precipitation_probability_pct ?? 0) >= 30 ? 'text-sky-200' : 'opacity-50')}>
                  {h.precipitation_probability_pct ?? 0}%
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/10 px-4 py-2 text-[11px] text-white/75">
          <span>
            {t('sky.provenance', { time: updated })}
            {w.provenance.cache_status === 'stale' && ` · ${t('sky.stale')}`}
            {' · '}{t('sky.notRadar')}
          </span>
          {showLink && <Link to={`/app/lands/${landId}/environment`} className="font-medium text-white hover:underline">{t('dashboard.fullWeather')}</Link>}
        </div>
      </div>
    </section>
  )
}
