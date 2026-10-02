import { Link, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { authApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { qk } from '@/api/queries'
import type { Language } from '@/api/types'
import { registerSchema, type RegisterInput } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/common/Field'
import { AuthLayout } from './AuthLayout'

export default function Register() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })
  const err = (k: keyof RegisterInput) => {
    const m = formState.errors[k]?.message
    return m ? t(m) : undefined
  }

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      const user = await authApi.register({ email: v.email, password: v.password, full_name: v.full_name, language: i18n.language as Language })
      qc.setQueryData(qk.me, user)
      navigate('/onboarding', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? t('auth.emailTaken') : e instanceof ApiError ? e.message : t('errors.generic'))
    }
  })

  return (
    <AuthLayout title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField id="full_name" label={t('auth.fullName')} error={err('full_name')}>
          <Input id="full_name" autoComplete="name" aria-invalid={!!err('full_name')} {...register('full_name')} />
        </FormField>
        <FormField id="email" label={t('auth.email')} error={err('email')}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!err('email')} {...register('email')} />
        </FormField>
        <FormField id="password" label={t('auth.password')} error={err('password')} hint={t('auth.passwordHint')}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!err('password')} {...register('password')} />
        </FormField>
        <FormField id="confirm" label={t('auth.confirmPassword')} error={err('confirm')}>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!err('confirm')} {...register('confirm')} />
        </FormField>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-paddy-700" {...register('accept')} />
          <span>{t('auth.accept')}</span>
        </label>
        {err('accept') && <p role="alert" className="text-xs text-destructive">{err('accept')}</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? t('common.pleaseWait') : t('auth.createAccount')}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.haveAccount')} <Link to="/login" className="font-semibold text-paddy-700 dark:text-paddy-300">{t('auth.signIn')}</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
