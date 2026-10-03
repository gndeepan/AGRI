import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LngLatBounds, Map as MLMap, NavigationControl, ScaleControl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/features/map/maplibreWorker'
import type { Geometry, Polygon, Position } from 'geojson'
import type { WaterSource } from '@/api/types'
import { baseStyle } from '@/features/map/basemaps'
import { cn } from '@/lib/utils'
import { useWaterLabels } from './useWaterLabels'
import { addWaterLayers, bindWaterPopup, setWaterData, waterToCollections } from './waterLayers'

function eachPosition(g: Geometry, fn: (p: Position) => void) {
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') fn(c as Position)
    else if (Array.isArray(c)) c.forEach(walk)
  }
  if (g.type === 'GeometryCollection') g.geometries.forEach((x) => eachPosition(x, fn))
  else walk(g.coordinates)
}

export function geometryBounds(g: Geometry): LngLatBounds {
  const b = new LngLatBounds()
  eachPosition(g, (p) => b.extend([p[0], p[1]] as [number, number]))
  return b
}

/** Field outline + water features on an OpenStreetMap basemap. Reuses the shared water layers. */
export function WaterMiniMap({
  field,
  sources,
  radiusM,
  focusId,
  className,
}: {
  field: Polygon
  sources: WaterSource[]
  radiusM: number
  focusId?: string | null
  className?: string
}) {
  const { i18n } = useTranslation()
  const labels = useWaterLabels()
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const readyRef = useRef(false)
  const collections = useMemo(() => waterToCollections(sources, i18n.language, labels), [sources, i18n.language, labels])
  const latest = useRef({ collections, field, radiusM })
  latest.current = { collections, field, radiusM }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let map: MLMap
    try {
      map = new MLMap({
        container: el,
        style: baseStyle,
        center: [78.7, 10.8],
        zoom: 12,
        attributionControl: { compact: true },
        cooperativeGestures: true,
        maxZoom: 19,
      })
    } catch {
      return
    }
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    let unbind = () => {}
    map.on('load', () => {
      const { collections: c, field: f, radiusM: r } = latest.current
      map.addSource('mini-field', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: f } })
      addWaterLayers(map)
      map.addLayer({ id: 'mini-field-fill', type: 'fill', source: 'mini-field', paint: { 'fill-color': '#f2c14e', 'fill-opacity': 0.3 } })
      map.addLayer({ id: 'mini-field-line', type: 'line', source: 'mini-field', paint: { 'line-color': '#f2c14e', 'line-width': 2.5 } })
      setWaterData(map, c)
      fit(map, f, r)
      unbind = bindWaterPopup(map, labels)
      readyRef.current = true
    })
    return () => {
      readyRef.current = false
      unbind()
      map.remove()
      mapRef.current = null
    }
    // The map is created once; data and fitting are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    setWaterData(map, collections)
    ;(map.getSource('mini-field') as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: field })
  }, [collections, field])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    fit(map, field, radiusM)
  }, [radiusM, field])

  useEffect(() => {
    const map = mapRef.current
    const s = sources.find((x) => x.id === focusId)
    if (!map || !readyRef.current || !s) return
    const b = geometryBounds(s.geometry)
    eachPosition(field, (p) => b.extend([p[0], p[1]] as [number, number]))
    map.fitBounds(b, { padding: 50, maxZoom: 16, duration: 700 })
  }, [focusId, sources, field])

  return <div ref={ref} className={cn('h-72 w-full overflow-hidden rounded-xl sm:h-96', className)} role="application" />
}

function fit(map: MLMap, field: Polygon, radiusM: number) {
  const b = geometryBounds(field)
  const c = b.getCenter()
  const dLat = radiusM / 111_320
  const dLon = radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180))
  b.extend([c.lng - dLon, c.lat - dLat]).extend([c.lng + dLon, c.lat + dLat])
  map.fitBounds(b, { padding: 24, duration: 0 })
}
