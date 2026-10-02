import { format, parseISO } from 'date-fns'
import { enIN, ta } from 'date-fns/locale'
import type { AreaUnit, LandMetrics } from '@/api/types'

export function formatArea(m: Pick<LandMetrics, 'area_acres' | 'area_ha'>, unit: AreaUnit, lang = 'en'): string {
  const v = unit === 'acre' ? m.area_acres : m.area_ha
  const n = new Intl.NumberFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', { maximumFractionDigits: v < 10 ? 2 : 1 }).format(v)
  return `${n} ${unit === 'acre' ? (lang === 'ta' ? 'ஏக்கர்' : 'ac') : lang === 'ta' ? 'ஹெக்டேர்' : 'ha'}`
}

export function formatNumber(v: number | null | undefined, digits = 1, lang = 'en'): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', { maximumFractionDigits: digits }).format(v)
}

export function formatM2(v: number, lang = 'en') {
  return `${formatNumber(v, 0, lang)} m²`
}

export function formatMeters(v: number, lang = 'en') {
  return v >= 1000 ? `${formatNumber(v / 1000, 2, lang)} km` : `${formatNumber(v, 0, lang)} m`
}

export function formatCoord(v: number, axis: 'lat' | 'lon'): string {
  const hemi = axis === 'lat' ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W'
  return `${Math.abs(v).toFixed(5)}° ${hemi}`
}

export function formatDate(d: string | Date | null | undefined, pattern = 'd MMM yyyy', lang = 'en'): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, pattern, { locale: lang === 'ta' ? ta : enIN })
}

export function windDirLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

export function i18nText(t: { en: string; ta: string } | null | undefined, lang: string): string {
  if (!t) return ''
  return lang === 'ta' ? t.ta || t.en : t.en
}
