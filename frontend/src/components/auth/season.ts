/**
 * Shared clock and crop keyframes for the auth-screen season loop. Both the SVG poster
 * (SeasonScene) and the 3D scene (login3d) read the same clock, so captions, timeline bar and
 * visuals stay in step when the 3D layer cross-fades in over the SVG.
 */

export const CYCLE_MS = 36000
export const DAYS_PER_CYCLE = 4
export const STAGES = [
  { key: 'transplanting', day: 1 },
  { key: 'tillering', day: 30 },
  { key: 'flowering', day: 75 },
  { key: 'harvest', day: 115 },
] as const

export type RGB = [number, number, number]
export const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
export const lerp = (a: number, b: number, f: number) => a + (b - a) * f
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const smooth = (f: number) => f * f * (3 - 2 * f)

/** Piecewise-smooth interpolation over keyframes sorted by `at`. */
export function sample<T extends { at: number }>(keys: T[], t: number, pick: (a: T, b: T, f: number) => void) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t >= a.at && t <= b.at) return pick(a, b, smooth((t - a.at) / (b.at - a.at || 1)))
  }
  const last = keys[keys.length - 1]
  pick(last, last, 0)
}

export const CROP = [
  { at: 0.0, grow: 0.3, leaf: '#9ccb62', grain: '#dfe6a0', panicle: 0, water: 0.9 },
  { at: 0.25, grow: 0.66, leaf: '#4f9a3c', grain: '#dfe6a0', panicle: 0, water: 0.8 },
  { at: 0.5, grow: 0.95, leaf: '#3c7c31', grain: '#e3e9b0', panicle: 0.65, water: 0.6 },
  { at: 0.72, grow: 1, leaf: '#6d8f39', grain: '#d8c25e', panicle: 1, water: 0.28 },
  { at: 0.9, grow: 1, leaf: '#b39a46', grain: '#e5b548', panicle: 1, water: 0.04 },
  { at: 1.0, grow: 1, leaf: '#b39a46', grain: '#e5b548', panicle: 1, water: 0.04 },
].map((k) => ({ ...k, leafC: hex(k.leaf), grainC: hex(k.grain) }))

/** Deterministic PRNG so layouts are identical on every render. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const EPOCH = typeof performance !== 'undefined' ? performance.now() : 0

/** Position in the season loop (0..1) for a `performance.now()`-style timestamp. */
export function seasonAt(now: number): number {
  return (((now - EPOCH) % CYCLE_MS) + CYCLE_MS) % CYCLE_MS / CYCLE_MS
}

export function stageIndex(season: number): number {
  return Math.min(STAGES.length - 1, Math.floor(season * STAGES.length))
}

/** Harvest → re-transplant seam: 1 for most of the loop, dipping to 0 at the wrap. */
export function seamAt(season: number): number {
  const s = season > 0.95 ? 1 - (season - 0.95) / 0.05 : season < 0.03 ? season / 0.03 : 1
  return smooth(clamp01(s))
}

export interface CropState {
  grow: number
  /** Linear 0..1 RGB. */
  leaf: RGB
  grain: RGB
  panicle: number
  water: number
  presence: number
}

/** Crop look for a season position; pure and deterministic. */
export function cropAt(season: number): CropState {
  const out: CropState = { grow: 0, leaf: [0, 0, 0], grain: [0, 0, 0], panicle: 0, water: 0, presence: seamAt(season) }
  sample(CROP, season, (a, b, f) => {
    out.grow = lerp(a.grow, b.grow, f)
    out.leaf = a.leafC.map((v, i) => lerp(v, b.leafC[i], f) / 255) as RGB
    out.grain = a.grainC.map((v, i) => lerp(v, b.grainC[i], f) / 255) as RGB
    out.panicle = lerp(a.panicle, b.panicle, f)
    out.water = lerp(a.water, b.water, f)
  })
  return out
}
