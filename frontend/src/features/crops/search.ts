import type { Crop, Variety, VarietyGroup } from '@/api/types'

export const GROUP_ORDER: VarietyGroup[] = ['custom', 'tn', 'kerala', 'national', 'traditional']

export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9஀-௿]/g, '')
}

function haystack(v: Variety): string[] {
  return [v.name, ...v.aliases, v.grain_type ?? '', v.institute ?? '', ...v.regions].map(normalize)
}

/** 3 = exact name/alias, 2 = prefix, 1 = substring anywhere (incl. grain type, institute, region), 0 = no match. */
export function varietyScore(v: Variety, query: string): number {
  const q = normalize(query)
  if (!q) return 1
  const labels = [v.name, ...v.name.split(/[()]/), ...v.aliases].map(normalize).filter(Boolean)
  if (labels.includes(q)) return 3
  if (labels.some((l) => l.startsWith(q))) return 2
  return haystack(v).some((h) => h.includes(q)) ? 1 : 0
}

export function groupVarieties(varieties: Variety[], query: string): { group: VarietyGroup; items: Variety[] }[] {
  const scored = varieties
    .map((v) => ({ v, s: varietyScore(v, query) }))
    .filter((x) => x.s > 0)
  const groups = new Map<VarietyGroup, { v: Variety; s: number }[]>()
  for (const x of scored) {
    const g = x.v.is_custom ? 'custom' : (x.v.group ?? 'national')
    groups.set(g, [...(groups.get(g) ?? []), x])
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
    group: g,
    items: groups
      .get(g)!
      .sort((a, b) => b.s - a.s || a.v.duration_days - b.v.duration_days || a.v.name.localeCompare(b.v.name))
      .map((x) => x.v),
  }))
}

export function cropMatches(c: Crop, query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  return [c.name.en, c.name.ta, c.scientific_name, c.slug, c.category].some((x) => normalize(x).includes(q))
}

export function formatRange([lo, hi]: [number, number]): string {
  return lo === hi ? `${lo}` : `${lo}–${hi}`
}
