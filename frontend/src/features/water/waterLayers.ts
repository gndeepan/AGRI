import { Popup, type GeoJSONSource, type Map as MLMap, type MapLayerMouseEvent } from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { WaterKind, WaterSource } from '@/api/types'
import { KIND_COLOR, formatDistance, waterName } from './format'

const SRC = { areas: 'water-areas', lines: 'water-lines', points: 'water-points', links: 'water-links' } as const
const LAYER_IDS = ['water-area-fill', 'water-area-line', 'water-line', 'water-point', 'water-link', 'water-label'] as const
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

type Props = {
  id: string
  kind: WaterKind
  color: string
  label: string
  seasonal: boolean
  osm_url: string
  distance_m: number
  direction: string | null
}

export interface WaterLabels {
  /** Localised kind names, e.g. { tank: 'Tank (eri / kanmai)' }. */
  kind: Record<WaterKind, string>
  unnamed: (kind: string) => string
  direction: (d: string) => string
  away: (distance: string) => string
  adjoining: string
  seasonal: string
  openOsm: string
}

export interface WaterCollections {
  areas: FeatureCollection<Geometry, Props>
  lines: FeatureCollection<Geometry, Props>
  points: FeatureCollection<Geometry, Props>
  links: FeatureCollection<Geometry, Props>
}

/**
 * Split sources into polygons / lines / points for styling, plus a dashed link from the field to the
 * nearest source of each kind. Pure so it can be unit-tested.
 */
export function waterToCollections(sources: WaterSource[], lang: string, labels: WaterLabels): WaterCollections {
  const out: WaterCollections = {
    areas: { type: 'FeatureCollection', features: [] },
    lines: { type: 'FeatureCollection', features: [] },
    points: { type: 'FeatureCollection', features: [] },
    links: { type: 'FeatureCollection', features: [] },
  }
  const nearestSeen = new Set<WaterKind>()
  for (const s of sources) {
    const kindLabel = labels.kind[s.kind]
    const name = waterName(s, lang) ?? labels.unnamed(kindLabel)
    const props: Props = {
      id: s.id, kind: s.kind, color: KIND_COLOR[s.kind], seasonal: s.seasonal, osm_url: s.osm_url,
      distance_m: s.distance_m, direction: s.direction,
      label: `${name} · ${s.adjoining ? labels.adjoining : formatDistance(s.distance_m)}`,
    }
    const feature: Feature<Geometry, Props> = { type: 'Feature', geometry: s.geometry, properties: props }
    const g = s.geometry.type
    if (g === 'Polygon' || g === 'MultiPolygon') out.areas.features.push(feature)
    else if (g === 'Point' || g === 'MultiPoint') out.points.features.push(feature)
    else out.lines.features.push(feature)
    // Sources are sorted by distance, so the first of each kind is the nearest.
    if (!nearestSeen.has(s.kind) && !s.adjoining) {
      nearestSeen.add(s.kind)
      out.links.features.push({
        type: 'Feature',
        properties: { ...props, label: '' },
        geometry: {
          type: 'LineString',
          coordinates: [[s.field_point.lon, s.field_point.lat], [s.nearest_point.lon, s.nearest_point.lat]],
        },
      })
    }
  }
  return out
}

/** Adds sources + layers (idempotent). Water sits under field outlines when `beforeId` exists. */
export function addWaterLayers(map: MLMap, beforeId?: string) {
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined
  for (const id of Object.values(SRC)) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY })
  if (map.getLayer('water-area-fill')) return
  const color = ['get', 'color'] as never
  map.addLayer({ id: 'water-area-fill', type: 'fill', source: SRC.areas, paint: { 'fill-color': color, 'fill-opacity': 0.55 } }, before)
  map.addLayer({ id: 'water-area-line', type: 'line', source: SRC.areas, paint: { 'line-color': color, 'line-width': 1.5, 'line-opacity': 0.9 } }, before)
  map.addLayer({
    id: 'water-line', type: 'line', source: SRC.lines,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color, 'line-opacity': 0.92,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 15, 4] as never,
      'line-dasharray': ['case', ['get', 'seasonal'], ['literal', [2, 2]], ['literal', [1, 0]]] as never,
    },
  }, before)
  map.addLayer({
    id: 'water-point', type: 'circle', source: SRC.points,
    paint: { 'circle-radius': 6, 'circle-color': color, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
  }, before)
  map.addLayer({
    id: 'water-link', type: 'line', source: SRC.links,
    paint: { 'line-color': '#f2c14e', 'line-width': 1.6, 'line-dasharray': [2, 2], 'line-opacity': 0.95 },
  })
  map.addLayer({
    id: 'water-label', type: 'symbol', source: SRC.areas, minzoom: 11,
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': false },
    paint: { 'text-color': '#f4fbff', 'text-halo-color': 'rgba(10,40,80,0.85)', 'text-halo-width': 1.4 },
  })
}

export function setWaterData(map: MLMap, c: WaterCollections | null) {
  const data = c ?? { areas: EMPTY, lines: EMPTY, points: EMPTY, links: EMPTY }
  for (const [key, id] of Object.entries(SRC)) {
    ;(map.getSource(id) as GeoJSONSource | undefined)?.setData(data[key as keyof WaterCollections] as FeatureCollection)
  }
}

export function setWaterVisible(map: MLMap, visible: boolean) {
  for (const id of LAYER_IDS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}

const CLICKABLE = ['water-area-fill', 'water-line', 'water-point'] as const

/** Click → popup (built with DOM nodes, never innerHTML: OSM names are user-contributed). Returns cleanup. */
export function bindWaterPopup(map: MLMap, labels: WaterLabels): () => void {
  let popup: Popup | null = null
  const onClick = (e: MapLayerMouseEvent) => {
    const p = e.features?.[0]?.properties as Props | undefined
    if (!p) return
    const box = document.createElement('div')
    box.style.cssText = 'font:500 13px Manrope,system-ui,sans-serif;color:#12241a;max-width:220px'
    const title = document.createElement('div')
    title.style.fontWeight = '700'
    title.textContent = p.label.split(' · ')[0]
    const meta = document.createElement('div')
    meta.textContent = `${labels.kind[p.kind]} · ${labels.away(formatDistance(p.distance_m))}${p.direction ? ` · ${labels.direction(p.direction)}` : ''}`
    box.append(title, meta)
    if (p.seasonal) {
      const s = document.createElement('div')
      s.style.opacity = '0.75'
      s.textContent = labels.seasonal
      box.append(s)
    }
    const a = document.createElement('a')
    a.href = p.osm_url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.cssText = 'color:#1f5fbf;text-decoration:underline'
    a.textContent = labels.openOsm
    box.append(a)
    popup?.remove()
    popup = new Popup({ closeButton: true, maxWidth: '240px' }).setLngLat(e.lngLat).setDOMContent(box).addTo(map)
  }
  const enter = () => (map.getCanvas().style.cursor = 'pointer')
  const leave = () => (map.getCanvas().style.cursor = '')
  for (const id of CLICKABLE) {
    map.on('click', id, onClick)
    map.on('mouseenter', id, enter)
    map.on('mouseleave', id, leave)
  }
  return () => {
    popup?.remove()
    for (const id of CLICKABLE) {
      map.off('click', id, onClick)
      map.off('mouseenter', id, enter)
      map.off('mouseleave', id, leave)
    }
  }
}
