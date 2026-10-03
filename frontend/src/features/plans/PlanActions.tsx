import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import * as Popover from '@radix-ui/react-popover'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cyclesApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { useCrops } from '@/api/queries'
import type { CycleDetail } from '@/api/types'
import { planEditSchema, type PlanEditInput } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { FormField } from '@/components/common/Field'
import { VarietyPicker } from '@/features/crops/VarietyPicker'
import { i18nText } from '@/lib/format'
import { cn } from '@/lib/utils'

const IRRIGATION = ['flood', 'awd', 'drip', 'sprinkler', 'rainfed'] as const
const WATER = ['assured', 'limited', 'rainfed'] as const

/** Everything a plan change can touch: lists, the plan, its timeline/tasks, the field and dashboard. */
export function useInvalidatePlan() {
  const qc = useQueryClient()
  return (cycleId: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['cycles'] }),
      qc.invalidateQueries({ queryKey: ['cycle', cycleId] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      qc.invalidateQueries({ queryKey: ['lands'] }),
      qc.invalidateQueries({ queryKey: ['notifications'] }),
    ])
}

function defaults(c: CycleDetail): PlanEditInput {
  return {
    variety_id: c.variety?.id ?? undefined,
    method: c.method,
    anchor_type: c.anchor_type,
    anchor_date: c.anchor_date,
    nursery_sowing_date: c.nursery_sowing_date ?? undefined,
    irrigation_method: c.irrigation_method,
    water_availability: c.water_availability,
    planting_density: c.planting_density ?? undefined,
    notes: c.notes ?? undefined,
  }
}

