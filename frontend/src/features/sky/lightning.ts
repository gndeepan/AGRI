/**
 * Deterministic lightning: events are scheduled from a hash of (seed, time slot), so the same
 * hour always flashes the same way and nothing depends on frame timing.
 *
 * Photosensitivity: at most one event per SLOT_S seconds (well under the WCAG 2.3.1 limit of three
 * flashes per second), and full-screen flash brightness is capped.
 */

export const SLOT_S = 2.4
const EVENT_S = 0.6
export const MAX_SCREEN_FLASH = 0.14

export interface LightningEvent {
  /** Start time in seconds (same clock as the renderer). */
  t0: number
  kind: 'bolt' | 'cloud'
  /** Horizontal position 0..1 across the view. */
  x: number
  /** Simulated distance (km); thunder arrives distance / 0.343 s later. */
  distanceKm: number
  seed: number
}

function hash(a: number, b: number): number {
  let h = Math.imul((a * 4294967296) | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

export function eventInSlot(seed: number, thunder: number, slot: number): LightningEvent | null {
  if (thunder <= 0) return null
  if (hash(seed, slot * 7 + 1) > 0.5 * thunder) return null
  return {
    t0: slot * SLOT_S + hash(seed, slot * 7 + 2) * (SLOT_S - EVENT_S),
    kind: hash(seed, slot * 7 + 3) < 0.55 ? 'bolt' : 'cloud',
    x: 0.12 + hash(seed, slot * 7 + 4) * 0.76,
    distanceKm: 0.2 + hash(seed, slot * 7 + 5) * 1.2,
    seed: hash(seed, slot * 7 + 6),
  }
}

/** The event visible at time t, if any. */
export function activeEvent(seed: number, thunder: number, t: number): LightningEvent | null {
  const e = eventInSlot(seed, thunder, Math.floor(t / SLOT_S))
  return e && t >= e.t0 && t < e.t0 + EVENT_S ? e : null
}

/** Flash envelope 0..1 for an event at time t: a main stroke plus one or two return strokes. */
export function flashEnvelope(e: LightningEvent, t: number): number {
  const dt = t - e.t0
  if (dt < 0 || dt > EVENT_S) return 0
  const pulse = (start: number, k: number, amp: number) => (dt >= start ? amp * Math.exp(-(dt - start) * k) : 0)
  const restrike = 0.09 + e.seed * 0.08
  return Math.min(1, pulse(0, 14, 1) + pulse(restrike, 18, 0.7) + (e.seed > 0.5 ? pulse(restrike * 2.1, 22, 0.45) : 0))
}

export interface Segment { x1: number; y1: number; x2: number; y2: number; width: number; glow: number }

/**
 * Bolt geometry by midpoint displacement, in normalised view coordinates (x 0..1 left→right,
 * y 0 bottom → 1 top). Branches fork off the main channel and are thinner and dimmer.
 */
export function boltSegments(e: LightningEvent, cloudBaseY = 0.82, groundY = -0.02): Segment[] {
  let s = Math.floor(e.seed * 1e9) || 1
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const out: Segment[] = []
  const channel = (x1: number, y1: number, x2: number, y2: number, disp: number, depth: number, width: number, glow: number, branches: boolean) => {
    if (depth === 0) {
      out.push({ x1, y1, x2, y2, width, glow })
      return
    }
    const mx = (x1 + x2) / 2 + (rnd() - 0.5) * disp
    const my = (y1 + y2) / 2 + (rnd() - 0.5) * disp * 0.25
    channel(x1, y1, mx, my, disp / 2, depth - 1, width, glow, branches)
    channel(mx, my, x2, y2, disp / 2, depth - 1, width, glow, branches)
    if (branches && depth >= 3 && rnd() < 0.35) {
      const len = (y1 - y2) * (0.5 + rnd() * 0.6)
      const dir = rnd() < 0.5 ? -1 : 1
      channel(mx, my, mx + dir * len * (0.4 + rnd() * 0.5), my - len, disp * 0.6, depth - 2, width * 0.5, glow * 0.6, false)
    }
  }
  const endX = e.x + (rnd() - 0.5) * 0.18
  channel(e.x, cloudBaseY, endX, groundY, 0.22, 7, 1, 1, true)
  return out
}
