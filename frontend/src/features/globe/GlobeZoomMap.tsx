import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Map as MLMap, type FitBoundsOptions, type GeoJSONSource, type RasterSourceSpecification, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/features/map/maplibreWorker'
import type { FeatureCollection, Polygon } from 'geojson'
import { RotateCcw } from 'lucide-react'
import { baseStyle } from '@/features/map/basemaps'
import { cn } from '@/lib/utils'
import { bboxCenter, fieldsBbox, spinStart } from './camera'
import type { Bbox, GlobeField, GlobeZoomProps } from './types'

/**
 * Photo-real globe: Esri World Imagery from orbit down to the field, with Esri's
 * boundaries/places reference labels fading in as the camera descends.
 */
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: baseStyle.glyphs,
  sources: {
    satellite: baseStyle.sources['esri-imagery'] as RasterSourceSpecification,
    labels: baseStyle.sources['esri-labels'] as RasterSourceSpecification,
  },
  layers: [
    { id: 'space', type: 'background', paint: { 'background-color': '#000000' } },
    { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 300 } },
    {
      id: 'labels',
      type: 'raster',
      source: 'labels',
      minzoom: 3,
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 5, 0.85, 15, 0.7] },
    },
  ],
}
const GOLD = '#f2c14e'
const LOAD_TIMEOUT_MS = 15000

type Phase = 'idle' | 'intro' | 'orbit' | 'user'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function isSmallScreen() {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * Resolves on the next `moveend`; map.stop() also fires it, so aborted animations never hang.
 * Any running animation is stopped first: camera methods stop it internally and fire `moveend`
 * synchronously, which would otherwise resolve (or re-trigger) this listener immediately.
 */
function moveEnd(map: MLMap, start: () => void): Promise<void> {
  map.stop()
  return new Promise((resolve) => {
    map.once('moveend', () => resolve())
    start()
  })
}

function fieldCollection(fields: GlobeField[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: fields.map((f) => ({
      type: 'Feature',
      id: f.id,
      properties: { id: f.id, label: f.label },
      geometry: f.boundary,
    })),
  }
}

function addOverlays(map: MLMap, fields: GlobeField[]) {
  map.setProjection({ type: 'globe' })
  // Blue atmospheric limb from orbit; at low altitude it becomes a hazy daylight horizon.
  map.setSky({
    'sky-color': '#5d9fe0',
    'horizon-color': '#cfe6ff',
    'fog-color': '#d8e8f5',
    'sky-horizon-blend': 0.5,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.85,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 10, 0],
  })

  map.addSource('fields', { type: 'geojson', data: fieldCollection(fields) })
  map.addLayer({ id: 'fields-fill', type: 'fill', source: 'fields', paint: { 'fill-color': GOLD, 'fill-opacity': 0.16 } })
  map.addLayer({
    id: 'fields-glow',
    type: 'line',
    source: 'fields',
    paint: { 'line-color': GOLD, 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.7 },
  })
  map.addLayer({
    id: 'fields-line',
    type: 'line',
    source: 'fields',
    paint: { 'line-color': '#ffe2a0', 'line-width': 2.2 },
  })
  map.addLayer({
    id: 'fields-label',
    type: 'symbol',
    source: 'fields',
    minzoom: 11,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 14,
      'text-allow-overlap': false,
    },
    paint: { 'text-color': '#fff6dc', 'text-halo-color': 'rgba(20,24,16,0.85)', 'text-halo-width': 1.6 },
  })
}

