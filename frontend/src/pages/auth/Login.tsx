import { Link, useLocation, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { authApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { qk } from '@/api/queries'
import { loginSchema, type LoginInput } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/common/Field'
import { AuthLayout } from './AuthLayout'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const user = await authApi.login(values)
      qc.setQueryData(qk.me, user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? t('auth.invalidCredentials') : e instanceof ApiError && e.status === 429 ? t('errors.rateLimited') : t('errors.generic'))
    }
  })

  return (
    <AuthLayout title={t('auth.welcomeBack')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField id="email" label={t('auth.email')} error={formState.errors.email && t(formState.errors.email.message!)}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register('email')} />
        </FormField>
        <FormField id="password" label={t('auth.password')} error={formState.errors.password && t(formState.errors.password.message!)}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register('password')} />
        </FormField>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? t('common.pleaseWait') : t('auth.signIn')}
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">{t('auth.forgot')}</Link>
          <Link to="/register" className="font-semibold text-paddy-700 dark:text-paddy-300">{t('auth.createAccount')}</Link>
        </div>
      </form>
    </AuthLayout>
  )
}
