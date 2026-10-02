import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LanguageToggle({ light, className }: { light?: boolean; className?: string }) {
  const { i18n, t } = useTranslation()
  const next = i18n.language === 'ta' ? 'en' : 'ta'
  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(next)}
      aria-label={t('common.switchLanguage')}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium',
        light ? 'text-soil-50 hover:bg-white/10' : 'hover:bg-muted',
        className,
      )}
    >
      <Languages className="size-4" />
      {next === 'ta' ? 'தமிழ்' : 'English'}
    </button>
  )
}
