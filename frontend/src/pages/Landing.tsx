import { Suspense, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { ArrowRight, CalendarRange, CloudSun, Layers, MapPinned, MessageCircle, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Landscape } from '@/components/common/Landscape'
import { Logo } from '@/components/layout/Logo'
import { LanguageToggle } from '@/components/common/LanguageToggle'
import { GlobeZoom, KAVERI_DELTA_BBOX } from '@/features/globe'

const FEATURES = [
  { key: 'map', icon: MapPinned },
  { key: 'environment', icon: CloudSun },
  { key: 'plan', icon: CalendarRange },
  { key: 'field', icon: Layers },
  { key: 'assistant', icon: MessageCircle },
  { key: 'honest', icon: ShieldCheck },
] as const

export default function Landing() {
  const { t } = useTranslation()
  const [globeFailed, setGlobeFailed] = useState(false)
  return (
    <div className="min-h-dvh bg-background">
      <section className="grain relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        {globeFailed ? (
          <Landscape className="absolute inset-0 -z-10" />
        ) : (
          <Suspense fallback={<div className="absolute inset-0 -z-10 bg-[#0a1624]" />}>
            <GlobeZoom
              className="absolute inset-0 -z-10"
              fallbackBbox={KAVERI_DELTA_BBOX}
              interactive={false}
              showControls={false}
              onFailed={() => setGlobeFailed(true)}
            />
          </Suspense>
        )}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-paddy-950/55 via-transparent to-paddy-950/40" />
        {!globeFailed && (
          <>
            <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black/65 via-black/25 to-transparent" />
            <p className="pointer-events-none absolute bottom-10 right-5 hidden text-[11px] text-soil-100/70 sm:block sm:right-8">
              {t('globe.landingCaption')}
            </p>
          </>
        )}
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Logo light />
          <div className="flex items-center gap-2">
            <LanguageToggle light />
            <Button asChild variant="ghost" className="text-soil-50 hover:bg-white/10">
              <Link to="/login">{t('auth.signIn')}</Link>
            </Button>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 pb-28 sm:px-8">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-sun-300"
          >
            {t('landing.eyebrow')}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1 }}
            className="max-w-3xl font-display text-5xl font-semibold leading-[1.02] tracking-tight text-soil-50 drop-shadow-sm sm:text-7xl"
          >
            {t('landing.title')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.25 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-soil-100/90"
          >
            {t('landing.subtitle')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4 }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <Button asChild size="lg" variant="gold">
              <Link to="/register">
                {t('landing.cta')} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="border border-white/30 text-soil-50 hover:bg-white/10">
              <a href="#how">{t('landing.secondary')}</a>
            </Button>
          </motion.div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{t('landing.howTitle')}</h2>
          <p className="mt-4 text-muted-foreground">{t('landing.howBody')}</p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon }, i) => (
            <motion.article
              key={key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-paddy-100 text-paddy-700 dark:bg-paddy-800 dark:text-paddy-200">
                <Icon className="size-5" />
              </div>
              <h3 className="font-display text-xl font-semibold">{t(`landing.features.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`landing.features.${key}.body`)}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="bg-paddy-900 text-soil-50">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">{t('landing.trustTitle')}</h2>
            <p className="mt-4 text-soil-100/80">{t('landing.trustBody')}</p>
          </div>
          <ul className="grid gap-3 text-sm">
            {(['observed', 'forecast', 'climatology', 'modelled', 'simulated'] as const).map((k) => (
              <li key={k} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <span className="mt-0.5 rounded-full bg-sun-500/20 px-2 py-0.5 text-[11px] font-semibold text-sun-300">
                  {t(`dataKind.${k}.label`)}
                </span>
                <span className="text-soil-100/85">{t(`dataKind.${k}.hint`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-10 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-8">
        <span>© {new Date().getFullYear()} Bhoomi AI</span>
        <span>{t('landing.footer')}</span>
      </footer>
    </div>
  )
}
