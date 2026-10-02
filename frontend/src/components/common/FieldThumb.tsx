import type { Polygon } from 'geojson'
import { cn } from '@/lib/utils'

/** Tiny SVG silhouette of a field boundary (equirectangular, latitude-corrected). */
export function FieldThumb({ boundary, className }: { boundary: Polygon; className?: string }) {
  const ring = boundary.coordinates[0] ?? []
  if (ring.length < 3) return <div className={cn('rounded-lg bg-muted', className)} />
  const lat0 = (ring.reduce((s, c) => s + c[1], 0) / ring.length) * (Math.PI / 180)
  const pts = ring.map(([x, y]) => [x * Math.cos(lat0), -y])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const size = Math.max(maxX - minX, maxY - minY) || 1
  const d = pts
    .map(([x, y], i) => `${i ? 'L' : 'M'}${(((x - minX) / size) * 80 + 10 + (80 - ((maxX - minX) / size) * 80) / 2).toFixed(2)} ${(((y - minY) / size) * 80 + 10 + (80 - ((maxY - minY) / size) * 80) / 2).toFixed(2)}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 100" className={cn('rounded-xl bg-paddy-50 dark:bg-paddy-900', className)} aria-hidden>
      <path d={`${d} Z`} fill="#7fb069" fillOpacity="0.45" stroke="#355d2c" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}
