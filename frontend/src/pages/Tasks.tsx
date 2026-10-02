import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { format, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { cyclesApi } from '@/api/endpoints'
import { qk, useCycles } from '@/api/queries'
import type { CycleDetail, TaskCategory, TaskOut } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/PageHeader'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/common/States'
import { formatDate, i18nText } from '@/lib/format'
import { cn } from '@/lib/utils'

const CATEGORIES: TaskCategory[] = ['irrigation', 'nutrient', 'weed', 'pest_scouting', 'field_prep', 'harvest', 'observation', 'custom']

export default function Tasks() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const qc = useQueryClient()
  const cycles = useCycles()
  const live = useMemo(() => (cycles.data ?? []).filter((c) => c.status === 'active' || c.status === 'planned'), [cycles.data])
  const taskQs = useQueries({ queries: live.map((c) => ({ queryKey: qk.tasks(c.id), queryFn: () => cyclesApi.tasks(c.id) })) })
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open')
  const [adding, setAdding] = useState(false)

  const cycleById = useMemo(() => new Map(live.map((c) => [c.id, c])), [live])
  const all = taskQs.flatMap((q) => q.data ?? [])
  const shown = all
    .filter((x) => (filter === 'open' ? x.status === 'pending' : filter === 'done' ? x.status !== 'pending' : true))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const today0 = startOfDay(new Date())
  const groups: [string, TaskOut[]][] = [
    ['overdue', shown.filter((x) => x.status === 'pending' && isBefore(parseISO(x.due_date), today0))],
    ['today', shown.filter((x) => isToday(parseISO(x.due_date)))],
    ['upcoming', shown.filter((x) => !isToday(parseISO(x.due_date)) && !(x.status === 'pending' && isBefore(parseISO(x.due_date), today0)))],
  ]

  async function setStatus(task: TaskOut, status: TaskOut['status']) {
    try {
      await cyclesApi.updateTask(task.id, { status })
      qc.invalidateQueries({ queryKey: qk.tasks(task.cycle_id) })
      qc.invalidateQueries({ queryKey: qk.timeline(task.cycle_id) })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    } catch {
      toast.error(t('errors.generic'))
    }
  }

  const loading = cycles.isPending || taskQs.some((q) => q.isPending)
  const failed = cycles.error ?? taskQs.find((q) => q.isError)?.error

  return (
    <div className="space-y-6">
      <PageHeader title={t('tasks.title')} subtitle={t('tasks.subtitle')} actions={live.length > 0 && <Button onClick={() => setAdding(true)}><Plus /> {t('tasks.add')}</Button>} />
      <div className="inline-flex rounded-full bg-muted p-1">
        {(['open', 'done', 'all'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={cn('rounded-full px-4 py-1.5 text-sm font-medium', filter === f ? 'bg-card shadow-sm' : 'text-muted-foreground')} aria-pressed={filter === f}>
            {t(`tasks.filter.${f}`)}
          </button>
        ))}
      </div>
      {failed ? (
        <ErrorState error={failed} onRetry={() => { cycles.refetch(); taskQs.forEach((q) => q.refetch()) }} />
      ) : loading ? (
        <CardSkeleton lines={6} />
      ) : live.length === 0 ? (
        <EmptyState title={t('tasks.noPlans')} body={t('tasks.noPlansBody')} action={<Button asChild><Link to="/app/plans/new">{t('land.newPlan')}</Link></Button>} />
      ) : shown.length === 0 ? (
        <EmptyState title={t('tasks.none')} />
      ) : (
        groups.filter(([, list]) => list.length > 0).map(([key, list]) => (
          <Card key={key}>
            <CardHeader><CardTitle className={cn(key === 'overdue' && 'text-orange-700 dark:text-orange-300')}>{t(`tasks.group.${key}`)} <span className="text-sm font-normal text-muted-foreground">({list.length})</span></CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {list.map((task) => {
                  const c = cycleById.get(task.cycle_id)
                  return (
                    <li key={task.id} className="flex items-start gap-3 py-3">
                      <input type="checkbox" className="mt-1 size-4 accent-paddy-700" checked={task.status === 'done'} onChange={(e) => setStatus(task, e.target.checked ? 'done' : 'pending')} aria-label={t('tasks.markDone', { title: task.title })} />
                      <div className="min-w-0 flex-1">
                        <div className={cn('font-medium', task.status !== 'pending' && 'text-muted-foreground line-through')}>{task.title}</div>
                        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{formatDate(task.due_date, 'EEE d MMM', lang)}{task.window_end ? ` – ${formatDate(task.window_end, 'd MMM', lang)}` : ''}</span>
                          <Badge variant="outline">{t(`tasks.category.${task.category}`)}</Badge>
                          {task.weather_sensitive && <Badge variant="sky">{t('tasks.weatherSensitive')}</Badge>}
                          {task.source === 'assistant_suggested' && <Badge variant="gold">{t('tasks.fromAssistant')}</Badge>}
                          {c && <Link to={`/app/plans/${c.id}`} className="hover:underline">{i18nText(c.crop.name, lang)} · {c.land_name}</Link>}
                        </div>
                      </div>
                      {task.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => setStatus(task, 'skipped')}>{t('tasks.skip')}</Button>}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
      <AddTaskDialog open={adding} onClose={() => setAdding(false)} cycles={live} />
    </div>
  )
}

function AddTaskDialog({ open, onClose, cycles }: { open: boolean; onClose: () => void; cycles: CycleDetail[] }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const cycleId = f.get('cycle') as string
    setBusy(true)
    try {
      await cyclesApi.createTask(cycleId, {
        title: f.get('title') as string,
        description: (f.get('description') as string) || '',
        category: f.get('category') as TaskCategory,
        due_date: f.get('due') as string,
        weather_sensitive: f.get('weather') === 'on',
      })
      qc.invalidateQueries({ queryKey: qk.tasks(cycleId) })
      qc.invalidateQueries({ queryKey: qk.timeline(cycleId) })
      toast.success(t('tasks.added'))
      onClose()
    } catch {
      toast.error(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('tasks.add')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-cycle">{t('tasks.plan')}</Label>
            <NativeSelect id="t-cycle" name="cycle" required>
              {cycles.map((c) => <option key={c.id} value={c.id}>{i18nText(c.crop.name, i18n.language)} · {c.land_name}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5"><Label htmlFor="t-title">{t('tasks.titleLabel')}</Label><Input id="t-title" name="title" required maxLength={200} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="t-due">{t('tasks.due')}</Label><Input id="t-due" name="due" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="t-cat">{t('tasks.categoryLabel')}</Label>
              <NativeSelect id="t-cat" name="category" defaultValue="custom">
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`tasks.category.${c}`)}</option>)}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="t-desc">{t('tasks.description')}</Label><Textarea id="t-desc" name="description" rows={2} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="weather" className="size-4 accent-paddy-700" /> {t('tasks.weatherSensitive')}</label>
          <Button type="submit" disabled={busy}>{t('common.save')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
