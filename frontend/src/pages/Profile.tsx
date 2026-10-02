import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MailCheck, Trash2 } from 'lucide-react'
import { authApi, usersApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { qk } from '@/api/queries'
import type { AreaUnit, Language } from '@/api/types'
import { useAuth } from '@/stores/auth'
import { useUi } from '@/stores/ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/common/PageHeader'
import { PageSpinner } from '@/components/layout/PageSpinner'
import { SUPPORTED_LANGUAGES } from '@/i18n'

const TIMEZONES = ['Asia/Kolkata', 'Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC']

export default function Profile() {
  const { t, i18n } = useTranslation()
  const user = useAuth((s) => s.user)
  const setUser = useAuth((s) => s.setUser)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { soundEnabled, setSoundEnabled } = useUi()
  const [name, setName] = useState(user?.full_name ?? '')
  const [region, setRegion] = useState(user?.preferences.region ?? '')
  const [saving, setSaving] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  if (!user) return <PageSpinner />

  async function patch(body: Parameters<typeof usersApi.update>[0], silent = false) {
    try {
      const u = await usersApi.update(body)
      qc.setQueryData(qk.me, u)
      setUser(u)
      if (!silent) toast.success(t('profile.saved'))
    } catch {
      toast.error(t('errors.generic'))
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('profile.title')} subtitle={user.email} />
      <Card>
        <CardHeader><CardTitle>{t('profile.account')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">{t('auth.fullName')}</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm">
            <span className="flex items-center gap-2">
              <MailCheck className="size-4" /> {user.email}
              {user.email_verified ? <Badge>{t('profile.verified')}</Badge> : <Badge variant="warn">{t('profile.unverified')}</Badge>}
            </span>
            {!user.email_verified && (
              <Button size="sm" variant="outline" onClick={() => authApi.resendVerification().then(() => toast.success(t('profile.verificationSent'))).catch(() => toast.error(t('errors.generic')))}>
                {t('auth.resend')}
              </Button>
            )}
          </div>
          <Button
            disabled={saving || !name.trim() || name === user.full_name}
            onClick={async () => {
              setSaving(true)
              await patch({ full_name: name.trim() })
              setSaving(false)
            }}
          >
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('profile.preferences')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-lang">{t('profile.language')}</Label>
            <NativeSelect
              id="p-lang"
              value={user.preferences.language}
              onChange={(e) => {
                const language = e.target.value as Language
                void i18n.changeLanguage(language)
                void patch({ preferences: { language } }, true)
              }}
            >
              {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-unit">{t('profile.areaUnit')}</Label>
            <NativeSelect id="p-unit" value={user.preferences.area_unit} onChange={(e) => void patch({ preferences: { area_unit: e.target.value as AreaUnit } }, true)}>
              <option value="acre">{t('units.acre')}</option>
              <option value="hectare">{t('units.hectare')}</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-tz">{t('profile.timezone')}</Label>
            <NativeSelect id="p-tz" value={user.preferences.timezone} onChange={(e) => void patch({ preferences: { timezone: e.target.value } }, true)}>
              {[...new Set([user.preferences.timezone, ...TIMEZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-region">{t('onboarding.district')}</Label>
            <Input id="p-region" value={region} onChange={(e) => setRegion(e.target.value)} onBlur={() => region !== (user.preferences.region ?? '') && patch({ preferences: { region: region || null } })} maxLength={120} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm sm:col-span-2">
            <span>{t('profile.ambientSound')}</span>
            <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} aria-label={t('profile.ambientSound')} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm sm:col-span-2">
            <span>{t('profile.darkMode')}</span>
            <Switch
              checked={dark}
              onCheckedChange={(v) => {
                setDark(v)
                document.documentElement.classList.toggle('dark', v)
                try {
                  localStorage.setItem('bhoomi-theme', v ? 'dark' : 'light')
                } catch {
                  /* ignore */
                }
              }}
              aria-label={t('profile.darkMode')}
            />
          </label>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">{t('profile.dangerZone')}</CardTitle>
          <CardDescription>{t('profile.deleteBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDelOpen(true)}><Trash2 /> {t('profile.deleteAccount')}</Button>
        </CardContent>
      </Card>

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profile.deleteAccount')}</DialogTitle>
            <DialogDescription>{t('profile.deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setDeleting(true)
              try {
                await usersApi.remove(password)
                qc.clear()
                setUser(null)
                navigate('/', { replace: true })
              } catch (err) {
                toast.error(err instanceof ApiError && (err.status === 401 || err.status === 403) ? t('auth.invalidCredentials') : t('errors.generic'))
              } finally {
                setDeleting(false)
              }
            }}
          >
            <Label htmlFor="del-pw">{t('auth.password')}</Label>
            <Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" variant="destructive" className="w-full" disabled={deleting || !password}>{t('profile.deleteForever')}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
