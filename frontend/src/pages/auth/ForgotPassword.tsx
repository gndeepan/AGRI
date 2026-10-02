import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import type { z } from 'zod'
import { authApi } from '@/api/endpoints'
import { forgotSchema } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/common/Field'
import { AuthLayout } from './AuthLayout'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) })
  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await authApi.requestReset(email)
    } finally {
      setSent(true) // Same message either way: we never reveal whether an account exists.
    }
  })
  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      {sent ? (
        <p role="status" className="rounded-xl bg-paddy-50 p-4 text-sm dark:bg-paddy-900">{t('auth.resetSent')}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="email" label={t('auth.email')} error={formState.errors.email && t(formState.errors.email.message!)}>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
          </FormField>
          <Button type="submit" className="w-full" size="lg" disabled={formState.isSubmitting}>{t('auth.sendReset')}</Button>
        </form>
      )}
      <Link to="/login" className="mt-6 block text-center text-sm text-muted-foreground hover:text-foreground">{t('auth.backToLogin')}</Link>
    </AuthLayout>
  )
}
