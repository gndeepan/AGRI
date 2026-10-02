import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Info, Sprout } from 'lucide-react'
import { cyclesApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { useCrops, useLands } from '@/api/queries'
import { planSchema, type PlanInput } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { CropPicker } from '@/features/crops/CropPicker'
import { VarietyPicker } from '@/features/crops/VarietyPicker'
import { PageHeader } from '@/components/common/PageHeader'
import { FormField } from '@/components/common/Field'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/common/States'
import { formatDate, i18nText } from '@/lib/format'

export default function PlanNew() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const lands = useLands()
  const crops = useCrops()

  const { register, handleSubmit, control, setValue, formState } = useForm<PlanInput>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      land_id: params.get('land') ?? '',
      crop_slug: params.get('crop') ?? 'paddy',
      method: 'transplanting',
      anchor_type: 'transplanting',
      anchor_date: params.get('date') ?? format(new Date(), 'yyyy-MM-dd'),
      irrigation_method: 'flood',
      water_availability: 'assured',
    },
  })
  const cropSlug = useWatch({ control, name: 'crop_slug' })
  const method = useWatch({ control, name: 'method' })
  const anchorDate = useWatch({ control, name: 'anchor_date' })
  const varietyId = useWatch({ control, name: 'variety_id' })
  const crop = useMemo(() => crops.data?.find((c) => c.slug === cropSlug), [crops.data, cropSlug])
  const variety = crop?.varieties.find((v) => v.id === varietyId)

  // Keep the anchor type consistent with the method.
  useEffect(() => {
    setValue('anchor_type', method === 'transplanting' ? 'transplanting' : 'sowing')
  }, [method, setValue])
  // Default to the crop's first method when switching crops.
  useEffect(() => {
    if (crop && !crop.methods.includes(method)) setValue('method', (crop.methods[0] ?? 'sowing') as PlanInput['method'])
    setValue('variety_id', undefined)
  }, [crop?.slug]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only when the crop changes, not on refetch

  const e = (k: keyof PlanInput) => {
    const m = formState.errors[k]?.message
    return m ? t(m) : undefined
  }

  const onSubmit = handleSubmit(async (v) => {
    try {
      const cycle = await cyclesApi.create({
        ...v,
        variety_id: v.variety_id || null,
        nursery_sowing_date: v.method === 'transplanting' ? v.nursery_sowing_date || null : null,
        planting_density: v.planting_density || null,
        notes: v.notes || null,
      })
      qc.invalidateQueries({ queryKey: ['cycles'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['lands'] })
      toast.success(t('plan.created'))
      navigate(`/app/plans/${cycle.id}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.generic'))
    }
  })

  if (lands.isPending || crops.isPending) return <CardSkeleton lines={8} />
  if (lands.isError) return <ErrorState error={lands.error} onRetry={() => lands.refetch()} />
  if (crops.isError) return <ErrorState error={crops.error} onRetry={() => crops.refetch()} />
  if (lands.data.length === 0)
    return <EmptyState title={t('dashboard.noFieldsTitle')} body={t('plan.needField')} action={<Button onClick={() => navigate('/app/map')}>{t('dashboard.drawFirst')}</Button>} />

  const roughHarvest = anchorDate && (variety || crop)
    ? addDays(parseISO(anchorDate), variety ? variety.duration_days - (method === 'transplanting' ? 25 : 0) : crop!.duration_days[0])
    : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow={t('plan.eyebrow')} title={t('plan.title')} subtitle={t('plan.subtitle')} />
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Card>
          <CardHeader><CardTitle>{t('plan.whereWhat')}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="land" label={t('plan.field')} error={e('land_id')}>
              <NativeSelect id="land" {...register('land_id')}>
                <option value="">{t('plan.chooseField')}</option>
                {lands.data.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </NativeSelect>
            </FormField>
            <FormField id="crop" label={t('plan.crop')} error={e('crop_slug')}>
              <Controller
                control={control}
                name="crop_slug"
                render={({ field }) => <CropPicker crops={crops.data} value={field.value} onChange={field.onChange} />}
              />
            </FormField>
            {crop?.plannable === false && (
              <p role="alert" className="flex gap-2 rounded-xl bg-orange-100 p-3 text-sm text-orange-900 sm:col-span-2 dark:bg-orange-900/40 dark:text-orange-100">
                <Info className="mt-0.5 size-4 shrink-0" /> {i18nText(crop.description, lang)}
              </p>
            )}
            {crop && (
              <div className="sm:col-span-2">
                <FormField id="variety" label={t('plan.variety')} hint={t('plan.varietyHint')}>
                  <Controller
                    control={control}
                    name="variety_id"
                    render={({ field }) => <VarietyPicker crop={crop} value={field.value} onChange={field.onChange} />}
                  />
                </FormField>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('plan.howWhen')}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="method" label={t('plan.method')} error={e('method')}>
              <NativeSelect id="method" {...register('method')}>
                {(crop?.methods.length ? crop.methods : ['transplanting', 'direct_seeding_wet', 'direct_seeding_dry', 'sowing']).map((m) => (
                  <option key={m} value={m}>{t(`plan.methods.${m}`)}</option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="anchor" label={t(method === 'transplanting' ? 'plan.transplantDate' : 'plan.sowingDate')} error={e('anchor_date')}>
              <Input id="anchor" type="date" {...register('anchor_date')} />
            </FormField>
            {method === 'transplanting' && (
              <FormField id="nursery" label={t('plan.nurseryDate')} error={e('nursery_sowing_date')} hint={t('plan.nurseryHint')}>
                <Input id="nursery" type="date" {...register('nursery_sowing_date')} />
              </FormField>
            )}
            <input type="hidden" {...register('anchor_type')} />
            {e('anchor_type') && <p className="text-xs text-destructive">{e('anchor_type')}</p>}
            <FormField id="irrm" label={t('plan.irrigationMethod')}>
              <NativeSelect id="irrm" {...register('irrigation_method')}>
                {(['flood', 'awd', 'drip', 'sprinkler', 'rainfed'] as const).map((m) => <option key={m} value={m}>{t(`plan.irrigation.${m}`)}</option>)}
              </NativeSelect>
            </FormField>
            <FormField id="water" label={t('plan.waterAvailability')}>
              <NativeSelect id="water" {...register('water_availability')}>
                {(['assured', 'limited', 'rainfed'] as const).map((m) => <option key={m} value={m}>{t(`water.${m}`)}</option>)}
              </NativeSelect>
            </FormField>
            <FormField id="density" label={t('plan.density')} hint={t('plan.densityHint')}>
              <Input id="density" {...register('planting_density')} placeholder="20 × 15 cm" />
            </FormField>
            <div className="sm:col-span-2">
              <FormField id="notes" label={t('map.notes')}><Textarea id="notes" rows={2} {...register('notes')} /></FormField>
            </div>
          </CardContent>
        </Card>

        {roughHarvest && (
          <div className="flex gap-3 rounded-2xl border border-sun-500/40 bg-sun-300/15 p-4 text-sm">
            <Sprout className="mt-0.5 size-5 shrink-0 text-sun-600" />
            <div>
              <p>{t('plan.roughHarvest', { date: formatDate(roughHarvest, 'd MMM yyyy', lang) })}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Info className="size-3" /> {t('plan.roughHarvestNote')}</p>
            </div>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting || crop?.plannable === false}>
          {formState.isSubmitting ? t('common.pleaseWait') : t('plan.create')}
        </Button>
      </form>
    </div>
  )
}