export function EditPlanDialog({ cycle, open, onOpenChange }: { cycle: CycleDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const invalidate = useInvalidatePlan()
  const crops = useCrops()
  // The catalog query includes the farmer's own varieties; fall back to the plan's embedded crop.
  const crop = crops.data?.find((c) => c.slug === cycle.crop.slug) ?? cycle.crop
  const { register, handleSubmit, control, setValue, reset, formState } = useForm<PlanEditInput>({
    resolver: zodResolver(planEditSchema),
    defaultValues: defaults(cycle),
  })
  const method = useWatch({ control, name: 'method' })

  useEffect(() => {
    if (open) reset(defaults(cycle))
  }, [open, cycle, reset])
  useEffect(() => {
    setValue('anchor_type', method === 'transplanting' ? 'transplanting' : 'sowing')
  }, [method, setValue])

  const e = (k: keyof PlanEditInput) => {
    const m = formState.errors[k]?.message
    return m ? t(m) : undefined
  }

  const onSubmit = handleSubmit(async (v) => {
    try {
      await cyclesApi.update(cycle.id, {
        ...v,
        variety_id: v.variety_id || null,
        nursery_sowing_date: v.method === 'transplanting' ? v.nursery_sowing_date || null : null,
        planting_density: v.planting_density || null,
        notes: v.notes || null,
      })
      await invalidate(cycle.id)
      toast.success(t('plan.actions.saved'))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.generic'))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('plan.actions.editTitle')}</DialogTitle>
          <DialogDescription>
            {i18nText(crop.name, i18n.language)} · {cycle.land_name}. {t('plan.actions.editSubtitle')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate aria-label={t('plan.actions.editTitle')}>
          <div className="sm:col-span-2">
            <FormField id="edit-variety" label={t('plan.variety')} hint={t('plan.varietyHint')}>
              <Controller
                control={control}
                name="variety_id"
                render={({ field }) => <VarietyPicker crop={crop} value={field.value} onChange={field.onChange} />}
              />
            </FormField>
          </div>
          <FormField id="edit-method" label={t('plan.method')} error={e('method')}>
            <NativeSelect id="edit-method" {...register('method')}>
              {(crop.methods.length ? crop.methods : [cycle.method]).map((m) => (
                <option key={m} value={m}>{t(`plan.methods.${m}`)}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="edit-anchor" label={t(method === 'transplanting' ? 'plan.transplantDate' : 'plan.sowingDate')} error={e('anchor_date')}>
            <Input id="edit-anchor" type="date" {...register('anchor_date')} />
          </FormField>
          {method === 'transplanting' && (
            <FormField id="edit-nursery" label={t('plan.nurseryDate')} error={e('nursery_sowing_date')} hint={t('plan.nurseryHint')}>
              <Input id="edit-nursery" type="date" {...register('nursery_sowing_date')} />
            </FormField>
          )}
          <input type="hidden" {...register('anchor_type')} />
          {e('anchor_type') && <p className="text-xs text-destructive sm:col-span-2">{e('anchor_type')}</p>}
          <FormField id="edit-irrm" label={t('plan.irrigationMethod')}>
            <NativeSelect id="edit-irrm" {...register('irrigation_method')}>
              {IRRIGATION.map((m) => <option key={m} value={m}>{t(`plan.irrigation.${m}`)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="edit-water" label={t('plan.waterAvailability')}>
            <NativeSelect id="edit-water" {...register('water_availability')}>
              {WATER.map((m) => <option key={m} value={m}>{t(`water.${m}`)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="edit-density" label={t('plan.density')} hint={t('plan.densityHint')}>
            <Input id="edit-density" {...register('planting_density')} placeholder="20 × 15 cm" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="edit-notes" label={t('map.notes')}><Textarea id="edit-notes" rows={2} {...register('notes')} /></FormField>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('plan.actions.cancel')}</Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? t('common.pleaseWait') : t('plan.actions.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeletePlanDialog({
  cycle,
  open,
  onOpenChange,
  onDeleted,
}: {
  cycle: CycleDetail
  open: boolean
  onOpenChange: (o: boolean) => void
  onDeleted?: () => void
}) {
  const { t, i18n } = useTranslation()
  const invalidate = useInvalidatePlan()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await cyclesApi.remove(cycle.id)
      qc.removeQueries({ queryKey: ['cycle', cycle.id] })
      await invalidate(cycle.id)
      toast.success(t('plan.actions.deleted'))
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle>{t('plan.actions.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('plan.actions.deleteBody', { crop: i18nText(cycle.crop.name, i18n.language), field: cycle.land_name })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('plan.actions.cancel')}</Button>
          <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={busy}>
            <Trash2 /> {busy ? t('common.pleaseWait') : t('plan.actions.deleteConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "⋯" menu with Edit / Delete for one plan. `afterDeletePath` navigates away when the current page
 * shows the deleted plan.
 */
export function PlanActionsMenu({
  cycle,
  afterDeletePath,
  variant = 'default',
  className,
}: {
  cycle: CycleDetail
  afterDeletePath?: string
  variant?: 'default' | 'glass'
  className?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null)
  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted'

  return (
    <>
      <Popover.Root open={menu} onOpenChange={setMenu}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={t('plan.actions.menu')}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2',
              variant === 'glass'
                ? 'border border-white/25 bg-black/30 text-white backdrop-blur-md hover:bg-black/45 focus-visible:ring-white/60'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring',
              className,
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            collisionPadding={12}
            onClick={(e) => e.stopPropagation()}
            className="z-[1000] w-48 rounded-xl border border-border bg-card p-1 shadow-xl outline-none"
          >
            <button type="button" className={item} onClick={() => { setMenu(false); setDialog('edit') }}>
              <Pencil className="size-4" /> {t('plan.actions.edit')}
            </button>
            <button type="button" className={cn(item, 'text-destructive')} onClick={() => { setMenu(false); setDialog('delete') }}>
              <Trash2 className="size-4" /> {t('plan.actions.delete')}
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <EditPlanDialog cycle={cycle} open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} />
      <DeletePlanDialog
        cycle={cycle}
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        onDeleted={afterDeletePath ? () => navigate(afterDeletePath) : undefined}
      />
    </>
  )
}
