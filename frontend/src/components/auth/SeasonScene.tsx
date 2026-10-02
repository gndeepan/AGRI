import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

/**
 * Looping, illustrative paddy season for the auth screens: one Kuruvai cycle (transplanting →
 * harvest) in CYCLE_MS, with four day/night cycles across it. Pure SVG + CSS variables; a single
 * rAF loop writes colours/positions to the root element, so React renders the scene once.
 */

const CYCLE_MS = 36000
const DAYS_PER_CYCLE = 4
const STAGES = [
  { key: 'transplanting', day: 1 },
  { key: 'tillering', day: 30 },
  { key: 'flowering', day: 75 },
  { key: 'harvest', day: 115 },
] as const

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const mix = (a: RGB, b: RGB, f: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`
const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (f: number) => f * f * (3 - 2 * f)

/** Piecewise-smooth interpolation over keyframes sorted by `at`. */
function sample<T extends { at: number }>(keys: T[], t: number, pick: (a: T, b: T, f: number) => void) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t >= a.at && t <= b.at) return pick(a, b, smooth((t - a.at) / (b.at - a.at || 1)))
  }
  const last = keys[keys.length - 1]
  pick(last, last, 0)
}

const SKY = [
  { at: 0.0, top: '#0b1630', bottom: '#24365a', dark: 0.55, warm: 0 },
  { at: 0.08, top: '#3a5a86', bottom: '#f0a873', dark: 0.18, warm: 0.45 },
  { at: 0.2, top: '#5b9bd3', bottom: '#cfe4f1', dark: 0, warm: 0.05 },
  { at: 0.45, top: '#4a8ccc', bottom: '#dcecf5', dark: 0, warm: 0 },
  { at: 0.62, top: '#5878a6', bottom: '#f3c07a', dark: 0.02, warm: 0.5 },
  { at: 0.72, top: '#2b3864', bottom: '#dc8458', dark: 0.22, warm: 0.35 },
  { at: 0.82, top: '#0b1630', bottom: '#1d2b4a', dark: 0.55, warm: 0 },
  { at: 1.0, top: '#0b1630', bottom: '#24365a', dark: 0.55, warm: 0 },
].map((k) => ({ ...k, topC: hex(k.top), bottomC: hex(k.bottom) }))

const CROP = [
  { at: 0.0, grow: 0.3, leaf: '#9ccb62', grain: '#dfe6a0', panicle: 0, water: 0.9 },
  { at: 0.25, grow: 0.66, leaf: '#4f9a3c', grain: '#dfe6a0', panicle: 0, water: 0.8 },
  { at: 0.5, grow: 0.95, leaf: '#3c7c31', grain: '#e3e9b0', panicle: 0.65, water: 0.6 },
  { at: 0.72, grow: 1, leaf: '#6d8f39', grain: '#d8c25e', panicle: 1, water: 0.28 },
  { at: 0.9, grow: 1, leaf: '#b39a46', grain: '#e5b548', panicle: 1, water: 0.04 },
  { at: 1.0, grow: 1, leaf: '#b39a46', grain: '#e5b548', panicle: 1, water: 0.04 },
].map((k) => ({ ...k, leafC: hex(k.leaf), grainC: hex(k.grain) }))

/** Deterministic PRNG so the field layout is identical on every render. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const HORIZON = 600
interface Clump { x: number; y: number; s: number; delay: number; blades: number[]; tilt: number }

function buildField(): Clump[] {
  const rnd = mulberry32(42)
  const clumps: Clump[] = []
  for (let r = 0; r < 12; r++) {
    const depth = r / 11 // 0 far → 1 near
    const y = HORIZON + 14 + Math.pow(depth, 1.7) * 400
    const s = 0.16 + depth * 1.05
    const gap = 46 * s + 6
    for (let x = -40 + rnd() * gap; x < 840; x += gap) {
      clumps.push({
        x: x + (rnd() - 0.5) * gap * 0.25,
        y,
        s: s * (0.88 + rnd() * 0.24),
        delay: -rnd() * 4,
        tilt: (rnd() - 0.5) * 10,
        blades: Array.from({ length: 6 }, () => rnd()),
      })
    }
  }
  return clumps
}

function bladePath(i: number, n: number, v: number) {
  const spread = (i / (n - 1) - 0.5) * 2 // -1..1
  const h = 70 + v * 30 - Math.abs(spread) * 18
  const tipX = spread * (26 + v * 14)
  const ctrlX = spread * 6
  return `M${spread * 2.5},0 Q${ctrlX},${-h * 0.6} ${tipX},${-h} Q${ctrlX + 2.2},${-h * 0.58} ${spread * 2.5 + 2.2},0 Z`
}

const STARS = Array.from({ length: 46 }, (_, i) => {
  const rnd = mulberry32(900 + i)
  return { x: rnd() * 800, y: rnd() * 420, r: 0.6 + rnd() * 1.3, d: rnd() * 3 }
})

function palm(x: number, y: number, h: number, lean: number, key: number) {
  const topX = x + lean
  const topY = y - h
  const fronds = Array.from({ length: 9 }, (_, i) => {
    const a = (-170 + i * 20) * (Math.PI / 180)
    const len = 52 + (i % 3) * 8
    const ex = topX + Math.cos(a) * len
    const ey = topY + Math.sin(a) * len * 0.55 + 18
    const cx = topX + Math.cos(a) * len * 0.5
    const cy = topY + Math.sin(a) * len * 0.5 - 10
    return <path key={i} d={`M${topX},${topY} Q${cx},${cy} ${ex},${ey}`} strokeWidth={5 - (i % 2)} />
  })
  return (
    <g key={key} className="ss-palm" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${-key * 1.3}s` }}>
      <path d={`M${x},${y} Q${x + lean * 0.2},${y - h * 0.5} ${topX},${topY}`} stroke="var(--ss-palm-trunk)" strokeWidth={6} fill="none" strokeLinecap="round" />
      <g stroke="var(--ss-palm-leaf)" fill="none" strokeLinecap="round">{fronds}</g>
    </g>
  )
}

