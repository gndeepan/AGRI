import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, ArrowRight, MapPinned } from 'lucide-react'
import { toast } from 'sonner'
import { usersApi } from '@/api/endpoints'
import { qk } from '@/api/queries'
import type { AreaUnit, Language } from '@/api/types'
import { useAuth } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/layout/Logo'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import { cn } from '@/lib/utils'

const TN_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi',
  'Kancheepuram', 'Kanniyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal',
  'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur',
  'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai',
  'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar',
]

export default function Onboarding() {
  const { t, i18n } = useTranslation()
  const user = useAuth((s) => s.user)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [language, setLanguage] = useState<Language>((user?.preferences.language ?? i18n.language) as Language)
  const [region, setRegion] = useState(user?.preferences.region ?? '')
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(user?.preferences.area_unit ?? 'acre')
  const [timezone, setTimezone] = useState(user?.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Kolkata')
  const [saving, setSaving] = useState(false)

  async function finish(goToMap: boolean) {
    setSaving(true)
    try {
      const u = await usersApi.update({ preferences: { language, region: region || null, area_unit: areaUnit, timezone } })
      qc.setQueryData(qk.me, u)
      navigate(goToMap ? '/app/map' : '/app', { replace: true })
    } catch {
      toast.error(t('errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    <div key="lang" className="space-y-4">
      <h2 className="font-display text-2xl font-semibold">{t('onboarding.languageTitle')}</h2>
      <div className="grid grid-cols-2 gap-3">
        {SUPPORTED_LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => {
              setLanguage(l.code)
              void i18n.changeLanguage(l.code)
            }}
            className={cn('rounded-2xl border p-5 text-left text-lg font-semibold transition', language === l.code ? 'border-paddy-600 bg-paddy-50 ring-2 ring-paddy-500 dark:bg-paddy-900' : 'border-border bg-card hover:bg-muted')}
            aria-pressed={language === l.code}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>,
    <div key="region" className="space-y-5">
      <h2 className="font-display text-2xl font-semibold">{t('onboarding.regionTitle')}</h2>
      <div className="space-y-1.5">
        <Label htmlFor="region">{t('onboarding.district')}</Label>
        <NativeSelect id="region" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">{t('onboarding.selectDistrict')}</option>
          {TN_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          <option value="Other">{t('onboarding.otherRegion')}</option>
        </NativeSelect>
        <p className="text-xs text-muted-foreground">{t('onboarding.regionHint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tz">{t('profile.timezone')}</Label>
        <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </div>
    </div>,
    <div key="units" className="space-y-4">
      <h2 className="font-display text-2xl font-semibold">{t('onboarding.unitsTitle')}</h2>
      <div className="grid grid-cols-2 gap-3">
        {(['acre', 'hectare'] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setAreaUnit(u)}
            aria-pressed={areaUnit === u}
            className={cn('rounded-2xl border p-5 text-left transition', areaUnit === u ? 'border-paddy-600 bg-paddy-50 ring-2 ring-paddy-500 dark:bg-paddy-900' : 'border-border bg-card hover:bg-muted')}
          >
            <div className="text-lg font-semibold">{t(`units.${u}`)}</div>
            <div className="text-xs text-muted-foreground">{t(`units.${u}Hint`)}</div>
          </button>
        ))}
      </div>
    </div>,
    <div key="field" className="space-y-4 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-paddy-100 text-paddy-700 dark:bg-paddy-800 dark:text-paddy-100">
        <MapPinned className="size-8" />
      </div>
      <h2 className="font-display text-2xl font-semibold">{t('onboarding.fieldTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('onboarding.fieldBody')}</p>
      <div className="flex flex-col gap-2 pt-2">
        <Button size="lg" onClick={() => finish(true)} disabled={saving}>{t('onboarding.drawField')}</Button>
        <Button variant="ghost" onClick={() => finish(false)} disabled={saving}>{t('onboarding.later')}</Button>
      </div>
    </div>,
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-soil-50 to-paddy-50 px-5 py-6 dark:from-paddy-950 dark:to-paddy-900">
      <Logo />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-6 flex gap-1.5" aria-label={t('onboarding.progress', { step: step + 1, total: steps.length })}>
          {steps.map((_, i) => <div key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-paddy-600' : 'bg-border')} />)}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
            {steps[step]}
          </motion.div>
        </AnimatePresence>
        {step < steps.length - 1 && (
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft /> {t('common.back')}
            </Button>
            <Button onClick={() => setStep((s) => s + 1)}>
              {t('common.next')} <ArrowRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
