import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import type { AreaUnit, LandMetrics } from '@/api/types'
import { formatArea, formatCoord, formatM2, formatMeters, formatNumber } from '@/lib/format'
import { Badge } from '@/components/ui/badge'

export function MetricsPanel({ metrics, unit, source }: { metrics: LandMetrics; unit: AreaUnit; source: 'server' | 'preview' }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const other: AreaUnit = unit === 'acre' ? 'hectare' : 'acre'
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{t('map.area')}</div>
          <div className="font-display text-3xl font-semibold tabular-nums">{formatArea(metrics, unit, lang)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatArea(metrics, other, lang)} · {formatM2(metrics.area_m2, lang)}
          </div>
        </div>
        <Badge variant={source === 'server' ? 'default' : 'outline'}>{source === 'server' ? t('map.geodesicServer') : t('map.preview')}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t('map.perimeter')}</dt>
          <dd className="tabular-nums">{formatMeters(metrics.perimeter_m, lang)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('map.vertices')}</dt>
          <dd className="tabular-nums">{formatNumber(metrics.vertex_count, 0, lang)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">{t('map.centroid')}</dt>
          <dd className="font-mono text-xs tabular-nums">
            {formatCoord(metrics.centroid.lat, 'lat')}, {formatCoord(metrics.centroid.lon, 'lon')}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">{t('map.bbox')}</dt>
          <dd className="font-mono text-[11px] leading-relaxed tabular-nums text-muted-foreground">
            {metrics.bbox.map((v) => v.toFixed(5)).join(', ')}
          </dd>
        </div>
      </dl>
      <p className="flex gap-2 rounded-xl bg-soil-100/70 p-3 text-xs leading-relaxed text-soil-800 dark:bg-soil-800/40 dark:text-soil-100">
        <Info className="mt-0.5 size-3.5 shrink-0" /> {t('map.disclaimer')}
      </p>
    </div>
  )
}
