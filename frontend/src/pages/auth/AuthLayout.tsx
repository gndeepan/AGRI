import type { ReactNode } from 'react'
import { SeasonScene } from '@/components/auth/SeasonScene'
import { Logo } from '@/components/layout/Logo'
import { LanguageToggle } from '@/components/common/LanguageToggle'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <SeasonScene className="absolute inset-0" />
        <div className="absolute left-10 top-10">
          <Logo light />
        </div>
      </div>
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <LanguageToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  )
}