/** `fixedSeason` (0..1) freezes the loop at one moment — for previews and tests. */
export function SeasonScene({ className, fixedSeason }: { className?: string; fixedSeason?: number }) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const sunRef = useRef<SVGGElement>(null)
  const moonRef = useRef<SVGGElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState(0)
  const field = useMemo(buildField, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let raf = 0
    let lastStage = -1
    const start = performance.now()

    const paint = (season: number) => {
      const day = (season * DAYS_PER_CYCLE) % 1
      const set = (k: string, v: string | number) => root.style.setProperty(k, String(v))

      sample(SKY, day, (a, b, f) => {
        set('--ss-sky-top', mix(a.topC, b.topC, f))
        set('--ss-sky-bottom', mix(a.bottomC, b.bottomC, f))
        set('--ss-dark', lerp(a.dark, b.dark, f).toFixed(3))
        set('--ss-warm', lerp(a.warm, b.warm, f).toFixed(3))
        set('--ss-night', clamp01((lerp(a.dark, b.dark, f) - 0.2) / 0.35).toFixed(3))
      })
      sample(CROP, season, (a, b, f) => {
        set('--ss-grow', lerp(a.grow, b.grow, f).toFixed(3))
        set('--ss-leaf', mix(a.leafC, b.leafC, f))
        set('--ss-grain', mix(a.grainC, b.grainC, f))
        set('--ss-panicle', lerp(a.panicle, b.panicle, f).toFixed(3))
        set('--ss-water', lerp(a.water, b.water, f).toFixed(3))
      })
      // Harvest → re-transplant: fade the crop out and back in around the loop seam.
      const seam = season > 0.95 ? 1 - (season - 0.95) / 0.05 : season < 0.03 ? season / 0.03 : 1
      set('--ss-crop', smooth(clamp01(seam)).toFixed(3))

      const p = (day - 0.06) / 0.68
      const sun = sunRef.current
      if (sun) {
        const vis = p > -0.05 && p < 1.05
        sun.style.opacity = vis ? '1' : '0'
        sun.setAttribute('transform', `translate(${lerp(90, 710, p)},${HORIZON - Math.sin(clamp01(p) * Math.PI) * 430})`)
      }
      const q = ((day - 0.76 + 1) % 1) / 0.3
      const moon = moonRef.current
      if (moon) {
        moon.style.opacity = q >= 0 && q <= 1 ? String(Math.sin(clamp01(q) * Math.PI)) : '0'
        moon.setAttribute('transform', `translate(${lerp(140, 660, q)},${HORIZON - 40 - Math.sin(clamp01(q) * Math.PI) * 330})`)
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${season})`

      const s = Math.min(STAGES.length - 1, Math.floor(season * STAGES.length))
      if (s !== lastStage) {
        lastStage = s
        setStage(s)
      }
    }

    if (reduce || fixedSeason !== undefined) {
      paint(fixedSeason ?? 0.56)
      return
    }
    const tick = (now: number) => {
      paint(((now - start) % CYCLE_MS) / CYCLE_MS)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, fixedSeason])

  const current = STAGES[stage]

  return (
    <div ref={rootRef} className={`season-scene ${reduce || fixedSeason !== undefined ? 'ss-still' : ''} ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 800 1000" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--ss-sky-top)' }} />
            <stop offset="0.6" style={{ stopColor: 'var(--ss-sky-bottom)' }} />
          </linearGradient>
          <radialGradient id="ss-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff8e0" />
            <stop offset="0.25" stopColor="#ffe6a6" stopOpacity="0.95" />
            <stop offset="1" stopColor="#f6c76a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ss-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--ss-sky-bottom)' }} stopOpacity="0.95" />
            <stop offset="1" style={{ stopColor: 'var(--ss-sky-top)' }} stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id="ss-soil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6f5a3a" />
            <stop offset="1" stopColor="#3b2c1c" />
          </linearGradient>
          <mask id="ss-crescent">
            <circle r="22" fill="#fff" />
            <circle r="20" cx="10" cy="-7" fill="#000" />
          </mask>
          <radialGradient id="ss-moonglow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#e9eefc" stopOpacity="0.45" />
            <stop offset="1" stopColor="#e9eefc" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ss-vignette" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor="#0b140e" stopOpacity="0" />
            <stop offset="1" stopColor="#0b140e" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        <rect width="800" height="1000" fill="url(#ss-sky)" />
        <g ref={sunRef}>
          <circle r="120" fill="url(#ss-sun)" />
          <circle r="26" fill="#fff6d8" />
        </g>

        <g className="ss-clouds" fill="#fff" style={{ opacity: 'calc(0.85 - var(--ss-dark))' }}>
          <g className="ss-drift" style={{ animationDuration: '70s' }}>
            <ellipse cx="160" cy="210" rx="90" ry="20" /><ellipse cx="210" cy="196" rx="60" ry="22" />
          </g>
          <g className="ss-drift" style={{ animationDuration: '95s', animationDelay: '-40s' }}>
            <ellipse cx="520" cy="140" rx="120" ry="18" /><ellipse cx="580" cy="128" rx="70" ry="20" />
          </g>
          <g className="ss-drift" style={{ animationDuration: '120s', animationDelay: '-80s' }}>
            <ellipse cx="380" cy="300" rx="70" ry="12" />
          </g>
        </g>

        <path d="M0,560 C120,520 220,540 320,525 C430,508 520,540 640,520 C710,510 760,525 800,520 L800,610 L0,610 Z" fill="var(--ss-hill-far)" />
        <path d="M0,590 C80,575 150,585 240,572 C330,560 420,590 520,578 C620,566 700,585 800,575 L800,612 L0,612 Z" fill="var(--ss-hill-near)" />
        <g>{[palm(70, 606, 150, 18, 1), palm(118, 610, 118, -10, 2), palm(640, 604, 165, -22, 3), palm(700, 608, 130, 12, 4), palm(745, 606, 100, 6, 5)]}</g>

        <rect y={HORIZON} width="800" height="400" fill="url(#ss-soil)" />
        <rect y={HORIZON} width="800" height="400" fill="url(#ss-water)" style={{ opacity: 'var(--ss-water)' }} />
        <g stroke="#fff" strokeLinecap="round" style={{ opacity: 'calc(var(--ss-water) * 0.35)' }}>
          {[640, 690, 760, 850, 930].map((y, i) => (
            <line key={y} className="ss-shimmer" x1={80 + i * 90} x2={200 + i * 110} y1={y} y2={y} strokeWidth={1 + i * 0.6} style={{ animationDelay: `${-i * 0.7}s` }} />
          ))}
        </g>
        <g fill="#5b452c" opacity="0.55">
          <path d="M0,700 L800,690 L800,698 L0,709 Z" />
          <path d="M0,820 L800,806 L800,818 L0,833 Z" />
        </g>

        <g style={{ opacity: 'var(--ss-crop)' }}>
          {field.map((c, i) => (
            <g key={i} transform={`translate(${c.x.toFixed(1)},${c.y.toFixed(1)}) scale(${c.s.toFixed(3)}) rotate(${c.tilt.toFixed(1)})`}>
              <g className="ss-sway" style={{ animationDelay: `${c.delay.toFixed(2)}s` }}>
                <g className="ss-grow">
                  <g fill="var(--ss-leaf)">
                    {c.blades.map((v, j) => <path key={j} d={bladePath(j, c.blades.length, v)} />)}
                  </g>
                  <g stroke="var(--ss-grain)" strokeWidth={3.2} fill="none" strokeLinecap="round" style={{ opacity: 'var(--ss-panicle)' }}>
                    <path d="M-2,-88 Q8,-104 22,-92" />
                    <path d="M3,-84 Q-8,-100 -20,-90" />
                  </g>
                </g>
              </g>
            </g>
          ))}
        </g>

        <g className="ss-egret" style={{ opacity: 'calc(var(--ss-water) * (1 - var(--ss-night)))' }}>
          <path d="M600,742 q-6,-26 8,-34 q10,-6 14,-22 q2,-8 10,-6 l10,3 l-10,1 q-4,8 -6,24 q20,10 14,30 q-20,10 -40,4 Z" fill="#f7f5ee" />
          <path d="M612,742 l-4,24 M624,744 l2,22" stroke="#2f2a22" strokeWidth={1.5} />
        </g>

        <g className="ss-birds" fill="none" stroke="#1d2620" strokeWidth={2} strokeLinecap="round" style={{ opacity: 'calc(0.8 - var(--ss-night))' }}>
          {[[0, 0], [26, 10], [50, -6], [70, 14], [96, 4]].map(([x, y], i) => (
            <path key={i} className="ss-flap" d={`M${x - 8},${y} q8,-7 8,0 q0,-7 8,0`} style={{ animationDelay: `${-i * 0.15}s` }} />
          ))}
        </g>

        <rect width="800" height="1000" fill="#f2a040" style={{ opacity: 'calc(var(--ss-warm) * 0.22)', mixBlendMode: 'soft-light' }} />
        <rect width="800" height="1000" fill="#050c1c" style={{ opacity: 'var(--ss-dark)' }} />
        <g style={{ opacity: 'var(--ss-night)' }}>
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" className="ss-twinkle" style={{ animationDelay: `${-s.d}s` }} />
          ))}
        </g>
        <g ref={moonRef}>
          <circle r="70" fill="url(#ss-moonglow)" />
          <circle r="22" fill="#f6f3e8" mask="url(#ss-crescent)" />
        </g>
        <g className="ss-fireflies" fill="#ffe98a" style={{ opacity: 'var(--ss-night)' }}>
          {STARS.slice(0, 14).map((s, i) => (
            <circle key={i} cx={(s.x * 1.3) % 800} cy={640 + (s.y % 300)} r={1.8} className="ss-firefly" style={{ animationDelay: `${-s.d * 2}s` }} />
          ))}
        </g>
        <rect width="800" height="1000" fill="url(#ss-vignette)" />
      </svg>

      <div className="absolute inset-x-10 bottom-10 text-soil-50">
        <p className="font-display text-3xl leading-tight font-semibold drop-shadow-sm xl:text-4xl">{t('auth.scene.tagline')}</p>
        <p className="mt-2 max-w-md text-sm text-soil-100/85">{t('auth.scene.subtitle')}</p>
        <div className="mt-6 max-w-md">
          <div className="flex items-baseline justify-between text-xs font-medium tracking-wide">
            <span key={current.key} className="ss-caption uppercase text-sun-300">{t(`auth.scene.stages.${current.key}`)}</span>
            <span className="tabular-nums text-soil-100/80">{t('auth.scene.day', { day: current.day })}</span>
          </div>
          <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/20">
            <div ref={barRef} className="absolute inset-0 origin-left rounded-full bg-sun-400" style={{ transform: 'scaleX(0)' }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-soil-100/60">
            {STAGES.map((s, i) => (
              <span key={s.key} className={i === stage ? 'text-soil-50' : undefined}>{t(`auth.scene.stages.${s.key}`)}</span>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-soil-100/55">{t('auth.scene.note')}</p>
        </div>
      </div>
    </div>
  )
}
