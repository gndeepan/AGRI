import turfArea from '@turf/area'
import turfLength from '@turf/length'
import turfCentroid from '@turf/centroid'
import turfBbox from '@turf/bbox'
import { lineString, polygon as turfPolygon } from '@turf/helpers'
import type { Polygon, Position } from 'geojson'
import type { LandMetrics } from '@/api/types'

const M2_PER_ACRE = 4046.8564224

/** Closes a ring and drops consecutive duplicate vertices. */
export function normalizeRing(ring: Position[]): Position[] {
  const out: Position[] = []
  for (const p of ring) {
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([p[0], p[1]])
  }
  if (out.length > 0) {
    const [f, l] = [out[0], out[out.length - 1]]
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]])
  }
  return out
}

/**
 * Client-side PREVIEW of field metrics (geodesic area on a sphere via turf).
 * The server (pyproj on the WGS84 ellipsoid) is authoritative; this only drives
 * the live readout while the user drags vertices.
 */
export function previewMetrics(poly: Polygon): LandMetrics | null {
  const ring = normalizeRing(poly.coordinates[0] ?? [])
  if (ring.length < 4) return null
  const p = turfPolygon([ring, ...poly.coordinates.slice(1).map(normalizeRing)])
  const area = turfArea(p)
  const perimeter = turfLength(lineString(ring), { units: 'kilometers' }) * 1000
  const c = turfCentroid(p).geometry.coordinates
  const bb = turfBbox(p) as [number, number, number, number]
  return {
    area_m2: area,
    area_ha: area / 10_000,
    area_acres: area / M2_PER_ACRE,
    perimeter_m: perimeter,
    centroid: { lat: c[1], lon: c[0] },
    representative_point: { lat: c[1], lon: c[0] },
    bbox: bb,
    vertex_count: ring.length - 1,
  }
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const o = (p: Position, q: Position, r: Position) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}

/** Quick client-side check so we can warn before the server rejects the geometry. */
export function isSelfIntersecting(poly: Polygon): boolean {
  const r = normalizeRing(poly.coordinates[0] ?? [])
  const n = r.length - 1
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue
      if (segmentsIntersect(r[i], r[i + 1], r[j], r[j + 1])) return true
    }
  return false
}
