import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, MapPin, Search, X } from 'lucide-react'
import { geoApi } from '@/api/endpoints'
import type { GeoSearchResult } from '@/api/types'
import { cn } from '@/lib/utils'

export function SearchBox({ onPick, className }: { onPick: (r: GeoSearchResult) => void; className?: string }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const ctrl = useRef<AbortController | null>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) {
      setResults([])
      return
    }
    // Debounced: the backend proxies Nominatim, which allows ~1 request/second.
    const h = setTimeout(async () => {
      ctrl.current?.abort()
      ctrl.current = new AbortController()
      setLoading(true)
      setError(false)
      try {
        setResults(await geoApi.search(term, ctrl.current.signal))
        setOpen(true)
        setActive(-1)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(true)
      } finally {
        setLoading(false)
      }
    }, 600)
    return () => clearTimeout(h)
  }, [q])

  function pick(r: GeoSearchResult) {
    onPick(r)
    setOpen(false)
    setQ(r.name ?? r.display_name ?? '')
  }

  return (
    <div className={cn('relative', className)}>
      <div className="glass flex h-12 items-center gap-2 rounded-full px-4 shadow-lg">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
            else if (e.key === 'Enter' && results[active >= 0 ? active : 0]) pick(results[active >= 0 ? active : 0])
            else if (e.key === 'Escape') setOpen(false)
          }}
          placeholder={t('map.searchPlaceholder')}
          aria-label={t('map.searchPlaceholder')}
          role="combobox"
          aria-expanded={open}
          aria-controls="geo-results"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : q ? (
          <button type="button" onClick={() => { setQ(''); setResults([]) }} aria-label={t('common.clear')}>
            <X className="size-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>
      {open && (results.length > 0 || error) && (
        <ul id="geo-results" role="listbox" className="absolute inset-x-0 top-14 z-20 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-xl">
          {error && <li className="px-3 py-2 text-sm text-destructive">{t('map.searchError')}</li>}
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lon},${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onClick={() => pick(r)}
                className={cn('flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted', i === active && 'bg-muted')}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-paddy-600" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name ?? r.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.display_name}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 pb-1 pt-2 text-[10px] text-muted-foreground">{t('map.searchAttribution')}</li>
        </ul>
      )}
    </div>
  )
}
