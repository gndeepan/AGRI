export type Tier = 'high' | 'mid' | 'low'

export interface TierSettings {
  /** Rice clumps in the near/mid/far bands. */
  near: number
  mid: number
  far: number
  dpr: number
  dof: boolean
  godRays: boolean
  /** fbm octaves in sky/water shaders. */
  octaves: number
}

export const TIERS: Record<Tier, TierSettings> = {
  high: { near: 5200, mid: 2600, far: 1400, dpr: 1.5, dof: true, godRays: true, octaves: 5 },
  mid: { near: 3200, mid: 1600, far: 900, dpr: 1.25, dof: true, godRays: false, octaves: 4 },
  low: { near: 1800, mid: 900, far: 500, dpr: 1, dof: false, godRays: false, octaves: 3 },
}

interface DeviceHints {
  cores?: number
  dpr?: number
  mobile?: boolean
  memoryGb?: number
}

/** Picks a render tier from coarse device hints; conservative when hints are missing. */
export function pickTier(h: DeviceHints): Tier {
  const cores = h.cores ?? 4
  if (h.mobile || cores <= 4 || (h.memoryGb !== undefined && h.memoryGb <= 4)) return 'low'
  if (cores >= 8 && (h.dpr ?? 1) <= 2.5) return 'high'
  return 'mid'
}

export function detectTier(): Tier {
  if (typeof navigator === 'undefined') return 'low'
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } }
  return pickTier({
    cores: nav.hardwareConcurrency,
    dpr: window.devicePixelRatio,
    mobile: nav.userAgentData?.mobile ?? /Mobi|Android/i.test(nav.userAgent),
    memoryGb: nav.deviceMemory,
  })
}

/** Next tier down, used when the measured frame rate is too low. */
export function degrade(t: Tier): Tier {
  return t === 'high' ? 'mid' : 'low'
}
