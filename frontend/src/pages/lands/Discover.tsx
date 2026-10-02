import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Droplets, Info, Timer } from 'lucide-react'
import { useLand, useRecommendations } from '@/api/queries'
import type { IrrigationAvailability, Recommendation } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/PageHeader'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/common/States'
import { ProvenanceBadge } from '@/components/common/DataKindBadge'
import { CropImage } from '@/features/crops/CropImage'
import { formatDate, i18nText } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function Discover() {
  const { landId } = useParams()
  const { t } = useTranslation()
  const land = useLand(landId)
  const [sowingDate, setSowingDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [irrigation, setIrrigation] = useState<IrrigationAvailability>('assured')
  const recs = useRecommendations(landId, { sowing_date: sowingDate, irrigation })

  return (
    <div className="space-y-6">
      <Link to={`/app/lands/${landId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {land.data?.name ?? t('land.field')}
      </Link>
      <PageHeader eyebrow={land.data?.name} title={t('discover.title')} subtitle={t('discover.subtitle')} />
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="sow">{t('discover.sowingDate')}</Label>
          <Input id="sow" type="date" value={sowingDate} onChange={(e) => setSowingDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="irr">{t('discover.irrigation')}</Label>
          <NativeSelect id="irr" value={irrigation} onChange={(e) => setIrrigation(e.target.value as IrrigationAvailability)}>
            {(['assured', 'limited', 'rainfed'] as const).map((v) => <option key={v} value={v}>{t(`water.${v}`)}</option>)}
          </NativeSelect>
        </div>
        <p className="text-xs text-muted-foreground sm:max-w-56">{t('discover.note')}</p>
      </div>

      {recs.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} lines={5} />)}</div>
      ) : recs.isError ? (
        <ErrorState error={recs.error} onRetry={() => recs.refetch()} />
      ) : recs.data.length === 0 ? (
        <EmptyState title={t('discover.none')} body={t('discover.noneBody')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {recs.data.map((r, i) => <RecCard key={r.crop.slug} r={r} landId={landId!} sowingDate={sowingDate} index={i} />)}
        </div>
      )}
    </div>
  )
}

function RecCard({ r, landId, sowingDate, index }: { r: Recommendation; landId: string; sowingDate: string; index: number }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const suit = { suitable: 'default', marginal: 'gold', unsuitable: 'danger' } as const
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn('flex flex-col overflow-hidden rounded-2xl border border-border bg-card', r.suitability === 'unsuitable' && 'opacity-75')}
    >
      <div className="relative h-44 bg-paddy-900">
        <CropImage crop={r.crop} className="absolute inset-0" showCredit />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="pointer-events-none absolute bottom-3 left-4 right-4 flex items-end justify-between text-soil-50 [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">
          <div className="min-w-0">
            <h3 className="truncate font-display text-2xl font-semibold">{i18nText(r.crop.name, lang)}</h3>
            <p className="truncate text-xs italic opacity-85">
              {r.crop.scientific_name}
              {r.crop.varieties.length > 0 && <span className="not-italic"> · {t('crops.varietyCount', { count: r.crop.varieties.length })}</span>}
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-semibold tabular-nums">{Math.round(r.score)}</div>
            <div className="text-[10px] uppercase tracking-wider opacity-80">{t('discover.score')}</div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={suit[r.suitability]}>{t(`discover.suitability.${r.suitability}`)}</Badge>
          <Badge variant={r.confidence === 'data_backed' ? 'sky' : 'warn'} title={t(`discover.confidence.${r.confidence}Hint`)}>
            {t(`discover.confidence.${r.confidence}`)}
          </Badge>
          {r.season && <Badge variant="soil">{i18nText(r.season.name, lang)}</Badge>}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div><dt className="flex items-center gap-1 text-muted-foreground"><Timer className="size-3" />{t('discover.duration')}</dt><dd className="font-semibold">{r.crop.duration_days[0]}–{r.crop.duration_days[1]} {t('common.days')}</dd></div>
          <div><dt className="flex items-center gap-1 text-muted-foreground"><Droplets className="size-3" />{t('discover.water')}</dt><dd className="font-semibold">{r.crop.water_requirement_mm[0]}–{r.crop.water_requirement_mm[1]} mm</dd></div>
          <div><dt className="text-muted-foreground">{t('discover.window')}</dt><dd className="font-semibold">{r.sowing_window ? `${formatDate(r.sowing_window.start, 'd MMM', lang)} – ${formatDate(r.sowing_window.end, 'd MMM', lang)}` : '—'}</dd></div>
        </dl>
        {r.reasons.length > 0 && (
          <ul className="space-y-1 text-sm">
            {r.reasons.map((x) => <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-paddy-600" />{x}</li>)}
          </ul>
        )}
        {r.risks.length > 0 && (
          <ul className="space-y-1 text-sm">
            {r.risks.map((x) => <li key={x} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange-600" />{x}</li>)}
          </ul>
        )}
        {r.limitations.length > 0 && (
          <details className="rounded-xl bg-muted/60 p-3 text-xs">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium"><Info className="size-3.5" /> {t('discover.limitations')} ({r.limitations.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{r.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
          </details>
        )}
        {Object.keys(r.inputs_used).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {t('discover.basedOn')}
            {Object.entries(r.inputs_used).map(([k, p]) => (
              <span key={k} className="inline-flex items-center gap-1">{k}: <ProvenanceBadge provenance={p} /></span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-1">
          <Button asChild className="w-full" variant={r.suitability === 'unsuitable' ? 'outline' : 'default'}>
            <Link to={`/app/plans/new?land=${landId}&crop=${r.crop.slug}&date=${sowingDate}`}>{t('discover.plan')}</Link>
          </Button>
        </div>
      </div>
    </motion.article>
  )
}
