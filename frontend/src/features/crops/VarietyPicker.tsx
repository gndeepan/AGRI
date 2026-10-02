import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronsUpDown, Loader2, Search, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react'
import { cropsApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { qk } from '@/api/queries'
import type { Crop, Variety, VarietySuggestResult, VarietySuggestion } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { i18nText } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatRange, groupVarieties } from './search'

interface Props {
  crop: Crop
  value: string | undefined
  onChange: (id: string | undefined) => void
  region?: string | null
}

export function VarietyPicker({ crop, value, onChange, region }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = crop.varieties.find((v) => v.id === value)
  const groups = groupVarieties(crop.varieties, query)
  const total = groups.reduce((n, g) => n + g.items.length, 0)

  const pick = (id: string | undefined) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          id="variety"
          className="flex w-full items-center gap-3 rounded-xl border border-input bg-background px-3 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            {selected ? (
              <>
                <span className="flex items-center gap-1.5 font-medium">
                  {selected.name}
                  <VerifiedMark v={selected} />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatRange(selected.duration_range)} {t('common.days')}
                  {selected.grain_type ? ` · ${selected.grain_type}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="block font-medium">{t('plan.varietyUnknown')}</span>
                <span className="block text-xs text-muted-foreground">
                  {crop.varieties.length > 0 ? t('variety.browse', { count: crop.varieties.length }) : t('variety.noneInCatalog')}
                </span>
              </>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('variety.title', { crop: i18nText(crop.name, 'en') })}</DialogTitle>
          <DialogDescription>{t('variety.subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('variety.searchPlaceholder')}
            className="pl-9"
            aria-label={t('variety.searchPlaceholder')}
          />
        </div>

        <div className="mt-3 max-h-[52dvh] space-y-4 overflow-y-auto pr-1">
          {!query && (
            <Row active={!value} onClick={() => pick(undefined)}>
              <span className="font-medium">{t('plan.varietyUnknown')}</span>
              <span className="text-xs text-muted-foreground">{t('plan.varietyUnknownHint')}</span>
            </Row>
          )}
          {groups.map((g) => (
            <section key={g.group}>
              <h3 className="sticky top-0 z-10 bg-card/95 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                {t(`variety.group.${g.group}`)} <span className="font-normal">({g.items.length})</span>
              </h3>
              <ul className="mt-1 space-y-1.5">
                {g.items.map((v) => (
                  <li key={v.id}>
                    <VarietyRow v={v} active={v.id === value} onClick={() => pick(v.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {query && total === 0 && <p className="py-2 text-sm text-muted-foreground">{t('variety.noMatch', { query })}</p>}
          {query.trim().length >= 2 && (
            <AskAi key={query.trim().toLowerCase()} crop={crop} query={query.trim()} region={region} onUse={pick} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-xl border p-3 text-left text-sm transition',
        active ? 'border-paddy-600 ring-2 ring-paddy-500/50' : 'border-border hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

function VerifiedMark({ v }: { v: Variety }) {
  const { t } = useTranslation()
  return v.verified ? (
    <ShieldCheck className="size-3.5 text-paddy-600" aria-label={t('variety.verified')} />
  ) : (
    <ShieldAlert className="size-3.5 text-orange-600" aria-label={t('variety.unverified')} />
  )
}

function VarietyRow({ v, active, onClick }: { v: Variety; active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const aliases = v.aliases.filter((a) => !v.name.includes(a)).slice(0, 3)
  return (
    <Row active={active} onClick={onClick}>
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{v.name}</span>
        <VerifiedMark v={v} />
        {active && <Check className="ml-auto size-4 text-paddy-600" />}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{formatRange(v.duration_range)} {t('common.days')}</span>
        <span>· {t(`plan.duration.${v.duration_group}`)}</span>
        {v.grain_type && <span>· {v.grain_type}</span>}
        {v.release_year && <span>· {v.release_year}</span>}
      </span>
      {(aliases.length > 0 || v.seasons.length > 0 || v.seasons_text || v.source !== 'catalog') && (
        <span className="mt-1 flex flex-wrap gap-1">
          {v.seasons.map((s) => <Badge key={s} variant="soil">{t(`variety.season.${s}`, { defaultValue: s })}</Badge>)}
          {v.seasons_text && <Badge variant="soil">{v.seasons_text}</Badge>}
          {aliases.map((a) => <Badge key={a} variant="outline">{a}</Badge>)}
          {v.source === 'ai_suggested' && <Badge variant="warn"><Sparkles className="size-3" />{t('variety.aiSaved')}</Badge>}
          {v.source === 'user' && <Badge variant="sky">{t('variety.yours')}</Badge>}
          {!v.verified && v.source === 'catalog' && <Badge variant="warn">{t('variety.approximate')}</Badge>}
        </span>
      )}
      {v.notes && <span className="mt-1 text-xs text-muted-foreground">{v.notes}</span>}
    </Row>
  )
}

function AskAi({ crop, query, region, onUse }: { crop: Crop; query: string; region?: string | null; onUse: (id: string) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [result, setResult] = useState<VarietySuggestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ask = async (forceAi = false) => {
    setState('loading')
    setError(null)
    try {
      setResult(await cropsApi.suggestVariety(crop.slug, { name: query, region, force_ai: forceAi }))
      setState('done')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'))
      setState('idle')
    }
  }

  const saved = async (draft: VarietySuggestion, name: string, range: [number, number]) => {
    try {
      const v = await cropsApi.createVariety(crop.slug, {
        name, duration_days_range: range, grain_type: draft.grain_type, aliases: draft.aliases.slice(0, 10),
        regions: draft.regions.slice(0, 10), notes: draft.notes || null, source: 'ai_suggested',
        ai_model: draft.model, ai_confidence: draft.confidence,
      })
      await qc.invalidateQueries({ queryKey: qk.crops })
      toast.success(t('variety.savedToast', { name: v.name }))
      onUse(v.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.generic'))
    }
  }

  if (state !== 'done' || !result) {
    return (
      <div className="rounded-xl border border-dashed border-sun-500/60 bg-sun-300/10 p-3">
        <Button type="button" variant="outline" size="sm" onClick={() => ask()} disabled={state === 'loading'}>
          {state === 'loading' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-sun-600" />}
          {state === 'loading' ? t('variety.asking') : t('variety.askAi', { query })}
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">{t('variety.askAiHint')}</p>
        {error && <p role="alert" className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-sun-500/60 bg-sun-300/10 p-3">
      {result.matches.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t('variety.didYouMean')}</p>
          <ul className="mt-1.5 space-y-1.5">
            {result.matches.map((m) => (
              <li key={m.id}><VarietyRow v={m} active={false} onClick={() => onUse(m.id)} /></li>
            ))}
          </ul>
          {!result.suggestion && (
            <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => ask(true)}>
              <Sparkles className="size-4" /> {t('variety.askAnyway')}
            </Button>
          )}
        </div>
      )}
      {result.suggestion && <SuggestionCard key={result.suggestion.name} s={result.suggestion} onSave={saved} />}
    </div>
  )
}

function SuggestionCard({ s, onSave }: { s: VarietySuggestion; onSave: (s: VarietySuggestion, name: string, range: [number, number]) => Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState(s.name)
  const [lo, setLo] = useState(s.duration_days_range[0])
  const [hi, setHi] = useState(s.duration_days_range[1])
  const [busy, setBusy] = useState(false)
  const valid = name.trim().length >= 2 && lo >= 30 && hi >= lo && hi <= 400

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg bg-orange-100 p-2.5 text-xs text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span><strong>{t('variety.aiLabel')}</strong> {t('variety.aiWarning')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant={s.confidence === 'high' ? 'default' : s.confidence === 'medium' ? 'gold' : 'warn'}>
          {t('variety.confidence', { level: t(`variety.level.${s.confidence}`) })}
        </Badge>
        {!s.recognized && <Badge variant="warn">{t('variety.notRecognized')}</Badge>}
        <span className="text-muted-foreground">{t('variety.model', { model: s.model })}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-1">
          <Label htmlFor="ai-name">{t('variety.name')}</Label>
          <Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-lo">{t('variety.minDays')}</Label>
          <Input id="ai-lo" type="number" min={30} max={400} value={lo} onChange={(e) => setLo(Number(e.target.value))} className="w-24" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-hi">{t('variety.maxDays')}</Label>
          <Input id="ai-hi" type="number" min={30} max={400} value={hi} onChange={(e) => setHi(Number(e.target.value))} className="w-24" />
        </div>
      </div>
      <dl className="grid gap-1 text-xs sm:grid-cols-2">
        {s.grain_type && <Detail label={t('variety.grain')}>{s.grain_type}</Detail>}
        {s.typical_seasons.length > 0 && <Detail label={t('variety.seasons')}>{s.typical_seasons.join(', ')}</Detail>}
        {s.regions.length > 0 && <Detail label={t('variety.regions')}>{s.regions.join(', ')}</Detail>}
        {s.institute && <Detail label={t('variety.institute')}>{s.institute}</Detail>}
      </dl>
      {s.notes && <p className="text-sm">{s.notes}</p>}
      {(s.caveats.length > 0 || s.sources_hint.length > 0) && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {s.caveats.map((c) => <li key={c}>{c}</li>)}
          {s.sources_hint.length > 0 && <li>{t('variety.verifyWith', { sources: s.sources_hint.join('; ') })}</li>}
        </ul>
      )}
      <Button
        type="button"
        size="sm"
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true)
          await onSave(s, name.trim(), [lo, hi])
          setBusy(false)
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t('variety.useThis')}
      </Button>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="inline text-muted-foreground">{label}: </dt>
      <dd className="inline">{children}</dd>
    </div>
  )
}