export default function GlobeZoomMap({
  fields = [],
  fallbackBbox,
  interactive = true,
  showControls = true,
  onFieldClick,
  className,
  onFailed,
}: GlobeZoomProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const runRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const visibleRef = useRef(true)
  const startedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const target: Bbox = useMemo(() => fieldsBbox(fields) ?? fallbackBbox, [fields, fallbackBbox])
  const hasFields = fields.length > 0
  const small = isSmallScreen()
  const pitch = small ? 38 : 56
  const latest = useRef({ onFieldClick, onFailed })
  latest.current = { onFieldClick, onFailed }

  const fitOptions = useCallback((map: MLMap): FitBoundsOptions => {
    const { clientWidth: w, clientHeight: h } = map.getContainer()
    const pad = Math.round(Math.min(w, h) * (hasFields ? 0.22 : 0.08))
    return { padding: pad, pitch, bearing: -24, maxZoom: hasFields ? 17.5 : 12 }
  }, [hasFields, pitch])

  const orbit = useCallback((run: number) => {
    const map = mapRef.current
    if (!map || small || prefersReducedMotion() || run !== runRef.current || !visibleRef.current) return
    if (phaseRef.current === 'orbit' && map.isMoving()) return
    phaseRef.current = 'orbit'
    void moveEnd(map, () => map.easeTo({ bearing: map.getBearing() - 24, duration: 24000, easing: (x) => x })).then(() => {
      if (run === runRef.current && phaseRef.current === 'orbit' && visibleRef.current) orbit(run)
    })
  }, [small])

  const play = useCallback(async () => {
    const map = mapRef.current
    if (!map) return
    const run = ++runRef.current
    map.stop()
    const center = bboxCenter(target)
    if (prefersReducedMotion()) {
      map.fitBounds(target, { ...fitOptions(map), animate: false })
      phaseRef.current = 'idle'
      return
    }
    phaseRef.current = 'intro'
    map.jumpTo({ center: spinStart(center), zoom: small ? 0.9 : 1.4, pitch: 0, bearing: 0 })
    await moveEnd(map, () => map.easeTo({ center: [center[0] - 20, spinStart(center)[1]], duration: 2600, easing: (x) => x }))
    if (run !== runRef.current) return
    await moveEnd(map, () => map.flyTo({ center, zoom: hasFields ? 6.2 : 5.4, duration: 3600, curve: 1.5, essential: true }))
    if (run !== runRef.current) return
    await moveEnd(map, () => map.fitBounds(target, { ...fitOptions(map), duration: 4800, essential: true }))
    if (run !== runRef.current) return
    orbit(run)
  }, [target, fitOptions, small, hasFields, orbit])

  const flyToField = useCallback(async (f: GlobeField) => {
    const map = mapRef.current
    if (!map) return
    const run = ++runRef.current
    setActiveId(f.id)
    map.stop()
    phaseRef.current = 'intro'
    await moveEnd(map, () => map.fitBounds(f.bbox, { ...fitOptions(map), duration: 3200, essential: true }))
    if (run === runRef.current) orbit(run)
  }, [fitOptions, orbit])

  // Create the map once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (!webglAvailable()) {
      latest.current.onFailed?.()
      return
    }
    let map: MLMap
    try {
      map = new MLMap({
        container: el,
        style: SATELLITE_STYLE,
        center: [20, 15],
        zoom: 1.2,
        interactive,
        maxPitch: small ? 45 : 70,
        maxZoom: 18.5,
        // Background mode can't open the compact (i) button, so show credits in full.
        attributionControl: { compact: interactive },
        fadeDuration: 0,
      })
    } catch {
      latest.current.onFailed?.()
      return
    }
    mapRef.current = map
    const timeout = window.setTimeout(() => {
      if (!map.loaded()) latest.current.onFailed?.()
    }, LOAD_TIMEOUT_MS)
    map.once('load', () => {
      window.clearTimeout(timeout)
      addOverlays(map, [])
      // Compact attribution opens expanded on load; collapse it so it doesn't cover the controls.
      if (interactive) el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      if (interactive) {
        map.on('click', 'fields-fill', (e) => {
          const id = e.features?.[0]?.properties?.id
          if (typeof id === 'string') latest.current.onFieldClick?.(id)
        })
        map.on('mouseenter', 'fields-fill', () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', 'fields-fill', () => (map.getCanvas().style.cursor = ''))
      }
      setReady(true)
    })

    const runs = runRef
    const takeOver = () => {
      runs.current++
      phaseRef.current = 'user'
    }
    const canvas = map.getCanvasContainer()
    if (interactive) {
      canvas.addEventListener('pointerdown', takeOver)
      canvas.addEventListener('wheel', takeOver, { passive: true })
    }

    return () => {
      window.clearTimeout(timeout)
      runs.current++
      startedRef.current = false
      setReady(false)
      canvas.removeEventListener('pointerdown', takeOver)
      canvas.removeEventListener('wheel', takeOver)
      map.remove()
      mapRef.current = null
    }
  }, [interactive, small])

  // Keep field geometry in sync.
  useEffect(() => {
    if (!ready) return
    ;(mapRef.current?.getSource('fields') as GeoJSONSource | undefined)?.setData(fieldCollection(fields))
  }, [ready, fields])

  // Start the intro once loaded and on screen; pause the orbit while hidden.
  useEffect(() => {
    if (!ready) return
    const el = containerRef.current
    const sync = () => {
      const map = mapRef.current
      if (!map) return
      if (visibleRef.current) {
        if (!startedRef.current) {
          startedRef.current = true
          void play()
        } else if (phaseRef.current === 'orbit') {
          orbit(runRef.current)
        }
      } else if (phaseRef.current === 'orbit') {
        map.stop()
      }
    }
    const io = el
      ? new IntersectionObserver(([entry]) => {
          visibleRef.current = entry.isIntersecting && document.visibilityState === 'visible'
          sync()
        })
      : null
    if (el) io?.observe(el)
    const onVisibility = () => {
      visibleRef.current = document.visibilityState === 'visible'
      sync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    sync()
    return () => {
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ready, play, orbit])

  // Replay when the target set changes after the first run (e.g. fields loaded late).
  const targetKey = target.join(',')
  const firstTarget = useRef(targetKey)
  useEffect(() => {
    if (ready && startedRef.current && targetKey !== firstTarget.current) {
      firstTarget.current = targetKey
      void play()
    }
  }, [ready, targetKey, play])

  return (
    <div className={cn('globe-space relative overflow-hidden', className)}>
      {/* maplibre-gl.css sets position:relative on the container, overriding layered Tailwind utilities. */}
      <div className={cn('absolute inset-0', !interactive && 'pointer-events-none')}>
        <div
          ref={containerRef}
          className="h-full w-full"
          role={interactive ? 'application' : 'img'}
          aria-label={t('globe.ariaLabel')}
        />
      </div>
      {showControls && ready && (
        <div className="pointer-events-none absolute inset-x-3 bottom-11 flex items-end justify-between gap-2">
          <div className="no-scrollbar pointer-events-auto flex min-w-0 gap-2 overflow-x-auto">
            {fields.length > 1 &&
              fields.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => void flyToField(f)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md transition',
                    activeId === f.id
                      ? 'border-sun-300 bg-sun-400/90 text-paddy-950'
                      : 'border-white/25 bg-black/35 text-soil-50 hover:bg-black/50',
                  )}
                  aria-label={t('globe.flyTo', { name: f.name })}
                >
                  {f.name}
                </button>
              ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveId(null)
              void play()
            }}
            className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-xs font-medium text-soil-50 backdrop-blur-md transition hover:bg-black/50"
          >
            <RotateCcw className="size-3.5" /> {t('globe.replay')}
          </button>
        </div>
      )}
    </div>
  )
}
