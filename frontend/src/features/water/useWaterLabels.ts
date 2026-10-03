import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { WaterKind } from '@/api/types'
import { WATER_KINDS } from './format'
import type { WaterLabels } from './waterLayers'

/** Localised strings for map popups/labels (built outside React render paths). */
export function useWaterLabels(): WaterLabels {
  const { t, i18n } = useTranslation()
  return useMemo(() => {
    const kind = Object.fromEntries(WATER_KINDS.map((k) => [k, t(`waterSources.kind.${k}`)])) as Record<WaterKind, string>
    return {
      kind,
      unnamed: (k: string) => t('waterSources.unnamed', { kind: k.split(' (')[0].toLowerCase() }),
      direction: (d: string) => t('waterSources.toThe', { dir: t(`waterSources.dir.${d}`) }),
      away: (distance: string) => t('waterSources.away', { distance }),
      adjoining: t('waterSources.adjoining'),
      seasonal: t('waterSources.seasonal'),
      openOsm: t('waterSources.openOsm'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language])
}
