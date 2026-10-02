import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import ta from './locales/ta.json'

function flatten(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

// Raw source of every app module (field3d excluded: it has no UI strings).
const SOURCES = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.*', '!../features/field3d/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const enKeys = new Set(flatten(en))
const taKeys = new Set(flatten(ta))

describe('translations', () => {
  it('has identical key sets in English and Tamil', () => {
    expect([...enKeys].filter((k) => !taKeys.has(k))).toEqual([])
    expect([...taKeys].filter((k) => !enKeys.has(k))).toEqual([])
  })

  it('keeps interpolation placeholders consistent', () => {
    const get = (o: unknown, k: string) => k.split('.').reduce((a, p) => (a as Record<string, unknown>)?.[p], o) as string
    const bad = [...enKeys].filter((k) => {
      const ph = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort().join()
      return ph(get(en, k)) !== ph(get(ta, k))
    })
    expect(bad).toEqual([])
  })

  it('defines every static t() key used in the app', () => {
    const missing = new Set<string>()
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20)
    for (const [file, src] of Object.entries(SOURCES)) {
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!enKeys.has(m[1])) missing.add(`${m[1]} (${file})`)
      // Validation messages are i18n keys produced by Zod schemas.
      for (const m of src.matchAll(/'(validation\.[a-zA-Z]+)'/g)) if (!enKeys.has(m[1])) missing.add(`${m[1]} (${file})`)
    }
    expect([...missing]).toEqual([])
  })
})
