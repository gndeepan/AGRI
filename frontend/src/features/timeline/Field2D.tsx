import { useMemo } from 'react'
import type { FieldVisualState } from '@/features/field3d/types'
import { growthParams, type RGB } from '@/features/field3d/growth'
import { computeLighting } from '@/features/field3d/sky'
import { cn } from '@/lib/utils'

const rgb = (c: RGB, k = 1) => `rgb(${Math.round(c[0] * 255 * k)}, ${Math.round(c[1] * 255 * k)}, ${Math.round(c[2] * 255 * k)})`

/**
 * Lightweight 2D (SVG) rendition of the same crop model, used when WebGL is
 * unavailable or on very low-end devices. Deterministic for a given state.
 */
export function Field2D({ state, className }: { state: FieldVisualState; className?: string }) {
  const g = growthParams(state.stageKey, state.stageProgress)
  const L = computeLighting(state.hourOfDay, state.sunrise, state.sunset, state.cloudCover, state.rainIntensity)
  const water = state.standingWater ? Math.max(0.35, g.waterLevel) : 0
  const sunX = 50 + (L.sunDir[0] ?? 0) * 40
  const sunY = 60 - Math.max(-10, L.sunElevationDeg) * 0.75

  const plants = useMemo(() => {
    const out: { x: number; y: number; s: number; lean: number }[] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let row = 0; row < 9; row++) {
      const y = 70 + row * row * 0.38 + row * 1.2
      const scale = 0.35 + row * 0.12
      const count = 16 + row * 2
      for (let i = 0; i < count; i++) out.push({ x: (i + 0.5 + (rnd() - 0.5) * 0.4) * (100 / count), y, s: scale * (0.85 + rnd() * 0.3), lean: rnd() - 0.5 })
    }
    return out
  }, [])

  const h = g.heightM * 22 // metres → svg units at the front row
  const tillers = Math.max(1, Math.round(g.tillers / 2))
  const windLean = Math.min(1, state.windSpeedKmh / 40) * 4
  const dim = 0.35 + 0.65 * L.daylight

  return (
    <div className={cn('relative overflow-hidden', className)} role="img" aria-label="2D field visualisation">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="f2d-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={rgb(L.skyColor, 0.85)} />
            <stop offset="1" stopColor={rgb(L.fogColor)} />
          </linearGradient>
        </defs>
        <rect width="100" height="70" fill="url(#f2d-sky)" />
        {L.night > 0.5 &&
          Array.from({ length: 40 }).map((_, i) => (
            <circle key={i} cx={(i * 37) % 100} cy={(i * 23) % 50} r={0.18} fill="white" opacity={(L.night - 0.5) * 2 * (1 - state.cloudCover)} />
          ))}
        {L.sunElevationDeg > -6 && <circle cx={sunX} cy={sunY} r={4} fill={rgb(L.sunColor)} opacity={0.9 * (1 - state.cloudCover * 0.7)} />}
        {state.cloudCover > 0.1 &&
          [12, 38, 66, 88].map((x, i) => (
            <ellipse key={x} cx={x} cy={14 + (i % 2) * 8} rx={10 + state.cloudCover * 8} ry={3 + state.cloudCover * 2} fill={state.rainIntensity > 0.3 ? '#8a939a' : '#ffffff'} opacity={0.35 + state.cloudCover * 0.5} />
          ))}
        <path d="M0 64 Q25 60 50 63 T100 62 V72 H0Z" fill={rgb([0.27, 0.4, 0.3], dim)} />
        <rect y="68" width="100" height="32" fill={g.soilWetness > 0.5 ? rgb([0.33, 0.25, 0.17], dim) : rgb([0.55, 0.42, 0.28], dim)} />
        {water > 0 && <rect y="68" width="100" height="32" fill={rgb(L.skyColor, 0.9)} opacity={0.45 * water} />}
        {g.presence > 0.02 &&
          plants.map((p, i) => {
            const ph = h * p.s
            if (ph < 0.2) return null
            const leaf = rgb(g.leafColor, dim)
            const tip = rgb(g.stubble > 0.5 ? [0.75, 0.62, 0.38] : g.leafTipColor, dim)
            return (
              <g key={i} opacity={g.presence} transform={`translate(${p.x} ${p.y})`}>
                {Array.from({ length: tillers }).map((_, k) => {
                  const spread = (k - (tillers - 1) / 2) * 0.9 * p.s
                  const lean = (p.lean + windLean * 0.3) * p.s + spread
                  return <path key={k} d={`M0 0 Q${lean * 0.4} ${-ph * 0.55} ${lean} ${-ph}`} stroke={k % 2 ? tip : leaf} strokeWidth={0.32 * p.s} fill="none" strokeLinecap="round" />
                })}
                {g.panicleEmergence > 0.1 && (
                  <path d={`M${p.lean * p.s} ${-ph} q${0.8 * p.s + g.panicleDroop} ${0.6 * g.panicleDroop * 2} ${1.4 * p.s} ${g.panicleDroop * 2.2 * p.s}`} stroke={rgb(g.panicleColor, dim)} strokeWidth={0.55 * p.s} fill="none" strokeLinecap="round" opacity={g.panicleEmergence} />
                )}
              </g>
            )
          })}
        {state.rainIntensity > 0.05 &&
          Array.from({ length: Math.round(state.rainIntensity * 80) }).map((_, i) => (
            <line key={i} x1={(i * 13.7) % 100} y1={(i * 7.3) % 90} x2={(i * 13.7) % 100 - 0.8} y2={((i * 7.3) % 90) + 3} stroke="#cfe4f1" strokeWidth={0.12} opacity={0.6} />
          ))}
      </svg>
    </div>
  )
}
