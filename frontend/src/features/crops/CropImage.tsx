import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banana, Bean, Carrot, Flower2, Info, Leaf, Nut, Sprout, TreePalm, Wheat, type LucideIcon } from 'lucide-react'
import type { Crop } from '@/api/types'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const CATEGORY_ART: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  cereal: { icon: Wheat, from: 'from-sun-400', to: 'to-paddy-700' },
  millet: { icon: Wheat, from: 'from-sun-300', to: 'to-soil-600' },
  pulse: { icon: Bean, from: 'from-paddy-400', to: 'to-paddy-800' },
  oilseed: { icon: Flower2, from: 'from-sun-400', to: 'to-soil-700' },
  vegetable: { icon: Carrot, from: 'from-paddy-300', to: 'to-paddy-700' },
  spice: { icon: Leaf, from: 'from-sun-500', to: 'to-soil-700' },
  fruit: { icon: Banana, from: 'from-sun-300', to: 'to-paddy-700' },
  tuber: { icon: Nut, from: 'from-soil-300', to: 'to-soil-700' },
  plantation: { icon: TreePalm, from: 'from-paddy-400', to: 'to-paddy-900' },
  fibre: { icon: Sprout, from: 'from-soil-100', to: 'to-paddy-700' },
  cash: { icon: Sprout, from: 'from-paddy-300', to: 'to-paddy-800' },
}

type CropLike = Pick<Crop, 'slug' | 'category' | 'image_url' | 'image_credit'>

/** Crop photo with a category illustration fallback, so a card never shows a broken image. */
export function CropImage({ crop, className, showCredit = false }: { crop: CropLike; className?: string; showCredit?: boolean }) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const art = CATEGORY_ART[crop.category] ?? CATEGORY_ART.cereal
  const Icon = art.icon
  const credit = crop.image_credit
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {crop.image_url && !failed ? (
        <img
          src={crop.image_url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div data-testid="crop-fallback" className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br', art.from, art.to)}>
          <Icon className="size-1/3 max-h-16 max-w-16 text-white/70" strokeWidth={1.4} aria-hidden />
        </div>
      )}
      {showCredit && credit && !failed && (
        <Tooltip
          content={
            <span>
              {t('crops.photoCredit', { author: credit.author, license: credit.license })}
              <br />
              <span className="opacity-70">Wikimedia Commons</span>
            </span>
          }
        >
          <a
            href={credit.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-2 z-10 rounded-full bg-black/35 p-1 text-white/85 backdrop-blur-sm hover:bg-black/55"
            aria-label={t('crops.photoCredit', { author: credit.author, license: credit.license })}
          >
            <Info className="size-3.5" />
          </a>
        </Tooltip>
      )}
    </div>
  )
}
