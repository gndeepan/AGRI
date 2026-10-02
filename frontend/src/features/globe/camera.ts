import type { Bbox, GlobeField } from './types'

/** Tamil Nadu state extent, used when a farmer has no fields yet. */
export const TAMIL_NADU_BBOX: Bbox = [76.2, 8.0, 80.4, 13.6]
/** Paddy belt along the Kaveri near Thiruvaiyaru (Thanjavur) — close enough for satellite detail. */
export const KAVERI_DELTA_BBOX: Bbox = [79.03, 10.8, 79.17, 10.9]

export function unionBbox(boxes: Bbox[]): Bbox | null {
  if (boxes.length === 0) return null
  return boxes.reduce<Bbox>(
    (acc, b) => [Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
}

export function bboxCenter(b: Bbox): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
}

export function fieldsBbox(fields: GlobeField[]): Bbox | null {
  return unionBbox(fields.map((f) => f.bbox))
}

/** Starting longitude for the spin: a quarter turn west of the target so the approach sweeps in. */
export function spinStart(target: [number, number]): [number, number] {
  return [target[0] - 70, Math.max(-20, Math.min(30, target[1] * 0.6))]
}
