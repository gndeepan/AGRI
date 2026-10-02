import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { authApi } from '@/api/endpoints'
import { qk } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/layout/PageSpinner'
import { AuthLayout } from './AuthLayout'

export default function VerifyEmail() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token')
  const qc = useQueryClient()
  const [state, setState] = useState<'pending' | 'ok' | 'error'>(token ? 'pending' : 'error')
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    authApi
      .verifyEmail(token)
      .then((u) => {
        qc.setQueryData(qk.me, u)
        setState('ok')
      })
      .catch(() => setState('error'))
  }, [token, qc])

  return (
    <AuthLayout title={t('auth.verifyTitle')}>
      {state === 'pending' && <PageSpinner />}
      {state === 'ok' && (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-10 text-paddy-600" />
          <p>{t('auth.verified')}</p>
          <Button asChild className="w-full"><Link to="/app">{t('nav.dashboard')}</Link></Button>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-4 text-center">
          <XCircle className="mx-auto size-10 text-destructive" />
          <p>{t('auth.tokenInvalid')}</p>
          <Button variant="outline" asChild className="w-full"><Link to="/app/profile">{t('auth.resend')}</Link></Button>
        </div>
      )}
    </AuthLayout>
  )
}
