import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'

/** Layered paddy landscape used on the landing hero. Pure SVG, no WebGL. */
export function Landscape({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  const far = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 60])
  const mid = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 120])
  const sun = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 160])

  return (
    <div className={className} aria-hidden>
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3d6f8f" />
            <stop offset="0.45" stopColor="#e9b878" />
            <stop offset="0.75" stopColor="#f5d9a2" />
            <stop offset="1" stopColor="#f3ead2" />
          </linearGradient>
          <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff4d0" />
            <stop offset="0.35" stopColor="#f1d38a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#f1d38a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2cf8c" stopOpacity="0.85" />
            <stop offset="1" stopColor="#6d8f7e" stopOpacity="0.6" />
          </linearGradient>
          <pattern id="rows" width="28" height="12" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)">
            <path d="M0 10 Q7 0 14 10 T28 10" stroke="#2b4a26" strokeWidth="2.2" fill="none" opacity="0.55" />
          </pattern>
        </defs>
        <rect width="1440" height="900" fill="url(#sky)" />
        <motion.g style={{ y: sun }}>
          <circle cx="980" cy="430" r="260" fill="url(#sunGlow)" />
          <circle cx="980" cy="430" r="58" fill="#fff1c9" />
        </motion.g>
        <motion.g style={{ y: far }}>
          <path d="M0 520 C180 470 300 500 460 470 C640 436 760 492 920 470 C1100 446 1260 480 1440 455 V640 H0Z" fill="#6f8f73" opacity="0.55" />
          <path d="M0 560 C220 520 380 548 560 520 C760 492 900 540 1100 520 C1250 506 1350 520 1440 512 V680 H0Z" fill="#4c6e4f" opacity="0.75" />
          {/* palm line */}
          {[120, 210, 330, 1180, 1270, 1350].map((x, i) => (
            <g key={x} transform={`translate(${x} ${528 - (i % 3) * 6})`} fill="#2c4430">
              <rect x="-2" y="-70" width="4" height="70" />
              <path d="M0 -70 q-30 -2 -44 14 q22 -8 44 -10 q-22 -12 -40 -36 q24 14 40 32 q4 -26 -8 -46 q16 18 8 46 q24 -20 46 -18 q-26 6 -46 18 q32 2 48 18 q-26 -8 -48 -18z" />
            </g>
          ))}
        </motion.g>
        <motion.g style={{ y: mid }}>
          <path d="M0 600 C300 580 520 600 760 588 C1000 576 1200 600 1440 590 V900 H0Z" fill="#355d2c" />
          <path d="M-40 640 L620 610 L760 900 L-40 900Z" fill="url(#water)" />
          <path d="M-40 640 L620 610 L760 900 L-40 900Z" fill="url(#rows)" />
          <path d="M700 612 L1480 600 L1480 900 L860 900Z" fill="#437735" />
          <path d="M700 612 L1480 600 L1480 900 L860 900Z" fill="url(#rows)" opacity="0.8" />
          <path d="M620 610 L700 612 L860 900 L760 900Z" fill="#8f6a3f" />
        </motion.g>
        <g opacity="0.95">
          {Array.from({ length: 46 }).map((_, i) => {
            const x = (i * 37) % 1440
            const h = 40 + ((i * 53) % 50)
            return (
              <path
                key={i}
                d={`M${x} 900 q${4 + (i % 5)} -${h * 0.6} ${-6 + (i % 7)} -${h} M${x + 6} 900 q${-3} -${h * 0.5} ${8} -${h * 0.85}`}
                stroke={i % 4 === 0 ? '#c9a24a' : '#1f3a2b'}
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
              />
            )
          })}
        </g>
      </svg>
    </div>
  )
}
