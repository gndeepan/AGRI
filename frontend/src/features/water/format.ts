import type { WaterKind, WaterSource } from '@/api/types'

export const WATER_KINDS: WaterKind[] = ['tank', 'pond', 'river', 'canal', 'stream', 'lake', 'well', 'drain']

/** Colour per kind, shared by the map layers, legend and list icons. */
export const KIND_COLOR: Record<WaterKind, string> = {
  river: '#2f7fd1',
  canal: '#2aa6b8',
  stream: '#5aa9e6',
  drain: '#8aa1b5',
  tank: '#1f5fbf',
  pond: '#3c9be0',
  lake: '#15509a',
  well: '#7b4fc9',
}

export function formatDistance(m: number): string {
  if (m < 1) return '0 m'
  if (m < 1000) return `${Math.round(m)} m`
  const km = m / 1000
  return `${km >= 10 ? Math.round(km) : Math.round(km * 10) / 10} km`
}

/** Hectares for tanks/ponds, m² for tiny pools. */
export function formatWaterArea(m2: number): string {
  if (m2 < 10_000) return `${Math.round(m2).toLocaleString('en-IN')} m²`
  const ha = m2 / 10_000
  return `${ha >= 100 ? Math.round(ha) : Math.round(ha * 10) / 10} ha`
}

/** Name in the UI language, falling back to the other one. */
export function waterName(s: Pick<WaterSource, 'name' | 'name_ta'>, lang: string): string | null {
  return (lang.startsWith('ta') ? s.name_ta || s.name : s.name || s.name_ta) || null
}

export function countByKind(sources: WaterSource[]): Partial<Record<WaterKind, number>> {
  const out: Partial<Record<WaterKind, number>> = {}
  for (const s of sources) out[s.kind] = (out[s.kind] ?? 0) + 1
  return out
}

export const RADII_M = [2000, 5000, 10000] as const
