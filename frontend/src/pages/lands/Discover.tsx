import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Droplets, Info, RotateCw, Sparkles, Timer } from 'lucide-react'
import { useAIRecommendations, useLand, useRecommendations } from '@/api/queries'
import type { AIRecommendation, AIRecommendations, IrrigationAvailability, Recommendation } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/PageHeader'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/common/States'
import { Skeleton } from '@/components/ui/skeleton'
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
  const ai = useAIRecommendations(landId, { sowing_date: sowingDate, irrigation })

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

      <AISection landId={landId!} fieldName={land.data?.name ?? t('land.field')} sowingDate={sowingDate} ai={ai} />

      <header className="pt-2">
        <h2 className="font-display text-2xl font-semibold">{t('rules.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('rules.subtitle')}</p>
      </header>
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
        {r.unassessed && r.unassessed.length > 0 && (
          <p className="flex gap-2 rounded-xl bg-orange-50 p-2.5 text-xs text-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t('rules.unassessed', { list: r.unassessed.map((k) => t(`rules.factor.${k}`)).join(', ') })}
          </p>
        )}
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

function AISection({ landId, fieldName, sowingDate, ai }: {
  landId: string
  fieldName: string
  sowingDate: string
  ai: ReturnType<typeof useAIRecommendations>
}) {
  const { t, i18n } = useTranslation()
  const data = ai.data
  return (
    <section aria-labelledby="ai-recs" className="space-y-4 rounded-3xl border border-paddy-200 bg-gradient-to-b from-paddy-50/70 to-card p-4 sm:p-6 dark:border-paddy-800 dark:from-paddy-900/30">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ai-recs" className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Sparkles className="size-5 text-sun-500" /> {t('ai.title', { name: fieldName })}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('ai.subtitle')}</p>
        </div>
        <Badge variant="gold">{t('ai.badge')}</Badge>
      </header>

      {ai.isPending || (!data && !ai.isError) ? (
        <div className="space-y-3" aria-busy>
          <p className="text-sm text-muted-foreground">{t('ai.loading')}</p>
          <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
        </div>
      ) : ai.isError ? (
        <Notice tone="warn" title={t('ai.unavailableTitle')} body={t('ai.unavailableBody')} action={
          <Button size="sm" variant="outline" onClick={() => ai.refetch()}><RotateCw className="size-3.5" /> {t('ai.retry')}</Button>} />
      ) : !data ? null : data.status === 'unavailable' ? (
        <>
          <Notice tone="warn" title={t('ai.unavailableTitle')} body={`${data.reason ?? ''} ${t('ai.unavailableBody')}`.trim()} action={
            <Button size="sm" variant="outline" onClick={() => ai.refetch()}><RotateCw className="size-3.5" /> {t('ai.retry')}</Button>} />
          <DataUsed data={data} />
        </>
      ) : data.status === 'insufficient_data' ? (
        <>
          <Notice tone="warn" title={t('ai.insufficientTitle')} body={t('ai.insufficientBody')} action={
            <Button asChild size="sm"><Link to={`/app/lands/${landId}/environment`}>{t('ai.addSoilTest')}</Link></Button>}>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{(data.missing ?? []).map((m) => <li key={m}>{m}</li>)}</ul>
          </Notice>
          <DataUsed data={data} />
        </>
      ) : (
        <>
          {data.summary && <p className="text-sm leading-relaxed">{data.summary}</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.recommendations.map((r) => <AIRecCard key={r.crop.slug} r={r} landId={landId} sowingDate={sowingDate} />)}
          </div>
          <DataUsed data={data} />
          {data.data_gaps.length > 0 && (
            <details className="rounded-xl bg-muted/60 p-3 text-xs">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium"><Info className="size-3.5" /> {t('ai.gaps')} ({data.data_gaps.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{data.data_gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </details>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" /> {t('ai.disclaimer')}
            {data.generated_at && data.model && (
              <span>
                · {t('ai.generated', { time: formatDate(data.generated_at, 'd MMM, HH:mm', i18n.language), model: data.model })}
                {data.cached ? ` (${t('ai.cached')})` : ''}
              </span>
            )}
          </p>
          {data.dropped_claims > 0 && <p className="text-xs text-muted-foreground">{t('ai.droppedNote', { count: data.dropped_claims })}</p>}
        </>
      )}
    </section>
  )
}

function Notice({ tone, title, body, action, children }: {
  tone: 'warn'
  title: string
  body: string
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div role="status" className={cn('rounded-2xl border p-4', tone === 'warn' && 'border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 shrink-0" /> {title}</p>
          <p className="mt-1 text-sm">{body}</p>
          {children}
        </div>
        {action}
      </div>
    </div>
  )
}

function DataUsed({ data }: { data: AIRecommendations }) {
  const { t } = useTranslation()
  if (data.inputs.length === 0) return null
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <h3 className="text-sm font-semibold">{t('ai.dataUsed')}</h3>
      <p className="text-xs text-muted-foreground">{t(data.status === 'ok' ? 'ai.dataUsedHint' : 'ai.dataFoundHint')}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        {data.inputs.map((i) => (
          <div key={i.key} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{i.label}</dt>
            <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
              <span>{i.value}</span>
              {i.provenance && <ProvenanceBadge provenance={i.provenance} />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function AIRecCard({ r, landId, sowingDate }: { r: AIRecommendation; landId: string; sowingDate: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const fit = { strong: 'default', moderate: 'gold', weak: 'warn' } as const
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-36 bg-paddy-900">
        <CropImage crop={r.crop} className="absolute inset-0" showCredit />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
        <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-end justify-between text-soil-50 [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">
          <h3 className="truncate font-display text-2xl font-semibold">{i18nText(r.crop.name, lang)}</h3>
          <span className="font-display text-3xl font-semibold tabular-nums">#{r.rank}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={fit[r.fit]}>{t(`ai.fit.${r.fit}`)}</Badge>
          <Badge variant="sky">{t(`ai.confidence.${r.confidence}`)}</Badge>
          <Badge variant="gold">{t('ai.badge')}</Badge>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ai.why')}</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {r.why.map((x) => <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-paddy-600" />{x}</li>)}
          </ul>
        </div>
        {r.risks.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ai.risks')}</h4>
            <ul className="mt-1 space-y-1 text-sm">
              {r.risks.map((x) => <li key={x} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange-600" />{x}</li>)}
            </ul>
          </div>
        )}
        {(r.sowing_window || r.water_plan) && (
          <dl className="grid gap-2 text-sm">
            {r.sowing_window && <div><dt className="text-xs text-muted-foreground">{t('ai.sowingWindow')}</dt><dd className="font-medium">{r.sowing_window}</dd></div>}
            {r.water_plan && <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Droplets className="size-3" />{t('ai.waterPlan')}</dt><dd>{r.water_plan}</dd></div>}
          </dl>
        )}
        {r.varieties.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ai.varieties')}</h4>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {r.varieties.map((v) => <Badge key={v.id} variant="soil">{v.name} · {v.duration_days} {t('common.days')}</Badge>)}
            </div>
          </div>
        )}
        <div className="mt-auto pt-1">
          <Button asChild className="w-full">
            <Link to={`/app/plans/new?land=${landId}&crop=${r.crop.slug}&date=${sowingDate}`}>{t('discover.plan')}</Link>
          </Button>
        </div>
      </div>
    </article>
  )
}
