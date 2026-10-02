import { Link, useNavigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { authApi } from '@/api/endpoints'
import { resetSchema } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/common/Field'
import { AuthLayout } from './AuthLayout'

export default function ResetPassword() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) })
  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    try {
      await authApi.resetPassword(token, password)
      toast.success(t('auth.resetDone'))
      navigate('/login', { replace: true })
    } catch {
      setError(t('auth.tokenInvalid'))
    }
  })
  return (
    <AuthLayout title={t('auth.resetTitle')}>
      {!token ? (
        <p role="alert" className="text-sm text-destructive">{t('auth.tokenInvalid')}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="password" label={t('auth.newPassword')} error={formState.errors.password && t(formState.errors.password.message!)} hint={t('auth.passwordHint')}>
            <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
          </FormField>
          <FormField id="confirm" label={t('auth.confirmPassword')} error={formState.errors.confirm && t(formState.errors.confirm.message!)}>
            <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
          </FormField>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={formState.isSubmitting}>{t('auth.resetSubmit')}</Button>
        </form>
      )}
      <Link to="/login" className="mt-6 block text-center text-sm text-muted-foreground">{t('auth.backToLogin')}</Link>
    </AuthLayout>
  )
}
