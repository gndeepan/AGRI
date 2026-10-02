import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, FileDown, Plus } from 'lucide-react'
import { cyclesApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { qk, useCycle, useInputs, useIrrigation, useObservations, useTimeline } from '@/api/queries'
import type { InputApplication } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, Stat } from '@/components/common/PageHeader'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/common/States'
import { DataKindBadge } from '@/components/common/DataKindBadge'
import { formatDate, formatNumber, i18nText } from '@/lib/format'

const PIE = ['#355d2c', '#c9a24a', '#3d7ea6', '#8f6a3f', '#7fb069', '#b18a58']
const today = () => format(new Date(), 'yyyy-MM-dd')

export default function Records() {
  const { cycleId } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const cycle = useCycle(cycleId)
  const timeline = useTimeline(cycleId)
  const obs = useObservations(cycleId)
  const irr = useIrrigation(cycleId)
  const inputs = useInputs(cycleId)
  const [dialog, setDialog] = useState<null | 'observation' | 'irrigation' | 'input'>(null)

  const climate = useMemo(
    () =>
      (timeline.data ?? [])
        .filter((d) => d.weather && d.weather.kind === 'observed')
        .map((d) => ({ label: formatDate(d.date, 'd MMM', lang), rain: d.weather!.precipitation_mm, tmax: d.weather!.tmax_c, tmin: d.weather!.tmin_c })),
    [timeline.data, lang],
  )
  const costByType = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of inputs.data ?? []) m.set(i.input_type, (m.get(i.input_type) ?? 0) + (i.cost_inr ?? 0))
    return [...m.entries()].filter(([, v]) => v > 0).map(([k, v]) => ({ name: t(`records.inputTypes.${k}`), value: v }))
  }, [inputs.data, t])
  const totalCost = costByType.reduce((s, x) => s + x.value, 0)
  const totalWater = (irr.data ?? []).reduce((s, r) => s + (r.water_depth_mm ?? 0), 0)

  if (cycle.isError) return <ErrorState error={cycle.error} onRetry={() => cycle.refetch()} />

  return (
    <div className="space-y-6">
      <Link to={`/app/plans/${cycleId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t('records.backToField')}
      </Link>
      <PageHeader
        eyebrow={cycle.data ? `${i18nText(cycle.data.crop.name, lang)} · ${cycle.data.land_name}` : undefined}
        title={t('records.title')}
        subtitle={t('records.subtitle')}
        actions={<Button asChild variant="outline"><a href={cycleId ? cyclesApi.exportUrl(cycleId) : '#'} target="_blank" rel="noreferrer"><FileDown /> {t('field.exportPdf')}</a></Button>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('records.observations')} value={obs.data?.length ?? '—'} />
        <Stat label={t('records.irrigations')} value={irr.data?.length ?? '—'} hint={totalWater ? `${formatNumber(totalWater, 0)} mm` : undefined} />
        <Stat label={t('records.inputs')} value={inputs.data?.length ?? '—'} />
        <Stat label={t('records.totalCost')} value={`₹${formatNumber(totalCost, 0, lang)}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('records.rainTemp')}</CardTitle>
            <DataKindBadge kind="observed" />
          </CardHeader>
          <CardContent className="h-60">
            {climate.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('records.noObservedWeather')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={climate} margin={{ left: -18, right: 4 }}>
                  <CartesianGrid vertical={false} stroke="rgba(120,120,100,0.18)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} unit="mm" />
                  <ReTooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="rain" name={t('env.rain')} fill="#3d7ea6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('records.costs')}</CardTitle></CardHeader>
          <CardContent className="h-60">
            {costByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('records.noCosts')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={costByType} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {costByType.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <ReTooltip formatter={(v) => `₹${formatNumber(Number(v), 0)}`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="observations">
        <TabsList>
          <TabsTrigger value="observations">{t('records.observations')}</TabsTrigger>
          <TabsTrigger value="irrigation">{t('records.irrigations')}</TabsTrigger>
          <TabsTrigger value="inputs">{t('records.inputs')}</TabsTrigger>
        </TabsList>
        <TabsContent value="observations">
          <ListShell title={t('records.observations')} onAdd={() => setDialog('observation')} q={obs}>
            {(obs.data ?? []).map((o) => (
              <li key={o.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {formatDate(o.observed_on, 'd MMM yyyy', lang)}
                  {o.stage_key && <Badge>{t(`stages.${o.stage_key}`, { defaultValue: o.stage_key })}</Badge>}
                  {o.severity && <Badge variant={o.severity === 'high' ? 'danger' : o.severity === 'medium' ? 'warn' : 'outline'}>{t(`records.severity.${o.severity}`)}</Badge>}
                  <DataKindBadge kind="user_entered" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {o.plant_height_cm != null && <span>{t('records.height')}: {o.plant_height_cm} cm · </span>}
                  {o.pest_or_disease && <span>{o.pest_or_disease} · </span>}
                  {o.notes}
                </div>
              </li>
            ))}
          </ListShell>
        </TabsContent>
        <TabsContent value="irrigation">
          <ListShell title={t('records.irrigations')} onAdd={() => setDialog('irrigation')} q={irr}>
            {(irr.data ?? []).map((r) => (
              <li key={r.id} className="flex justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                <div>
                  <div className="font-medium">{formatDate(r.date, 'd MMM yyyy', lang)} · {r.method}</div>
                  {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                </div>
                <div className="text-right text-xs tabular-nums text-muted-foreground">
                  {r.duration_hours != null && <div>{r.duration_hours} h</div>}
                  {r.water_depth_mm != null && <div>{r.water_depth_mm} mm</div>}
                </div>
              </li>
            ))}
          </ListShell>
        </TabsContent>
        <TabsContent value="inputs">
          <ListShell title={t('records.inputs')} onAdd={() => setDialog('input')} q={inputs}>
            {(inputs.data ?? []).map((r: InputApplication) => (
              <li key={r.id} className="flex justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                <div>
                  <div className="font-medium">{r.product} <Badge variant="outline">{t(`records.inputTypes.${r.input_type}`)}</Badge></div>
                  <div className="text-xs text-muted-foreground">{formatDate(r.date, 'd MMM yyyy', lang)}{r.quantity != null ? ` · ${r.quantity} ${r.unit ?? ''}` : ''}</div>
                </div>
                {r.cost_inr != null && <div className="font-semibold tabular-nums">₹{formatNumber(r.cost_inr, 0, lang)}</div>}
              </li>
            ))}
          </ListShell>
        </TabsContent>
      </Tabs>
      {cycleId && <RecordDialog kind={dialog} onClose={() => setDialog(null)} cycleId={cycleId} stages={cycle.data?.stages.map((s) => ({ key: s.key, name: i18nText(s.name, lang) })) ?? []} />}
    </div>
  )
}

function ListShell({ title, onAdd, q, children }: { title: string; onAdd: () => void; q: { isPending: boolean; isError: boolean; error: unknown; refetch: () => void; data?: unknown[] }; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button size="sm" onClick={onAdd}><Plus /> {t('common.add')}</Button>
      </CardHeader>
      <CardContent>
        {q.isPending ? <CardSkeleton lines={3} className="border-0 p-0" /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data?.length === 0 ? <EmptyState title={t('records.empty')} className="py-6" /> : <ul className="space-y-2">{children}</ul>}
      </CardContent>
    </Card>
  )
}

function RecordDialog({ kind, onClose, cycleId, stages }: { kind: null | 'observation' | 'irrigation' | 'input'; onClose: () => void; cycleId: string; stages: { key: string; name: string }[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => (f.get(k) as string) || null
    const n = (k: string) => (f.get(k) ? Number(f.get(k)) : null)
    setSaving(true)
    try {
      if (kind === 'observation') {
        await cyclesApi.addObservation(cycleId, {
          observed_on: s('date')!, stage_key: s('stage_key'), plant_height_cm: n('height'), notes: s('notes') ?? '',
          pest_or_disease: s('pest'), severity: s('severity') as 'low' | 'medium' | 'high' | null,
        })
        qc.invalidateQueries({ queryKey: qk.observations(cycleId) })
        // A stage observation re-anchors the model.
        if (s('stage_key')) {
          qc.invalidateQueries({ queryKey: qk.cycle(cycleId) })
          qc.invalidateQueries({ queryKey: qk.timeline(cycleId) })
        }
      } else if (kind === 'irrigation') {
        await cyclesApi.addIrrigation(cycleId, { date: s('date')!, method: s('method') ?? 'flood', duration_hours: n('hours'), water_depth_mm: n('depth'), notes: s('notes') })
        qc.invalidateQueries({ queryKey: qk.irrigation(cycleId) })
      } else if (kind === 'input') {
        await cyclesApi.addInput(cycleId, {
          date: s('date')!, input_type: (s('type') ?? 'other') as InputApplication['input_type'], product: s('product') ?? '',
          quantity: n('quantity'), unit: s('unit'), cost_inr: n('cost'), notes: s('notes'),
        })
        qc.invalidateQueries({ queryKey: qk.inputs(cycleId) })
      }
      toast.success(t('records.saved'))
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{kind ? t(`records.add.${kind}`) : ''}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="r-date">{t('records.date')}</Label><Input id="r-date" name="date" type="date" defaultValue={today()} required /></div>
          {kind === 'observation' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="r-stage">{t('records.stageObserved')}</Label>
                <NativeSelect id="r-stage" name="stage_key" defaultValue="">
                  <option value="">{t('records.noStage')}</option>
                  {stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">{t('records.stageHint')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="r-h">{t('records.height')} (cm)</Label><Input id="r-h" name="height" type="number" min={0} max={600} step="0.1" /></div>
                <div className="space-y-1.5">
                  <Label htmlFor="r-sev">{t('records.severityLabel')}</Label>
                  <NativeSelect id="r-sev" name="severity" defaultValue="">
                    <option value="">—</option>
                    {(['low', 'medium', 'high'] as const).map((v) => <option key={v} value={v}>{t(`records.severity.${v}`)}</option>)}
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="r-pest">{t('records.pest')}</Label><Input id="r-pest" name="pest" maxLength={160} /></div>
            </>
          )}
          {kind === 'irrigation' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="r-m">{t('plan.irrigationMethod')}</Label>
                <NativeSelect id="r-m" name="method" defaultValue="flood">
                  {(['flood', 'awd', 'drip', 'sprinkler'] as const).map((m) => <option key={m} value={m}>{t(`plan.irrigation.${m}`)}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5"><Label htmlFor="r-hr">{t('records.hours')}</Label><Input id="r-hr" name="hours" type="number" min={0} step="0.1" /></div>
              <div className="space-y-1.5"><Label htmlFor="r-dp">{t('records.depth')}</Label><Input id="r-dp" name="depth" type="number" min={0} step="1" /></div>
            </div>
          )}
          {kind === 'input' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="r-t">{t('records.inputType')}</Label>
                  <NativeSelect id="r-t" name="type" defaultValue="fertilizer">
                    {(['fertilizer', 'pesticide', 'seed', 'labour', 'machinery', 'other'] as const).map((v) => <option key={v} value={v}>{t(`records.inputTypes.${v}`)}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5"><Label htmlFor="r-p">{t('records.product')}</Label><Input id="r-p" name="product" required maxLength={160} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label htmlFor="r-q">{t('records.quantity')}</Label><Input id="r-q" name="quantity" type="number" min={0} step="0.01" /></div>
                <div className="space-y-1.5"><Label htmlFor="r-u">{t('records.unit')}</Label><Input id="r-u" name="unit" maxLength={20} placeholder="kg" /></div>
                <div className="space-y-1.5"><Label htmlFor="r-c">{t('records.cost')}</Label><Input id="r-c" name="cost" type="number" min={0} step="1" /></div>
              </div>
              <p className="text-xs text-muted-foreground">{t('records.pesticideNote')}</p>
            </>
          )}
          <div className="space-y-1.5"><Label htmlFor="r-n">{t('map.notes')}</Label><Textarea id="r-n" name="notes" rows={2} maxLength={4000} /></div>
          <Button type="submit" disabled={saving}>{t('common.save')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
