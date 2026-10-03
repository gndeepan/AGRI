import { useEffect, useMemo, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { Map as MLMap } from 'maplibre-gl'
import { Loader2 } from 'lucide-react'
import { useWaterSources } from '@/api/queries'
import { KIND_COLOR, WATER_KINDS, formatDistance } from './format'
import { useWaterLabels } from './useWaterLabels'
import { addWaterLayers, bindWaterPopup, setWaterData, setWaterVisible, waterToCollections } from './waterLayers'

const MAP_RADIUS_M = 5000

/**
 * Keeps the water layers of an existing MapLibre map in sync with the selected field.
 * `ready` must flip to true only after the map's style has loaded.
 */
export function useWaterMapLayer(mapRef: RefObject<MLMap | null>, ready: boolean, landId: string | null, enabled: boolean) {
  const { i18n } = useTranslation()
  const labels = useWaterLabels()
  const query = useWaterSources(landId ?? undefined, MAP_RADIUS_M, enabled && !!landId)
  const collections = useMemo(
    () => (query.data ? waterToCollections(query.data.sources, i18n.language, labels) : null),
    [query.data, i18n.language, labels],
  )

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    addWaterLayers(map, 'lands-fill')
    return bindWaterPopup(map, labels)
  }, [ready, mapRef, labels])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !map.getLayer('water-area-fill')) return
    setWaterData(map, enabled && landId ? collections : null)
    setWaterVisible(map, enabled && !!landId)
  }, [ready, mapRef, enabled, landId, collections])

  return query
}

/** Compact legend (only kinds present) + loading / error / empty hints. */
export function WaterLegend({
  query,
  className,
}: {
  query: ReturnType<typeof useWaterSources>
  className?: string
}) {
  const { t } = useTranslation()
  const counts = query.data?.counts_by_kind ?? {}
  const nearest = query.data?.sources[0]
  return (
    <div className={className} aria-live="polite">
      <div className="max-w-[15rem] rounded-xl border border-border bg-card/95 p-2.5 text-xs shadow-lg backdrop-blur">
        <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
          {t('waterSources.mapLegend')}
          {query.isFetching && <Loader2 className="size-3 animate-spin" />}
        </div>
        {query.isError ? (
          <button type="button" onClick={() => query.refetch()} className="text-left text-destructive underline">
            {t('waterSources.error')} {t('waterSources.retry')}
          </button>
        ) : query.data && query.data.sources.length === 0 ? (
          <p className="text-muted-foreground">{t('waterSources.empty', { km: MAP_RADIUS_M / 1000 })}</p>
        ) : (
          <>
            <ul className="space-y-0.5">
              {WATER_KINDS.filter((k) => counts[k]).map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: KIND_COLOR[k] }} aria-hidden />
                  <span className="flex-1">{t(`waterSources.kind.${k}`).split(' (')[0]}</span>
                  <span className="tabular-nums text-muted-foreground">{counts[k]}</span>
                </li>
              ))}
            </ul>
            {nearest && (
              <p className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground">
                {t('waterSources.nearest', {
                  name: nearest.name ?? t(`waterSources.kind.${nearest.kind}`).split(' (')[0],
                  distance: nearest.adjoining ? t('waterSources.adjoining') : formatDistance(nearest.distance_m),
                  dir: nearest.direction && !nearest.adjoining ? t('waterSources.toThe', { dir: t(`waterSources.dir.${nearest.direction}`) }) : '',
                })}
              </p>
            )}
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: '#f2c14e' }} aria-hidden />
              {t('waterSources.fieldLabel')} →
            </p>
          </>
        )}
      </div>
    </div>
  )
}
