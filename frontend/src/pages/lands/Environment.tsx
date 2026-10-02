import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { z } from 'zod'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts'
import { ArrowLeft, Droplets, Gauge, Plus, Sunrise, Sunset, Thermometer, Trash2, Wind } from 'lucide-react'
import { landsApi } from '@/api/endpoints'
import { qk, useLand, useSoil, useWeather } from '@/api/queries'
import type { SoilProfile, WeatherBundle } from '@/api/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, Stat } from '@/components/common/PageHeader'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/common/States'
import { DataKindBadge, ProvenanceBadge } from '@/components/common/DataKindBadge'
import { AlertList } from '@/components/common/AlertList'
import { FormField } from '@/components/common/Field'
import { WeatherIcon, weatherCodeKey } from '@/components/common/WeatherIcon'
import { WeatherNowCard } from '@/features/sky/WeatherNowCard'
import { soilTestSchema } from '@/lib/schemas'
import { formatDate, formatNumber, windDirLabel } from '@/lib/format'

const C = { temp: '#c9a24a', tmin: '#7fb069', rain: '#3d7ea6', wind: '#8f6a3f', grid: 'rgba(120,120,100,0.18)' }

export default function Environment() {
  const { landId } = useParams()
  const { t } = useTranslation()
  const land = useLand(landId)
  const weather = useWeather(landId)
  const soil = useSoil(landId)

  return (
    <div className="space-y-6">
      <Link to={`/app/lands/${landId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {land.data?.name ?? t('land.field')}
      </Link>
      <PageHeader eyebrow={land.data?.name} title={t('env.title')} subtitle={t('env.subtitle')} />
      <Tabs defaultValue="weather">
        <TabsList>
          <TabsTrigger value="weather">{t('env.weather')}</TabsTrigger>
          <TabsTrigger value="soil">{t('env.soil')}</TabsTrigger>
        </TabsList>
        <TabsContent value="weather">
          {weather.isPending ? (
            <div className="grid gap-4 md:grid-cols-2"><CardSkeleton lines={5} /><CardSkeleton lines={5} /></div>
          ) : weather.isError ? (
            <ErrorState error={weather.error} onRetry={() => weather.refetch()} />
          ) : (
            <div className="space-y-5">
              {landId && <WeatherNowCard landId={landId} showLink={false} />}
              <WeatherSection w={weather.data} />
            </div>
          )}
        </TabsContent>
        <TabsContent value="soil">
          {soil.isPending ? (
            <CardSkeleton lines={6} />
          ) : soil.isError ? (
            <ErrorState error={soil.error} onRetry={() => soil.refetch()} />
          ) : (
            <SoilSection soil={soil.data} landId={landId!} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function WeatherSection({ w }: { w: WeatherBundle }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const c = w.current
  const today = w.daily.find((d) => d.kind === 'forecast') ?? w.daily[w.daily.length - 1]
  const hourly = w.hourly.map((h) => ({ ...h, label: formatDate(h.time, 'HH:mm', lang) }))
  const daily = w.daily.map((d) => ({ ...d, label: formatDate(d.date, 'd MMM', lang) }))
  const todayIdx = daily.findIndex((d) => d.kind === 'forecast')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ProvenanceBadge provenance={w.provenance} />
        <span>{t('env.timezone', { tz: w.timezone })}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('env.temperature')} icon={<Thermometer className="size-3.5" />} value={`${formatNumber(c.temperature_c, 1)}°C`} hint={t('weather.feelsLike', { v: formatNumber(c.feels_like_c, 0) })} />
        <Stat label={t('env.humidity')} icon={<Droplets className="size-3.5" />} value={`${c.humidity_pct}%`} hint={`${t('env.cloud')}: ${c.cloud_cover_pct}%`} />
        <Stat label={t('env.wind')} icon={<Wind className="size-3.5" />} value={`${formatNumber(c.wind_speed_kmh, 0)} km/h`} hint={`${windDirLabel(c.wind_direction_deg)} · ${t('env.gusts')} ${formatNumber(c.wind_gusts_kmh, 0)}`} />
        <Stat label={t('env.pressure')} icon={<Gauge className="size-3.5" />} value={`${formatNumber(c.pressure_hpa, 0)} hPa`} hint={
          <span className="inline-flex items-center gap-2">
            <WeatherIcon code={c.weather_code} isDay={c.is_day} className="size-3.5" /> {t(`weather.codes.${weatherCodeKey(c.weather_code)}`)}
          </span>
        } />
      </div>
      {today && (
        <div className="flex flex-wrap gap-4 rounded-2xl border border-border bg-card p-4 text-sm">
          <span className="inline-flex items-center gap-1.5"><Sunrise className="size-4 text-sun-500" /> {t('env.sunrise')} {today.sunrise ? formatDate(today.sunrise, 'HH:mm', lang) : '—'}</span>
          <span className="inline-flex items-center gap-1.5"><Sunset className="size-4 text-soil-500" /> {t('env.sunset')} {today.sunset ? formatDate(today.sunset, 'HH:mm', lang) : '—'}</span>
          <span>{t('env.tempRange', { min: formatNumber(today.tmin_c, 0), max: formatNumber(today.tmax_c, 0) })}</span>
          {today.precipitation_probability_pct != null && <span>{t('env.rainChance', { v: today.precipitation_probability_pct })}</span>}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('env.alerts')}</CardTitle>
          <CardDescription>{t('env.alertsNote')}</CardDescription>
        </CardHeader>
        <CardContent><AlertList alerts={w.alerts} /></CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('env.next48')}</CardTitle>
            <DataKindBadge kind="forecast" />
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourly} margin={{ left: -18, right: 4, top: 6 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={5} />
                <YAxis yAxisId="t" tick={{ fontSize: 11 }} unit="°" />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit="mm" width={40} />
                <ReTooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar yAxisId="r" dataKey="precipitation_mm" name={t('env.rain')} fill={C.rain} radius={[3, 3, 0, 0]} />
                <Line yAxisId="t" dataKey="temperature_c" name={t('env.temperature')} stroke={C.temp} strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('env.dailyOutlook')}</CardTitle>
            <div className="flex gap-1"><DataKindBadge kind="observed" /><DataKindBadge kind="forecast" /></div>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ left: -18, right: 4, top: 6 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
                <YAxis yAxisId="t" tick={{ fontSize: 11 }} unit="°" />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit="mm" width={40} />
                <ReTooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                {todayIdx > 0 && <ReferenceLine yAxisId="t" x={daily[todayIdx].label} stroke="#888" strokeDasharray="4 4" label={{ value: t('env.forecastStarts'), fontSize: 10, position: 'insideTopRight' }} />}
                <Bar yAxisId="r" dataKey="precipitation_mm" name={t('env.rain')} fill={C.rain} radius={[3, 3, 0, 0]} />
                <Area yAxisId="t" dataKey="tmax_c" name={t('env.tmax')} stroke={C.temp} fill={C.temp} fillOpacity={0.15} />
                <Line yAxisId="t" dataKey="tmin_c" name={t('env.tmin')} stroke={C.tmin} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>{t('env.windRain')}</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ left: -18, right: 4, top: 6 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} unit="" />
                <ReTooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="wind_speed_max_kmh" name={t('env.windMax')} fill={C.wind} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                <Line dataKey="wind_gusts_max_kmh" name={t('env.gusts')} stroke="#5a402a" strokeDasharray="4 3" dot={false} />
                <Line dataKey="precipitation_probability_pct" name={t('env.rainChancePct')} stroke={C.rain} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SoilSection({ soil, landId }: { soil: SoilProfile; landId: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{t('soil.gridded')}</CardTitle>
            <CardDescription>{t('soil.griddedNote')}</CardDescription>
          </div>
          <ProvenanceBadge provenance={soil.provenance} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {soil.texture_class && <Badge variant="soil">{t('soil.texture')}: {soil.texture_class}</Badge>}
            {soil.drainage_hint && <Badge variant="sky">{t('soil.drainage')}: {soil.drainage_hint}</Badge>}
            {soil.irrigation_suitability && <Badge>{t('soil.irrigation')}: {soil.irrigation_suitability}</Badge>}
          </div>
          {soil.layers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('soil.noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t('soil.depth')}</th>
                    <th className="py-2 pr-3 font-medium">{t('soil.sand')}</th>
                    <th className="py-2 pr-3 font-medium">{t('soil.silt')}</th>
                    <th className="py-2 pr-3 font-medium">{t('soil.clay')}</th>
                    <th className="py-2 pr-3 font-medium">pH</th>
                    <th className="py-2 pr-3 font-medium">{t('soil.soc')}</th>
                    <th className="py-2 pr-3 font-medium">{t('soil.cec')}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {soil.layers.map((l) => (
                    <tr key={l.depth} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">{l.depth}</td>
                      <td className="py-2 pr-3">{formatNumber(l.sand_pct, 0)}%</td>
                      <td className="py-2 pr-3">{formatNumber(l.silt_pct, 0)}%</td>
                      <td className="py-2 pr-3">{formatNumber(l.clay_pct, 0)}%</td>
                      <td className="py-2 pr-3">{formatNumber(l.ph, 1)}</td>
                      <td className="py-2 pr-3">{formatNumber(l.soc_g_per_kg, 1)} g/kg</td>
                      <td className="py-2 pr-3">{formatNumber(l.cec_cmol_per_kg, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {soil.limitations.length > 0 && (
            <ul className="list-disc space-y-1 rounded-xl bg-soil-100/60 p-4 pl-8 text-xs text-soil-800 dark:bg-soil-800/30 dark:text-soil-100">
              {soil.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{t('soil.tests')}</CardTitle>
            <CardDescription>{t('soil.testsNote')}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}><Plus /> {t('soil.addTest')}</Button>
        </CardHeader>
        <CardContent>
          {soil.soil_tests.length === 0 ? (
            <EmptyState title={t('soil.noTests')} body={t('soil.noTestsBody')} className="py-6" />
          ) : (
            <ul className="space-y-2">
              {soil.soil_tests.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {formatDate(s.sample_date, 'd MMM yyyy', i18n.language)} {s.lab_name && <span className="text-muted-foreground">· {s.lab_name}</span>}
                      <DataKindBadge kind="user_entered" />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                      {s.ph != null && <span>pH {s.ph}</span>}
                      {s.ec_ds_m != null && <span>EC {s.ec_ds_m} dS/m</span>}
                      {s.organic_carbon_pct != null && <span>OC {s.organic_carbon_pct}%</span>}
                      {s.n_kg_ha != null && <span>N {s.n_kg_ha}</span>}
                      {s.p_kg_ha != null && <span>P {s.p_kg_ha}</span>}
                      {s.k_kg_ha != null && <span>K {s.k_kg_ha} kg/ha</span>}
                      {s.texture && <span>{s.texture}</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.delete')}
                    onClick={async () => {
                      if (!confirm(t('common.confirmDelete'))) return
                      await landsApi.removeSoilTest(landId, s.id).catch(() => toast.error(t('errors.generic')))
                      qc.invalidateQueries({ queryKey: qk.soil(landId) })
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SoilTestDialog open={open} onOpenChange={setOpen} landId={landId} />
    </div>
  )
}

type SoilForm = z.input<typeof soilTestSchema>

function SoilTestDialog({ open, onOpenChange, landId }: { open: boolean; onOpenChange: (v: boolean) => void; landId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { register, handleSubmit, formState, reset } = useForm<SoilForm, unknown, z.output<typeof soilTestSchema>>({
    resolver: zodResolver(soilTestSchema),
  })
  const e = (k: keyof SoilForm) => {
    const m = formState.errors[k]?.message
    return m ? t(m) : undefined
  }
  const onSubmit = handleSubmit(async (v) => {
    try {
      await landsApi.addSoilTest(landId, v)
      qc.invalidateQueries({ queryKey: qk.soil(landId) })
      toast.success(t('soil.saved'))
      reset()
      onOpenChange(false)
    } catch {
      toast.error(t('errors.generic'))
    }
  })
  const num = (k: keyof SoilForm, label: string, step = '0.1') => (
    <FormField id={`st-${k}`} label={label} error={e(k)}>
      <Input id={`st-${k}`} type="number" inputMode="decimal" step={step} {...register(k)} />
    </FormField>
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('soil.addTest')}</DialogTitle>
          <DialogDescription>{t('soil.addTestBody')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3" noValidate>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <FormField id="st-date" label={t('soil.sampleDate')} error={e('sample_date')}>
              <Input id="st-date" type="date" {...register('sample_date')} />
            </FormField>
            <FormField id="st-lab" label={t('soil.lab')}>
              <Input id="st-lab" {...register('lab_name')} />
            </FormField>
          </div>
          {num('ph', 'pH')}
          {num('ec_ds_m', 'EC (dS/m)', '0.01')}
          {num('organic_carbon_pct', `${t('soil.oc')} (%)`, '0.01')}
          {num('n_kg_ha', 'N (kg/ha)', '1')}
          {num('p_kg_ha', 'P (kg/ha)', '1')}
          {num('k_kg_ha', 'K (kg/ha)', '1')}
          <div className="col-span-2">
            <FormField id="st-texture" label={t('soil.texture')}><Input id="st-texture" {...register('texture')} /></FormField>
          </div>
          <div className="col-span-2">
            <FormField id="st-notes" label={t('map.notes')}><Textarea id="st-notes" rows={2} {...register('notes')} /></FormField>
          </div>
          <Button type="submit" className="col-span-2" disabled={formState.isSubmitting}>{t('common.save')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
