import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function RouteError() {
  const err = useRouteError()
  const { t } = useTranslation()
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : ''
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-3xl font-semibold">{t('errors.pageTitle')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('errors.pageBody')}</p>
      {msg && <code className="rounded bg-muted px-2 py-1 text-xs">{msg}</code>}
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>
        <Button variant="outline" asChild>
          <Link to="/app">{t('nav.dashboard')}</Link>
        </Button>
      </div>
    </div>
  )
}
