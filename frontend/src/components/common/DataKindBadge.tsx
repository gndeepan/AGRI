import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import type { DataKind, Provenance } from '@/api/types'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { formatDate } from '@/lib/format'

const VARIANT: Record<DataKind, BadgeProps['variant']> = {
  observed: 'default',
  forecast: 'sky',
  climatology: 'gold',
  modelled: 'soil',
  user_entered: 'outline',
  simulated: 'warn',
  model_output: 'gold',
  estimate: 'gold',
}

export function DataKindBadge({ kind, className }: { kind: DataKind; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant={VARIANT[kind] ?? 'outline'} className={className} title={t(`dataKind.${kind}.hint`)}>
      {t(`dataKind.${kind}.label`)}
    </Badge>
  )
}

/** Data provenance: kind badge plus a tooltip with source, licence, time and cache state. */
export function ProvenanceBadge({ provenance, className }: { provenance: Provenance; className?: string }) {
  const { t, i18n } = useTranslation()
  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div className="font-semibold">
            {provenance.provider} · {provenance.dataset}
          </div>
          <div>{t(`dataKind.${provenance.kind}.hint`)}</div>
          {provenance.resolution && (
            <div>
              {t('provenance.resolution')}: {provenance.resolution}
            </div>
          )}
          <div>
            {t('provenance.retrieved')}: {formatDate(provenance.retrieved_at, 'd MMM, HH:mm', i18n.language)} ·{' '}
            {t(`provenance.cache.${provenance.cache_status}`)}
          </div>
          {provenance.attribution && <div className="opacity-80">{provenance.attribution}</div>}
          {provenance.license && <div className="opacity-80">{provenance.license}</div>}
          {provenance.notes?.map((n) => (
            <div key={n} className="opacity-80">
              • {n}
            </div>
          ))}
        </div>
      }
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`}
        aria-label={t('provenance.aria', { provider: provenance.provider })}
      >
        <DataKindBadge kind={provenance.kind} />
        {provenance.cache_status === 'stale' && <Badge variant="warn">{t('provenance.cache.stale')}</Badge>}
        <Info className="size-3.5 text-muted-foreground" />
      </button>
    </Tooltip>
  )
}
