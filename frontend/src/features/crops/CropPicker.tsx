import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import type { Crop } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { i18nText } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CropImage } from './CropImage'
import { cropMatches } from './search'

const CATEGORY_ORDER = ['cereal', 'millet', 'pulse', 'oilseed', 'vegetable', 'spice', 'fruit', 'tuber', 'fibre', 'cash', 'plantation']

export function CropPicker({ crops, value, onChange }: { crops: Crop[]; value: string; onChange: (slug: string) => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const selected = crops.find((c) => c.slug === value)

  const categories = useMemo(() => CATEGORY_ORDER.filter((c) => crops.some((x) => x.category === c)), [crops])
  const shown = crops
    .filter((c) => (category ? c.category === category : true) && cropMatches(c, query))
    .sort(
      (a, b) =>
        Number(b.plannable !== false) - Number(a.plannable !== false) || i18nText(a.name, lang).localeCompare(i18nText(b.name, lang)),
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          id="crop"
          className="flex w-full items-center gap-3 rounded-xl border border-input bg-background p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {selected ? (
            <>
              <CropImage crop={selected} className="size-12 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i18nText(selected.name, lang)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {selected.duration_days[0]}–{selected.duration_days[1]} {t('common.days')} · {t(`crops.category.${selected.category}`)}
                </span>
              </span>
            </>
          ) : (
            <span className="flex-1 px-1 text-muted-foreground">{t('crops.choose')}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('crops.pickerTitle')}</DialogTitle>
          <DialogDescription>{t('crops.pickerSubtitle', { count: crops.length })}</DialogDescription>
        </DialogHeader>
        <div className="sticky -top-6 z-20 -mx-6 bg-card px-6 pb-3 pt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('crops.searchPlaceholder')}
              className="pl-9"
              aria-label={t('crops.searchPlaceholder')}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t('crops.categoryFilter')}>
            <FilterChip active={category === null} onClick={() => setCategory(null)}>
              {t('crops.all')}
            </FilterChip>
            {categories.map((c) => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                {t(`crops.category.${c}`)}
              </FilterChip>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('crops.noMatch')}</p>
        ) : (
          <ul className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((c) => {
              const disabled = c.plannable === false
              const active = c.slug === value
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(c.slug)
                      setOpen(false)
                    }}
                    className={cn(
                      'group relative flex w-full flex-col overflow-hidden rounded-xl border text-left transition',
                      active ? 'border-paddy-600 ring-2 ring-paddy-500/50' : 'border-border hover:border-paddy-400',
                      disabled && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <CropImage crop={c} className="aspect-[4/3] w-full" />
                    {active && <Check className="absolute right-2 top-2 size-5 rounded-full bg-paddy-600 p-0.5 text-white" />}
                    <span className="p-2.5">
                      <span className="block truncate text-sm font-semibold">{c.name.en}</span>
                      <span className="block truncate text-xs text-muted-foreground" lang="ta">
                        {c.name.ta}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline">
                          {c.duration_days[0]}–{c.duration_days[1]} {t('common.days')}
                        </Badge>
                        {c.varieties.length > 0 && (
                          <Badge variant="soil">
                            {t('crops.varietyCount', {
                              count: c.varieties.length,
                            })}
                          </Badge>
                        )}
                        {disabled && <Badge variant="warn">{t('crops.notPlannable')}</Badge>}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition',
        active ? 'border-paddy-700 bg-paddy-700 text-white' : 'border-border hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}
