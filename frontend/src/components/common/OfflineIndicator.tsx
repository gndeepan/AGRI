import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}

export function OfflineIndicator() {
  const online = useOnline()
  const { t } = useTranslation()
  if (online) return null
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-soil-800 px-4 py-1.5 text-xs font-medium text-soil-50">
      <WifiOff className="size-3.5" /> {t('common.offline')}
    </div>
  )
}
