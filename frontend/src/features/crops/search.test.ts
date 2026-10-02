import { describe, expect, it } from 'vitest'
import type { Crop, Variety } from '@/api/types'
import { cropMatches, groupVarieties, varietyScore } from './search'

// Synthetic fixtures (not catalog data).
const v = (name: string, group: Variety['group'], extra: Partial<Variety> = {}): Variety => ({
  id: name, name, duration_days: 110, duration_range: [110, 110], duration_group: 'short', seasons: [], notes: null,
  reference: null, aliases: [], grain_type: null, group, institute: null, release_year: null, regions: [],
  seasons_text: null, verified: true, source: 'catalog', is_custom: false, ...extra,
})

const list = [
  v('Jyothi (PTB 39)', 'kerala', { aliases: ['Matta', 'Jyothy'], grain_type: 'Long bold, red', duration_days: 118 }),
  v('Kanchana (PTB 50)', 'kerala', { aliases: ['Matta'], duration_days: 108 }),
  v('ADT (R) 45', 'tn', { aliases: ['ADT 45'] }),
  v('My Seeraga', 'custom', { is_custom: true, verified: false, source: 'user' }),
]

describe('variety search', () => {
  it('matches aliases, name parts and grain type', () => {
    expect(varietyScore(list[0], 'matta')).toBe(3)
    expect(varietyScore(list[0], 'Jyothi')).toBe(3)
    expect(varietyScore(list[0], 'ptb')).toBe(2)
    expect(varietyScore(list[0], 'red')).toBe(1)
    expect(varietyScore(list[2], 'adt45')).toBe(3)
    expect(varietyScore(list[2], 'matta')).toBe(0)
  })

  it('groups with farmer varieties first and keeps only matches', () => {
    const all = groupVarieties(list, '')
    expect(all.map((g) => g.group)).toEqual(['custom', 'tn', 'kerala'])
    const matta = groupVarieties(list, 'matta')
    expect(matta).toHaveLength(1)
    expect(matta[0].items.map((x) => x.name)).toEqual(['Kanchana (PTB 50)', 'Jyothi (PTB 39)'])
  })

  it('finds crops by English, Tamil or scientific name', () => {
    const crop = { slug: 'paddy', name: { en: 'Paddy (Rice)', ta: 'நெல்' }, scientific_name: 'Oryza sativa', category: 'cereal' } as Crop
    expect(cropMatches(crop, 'rice')).toBe(true)
    expect(cropMatches(crop, 'நெல்')).toBe(true)
    expect(cropMatches(crop, 'oryza')).toBe(true)
    expect(cropMatches(crop, 'banana')).toBe(false)
  })
})
