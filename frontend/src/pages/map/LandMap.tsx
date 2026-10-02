import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { LngLatBounds, Map as MLMap, Marker, NavigationControl, ScaleControl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@/features/map/maplibreWorker'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { FeatureCollection, Polygon } from 'geojson'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ChevronUp,
  Crosshair,
  Layers as LayersIcon,
  Loader2,
  Pencil,
  PenLine,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { geoApi, landsApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { qk, useLands } from '@/api/queries'
import type { LandMetrics, LandSummary } from '@/api/types'
import { useAuth } from '@/stores/auth'
import { useUi, type MapLayer } from '@/stores/ui'
import { applyBaseLayer, baseStyle, DEFAULT_CENTER, DEFAULT_ZOOM } from '@/features/map/basemaps'
import { SearchBox } from '@/features/map/SearchBox'
import { MetricsPanel } from '@/features/map/MetricsPanel'
import { isSelfIntersecting, previewMetrics } from '@/lib/geo'
import { formatArea } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/States'
import { FieldThumb } from '@/components/common/FieldThumb'
import { cn } from '@/lib/utils'

type Mode = 'browse' | 'draw' | 'edit'

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

function landsToGeoJSON(lands: LandSummary[], selected: string | null, hidden: string | null) {
  const polys: FeatureCollection = {
    type: 'FeatureCollection',
    features: lands
      .filter((l) => l.id !== hidden)
      .map((l) => ({ type: 'Feature', id: l.id, geometry: l.boundary, properties: { id: l.id, name: l.name, selected: l.id === selected } })),
  }
  const labels: FeatureCollection = {
    type: 'FeatureCollection',
    features: lands
      .filter((l) => l.id !== hidden)
      .map((l) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [l.metrics.representative_point.lon, l.metrics.representative_point.lat] },
        properties: { name: l.name },
      })),
  }
  return { polys, labels }
}

function roundPolygon(p: Polygon): Polygon {
  return { type: 'Polygon', coordinates: p.coordinates.map((r) => r.map(([x, y]) => [+x.toFixed(8), +y.toFixed(8)])) }
}

export default function LandMap() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const user = useAuth((s) => s.user)
  const unit = user?.preferences.area_unit ?? 'acre'
  const { mapLayer, setMapLayer } = useUi()
  const lands = useLands()

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const geoMarker = useRef<Marker | null>(null)
  const fittedRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [mode, setMode] = useState<Mode>('browse')
  const [geometry, setGeometry] = useState<Polygon | null>(null)
  const [serverMetrics, setServerMetrics] = useState<LandMetrics | null>(null)
  const [measureError, setMeasureError] = useState<string | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [layerMenu, setLayerMenu] = useState(false)
  const [locating, setLocating] = useState(false)

  const setParamsRef = useRef(setParams)
  useEffect(() => {
    setParamsRef.current = setParams
  }, [setParams])

  const selectedId = params.get('land')
  const editId = params.get('edit')
  const editingLand = useMemo(() => lands.data?.find((l) => l.id === editId) ?? null, [lands.data, editId])
  const selectedLand = useMemo(() => lands.data?.find((l) => l.id === selectedId) ?? null, [lands.data, selectedId])

  // ---- map + draw init (once) ----
  useEffect(() => {
    if (!containerRef.current) return
    let map: MLMap
    try {
      map = new MLMap({
        container: containerRef.current,
        style: baseStyle,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: { compact: true },
        maxZoom: 20,
      })
    } catch {
      setMapFailed(true)
      return
    }
    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: false }), 'bottom-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      map.addSource('lands', { type: 'geojson', data: EMPTY_FC })
      map.addSource('land-labels', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'lands-fill',
        type: 'fill',
        source: 'lands',
        paint: { 'fill-color': ['case', ['get', 'selected'], '#e6bb5c', '#7fb069'], 'fill-opacity': ['case', ['get', 'selected'], 0.35, 0.22] },
      })
      map.addLayer({
        id: 'lands-line',
        type: 'line',
        source: 'lands',
        paint: { 'line-color': ['case', ['get', 'selected'], '#f1d38a', '#e0edd6'], 'line-width': ['case', ['get', 'selected'], 3, 2] },
      })
      map.addLayer({
        id: 'lands-label',
        type: 'symbol',
        source: 'land-labels',
        minzoom: 13,
        layout: { 'text-field': ['get', 'name'], 'text-size': 13, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': false },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#1f3a2b', 'text-halo-width': 1.6 },
      })
      map.on('click', 'lands-fill', (e) => {
        if (drawRef.current?.getMode() !== 'static' && drawRef.current?.getMode() !== undefined) return
        const id = e.features?.[0]?.properties?.id as string | undefined
        if (id) {
          setParamsRef.current((p) => {
            p.set('land', id)
            p.delete('edit')
            return p
          })
          setSheetOpen(true)
        }
      })
      map.on('mouseenter', 'lands-fill', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'lands-fill', () => (map.getCanvas().style.cursor = ''))

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode({
            styles: { fillColor: '#e6bb5c', fillOpacity: 0.3, outlineColor: '#f1d38a', outlineWidth: 3, closingPointColor: '#ffffff', closingPointWidth: 6 },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } },
              },
            },
            styles: {
              selectedPolygonColor: '#e6bb5c',
              selectedPolygonFillOpacity: 0.3,
              selectedPolygonOutlineColor: '#f1d38a',
              selectedPolygonOutlineWidth: 3,
              selectionPointColor: '#ffffff',
              selectionPointWidth: 7,
              selectionPointOutlineColor: '#1f3a2b',
              selectionPointOutlineWidth: 2,
              midPointColor: '#f1d38a',
              midPointWidth: 4,
            },
          }),
        ],
      })
      draw.start()
      draw.on('change', () => {
        const poly = draw.getSnapshot().find((f) => f.geometry.type === 'Polygon')
        setGeometry(poly ? (poly.geometry as Polygon) : null)
      })
      draw.on('finish', (id) => {
        draw.setMode('select')
        draw.selectFeature(id)
        setMode('edit')
      })
      drawRef.current = draw
      setReady(true)
    })
    map.on('error', (e) => {
      // Tile errors are noisy and non-fatal; only log.
      console.warn('[map]', e.error?.message)
    })

    return () => {
      try {
        drawRef.current?.stop()
      } catch {
        /* map already torn down */
      }
      drawRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ---- base layer ----
  useEffect(() => {
    if (ready && mapRef.current) applyBaseLayer(mapRef.current, mapLayer)
  }, [ready, mapLayer])

  // ---- saved lands → map ----
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !lands.data) return
    const { polys, labels } = landsToGeoJSON(lands.data, selectedId, mode === 'edit' ? editId : null)
    ;(map.getSource('lands') as GeoJSONSource | undefined)?.setData(polys)
    ;(map.getSource('land-labels') as GeoJSONSource | undefined)?.setData(labels)
    if (!fittedRef.current && lands.data.length > 0) {
      fittedRef.current = true
      const target = lands.data.find((l) => l.id === (selectedId ?? editId))
      const bb = new LngLatBounds()
      for (const l of target ? [target] : lands.data) {
        bb.extend([l.metrics.bbox[0], l.metrics.bbox[1]])
        bb.extend([l.metrics.bbox[2], l.metrics.bbox[3]])
      }
      map.fitBounds(bb, { padding: 80, maxZoom: 17, duration: 0 })
    }
  }, [ready, lands.data, selectedId, editId, mode])

  // ---- enter edit mode for an existing land (?edit=id) ----
  useEffect(() => {
    const draw = drawRef.current
    if (!ready || !draw || !editingLand) return
    draw.clear()
    const id = crypto.randomUUID()
    const feature: GeoJSONStoreFeatures = {
      id,
      type: 'Feature',
      geometry: roundPolygon(editingLand.boundary),
      properties: { mode: 'polygon' },
    }
    const [res] = draw.addFeatures([feature])
    if (res && !res.valid) {
      toast.error(t('map.cannotEdit'))
      return
    }
    draw.setMode('select')
    draw.selectFeature(id)
    setGeometry(editingLand.boundary)
    setName(editingLand.name)
    setNotes('')
    setMode('edit')
    setSheetOpen(true)
    // Load notes from the detail endpoint (summary doesn't carry them).
    landsApi.get(editingLand.id).then((d) => setNotes(d.notes ?? '')).catch(() => undefined)
  }, [ready, editingLand, t])

  // ---- authoritative metrics from the server (debounced) ----
  const preview = useMemo(() => (geometry ? previewMetrics(geometry) : null), [geometry])
  const selfIntersects = useMemo(() => (geometry ? isSelfIntersecting(geometry) : false), [geometry])
  useEffect(() => {
    setServerMetrics(null)
    setMeasureError(null)
    if (!geometry || selfIntersects || !preview) return
    const h = setTimeout(async () => {
      setMeasuring(true)
      try {
        setServerMetrics(await geoApi.measure(roundPolygon(geometry)))
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) setMeasureError(t(`map.geomErrors.${e.code ?? 'invalid_geometry'}`, { defaultValue: e.message }))
        else if (e instanceof ApiError && e.status === 0) setMeasureError(t('errors.network'))
      } finally {
        setMeasuring(false)
      }
    }, 450)
    return () => clearTimeout(h)
  }, [geometry, selfIntersects, preview, t])

  const startDraw = useCallback(() => {
    const draw = drawRef.current
    if (!draw) return
    draw.clear()
    setGeometry(null)
    setName('')
    setNotes('')
    setParams((p) => {
      p.delete('edit')
      p.delete('land')
      return p
    })
    draw.setMode('polygon')
    setMode('draw')
    setSheetOpen(true)
  }, [setParams])

  const cancelDraw = useCallback(() => {
    const draw = drawRef.current
    draw?.clear()
    draw?.setMode('static')
    setGeometry(null)
    setMode('browse')
    setParams((p) => {
      p.delete('edit')
      return p
    })
  }, [setParams])

  const redraw = useCallback(() => {
    const draw = drawRef.current
    if (!draw) return
    draw.clear()
    setGeometry(null)
    draw.setMode('polygon')
    setMode('draw')
  }, [])

  async function save() {
    if (!geometry || !name.trim()) return
    setSaving(true)
    try {
      const body = { name: name.trim(), boundary: roundPolygon(geometry), notes: notes.trim() || null }
      const land = editingLand ? await landsApi.update(editingLand.id, body) : await landsApi.create(body)
      await qc.invalidateQueries({ queryKey: qk.lands })
      qc.invalidateQueries({ queryKey: qk.dashboard })
      qc.invalidateQueries({ queryKey: qk.land(land.id) })
      toast.success(editingLand ? t('map.updated') : t('map.saved'))
      drawRef.current?.clear()
      drawRef.current?.setMode('static')
      navigate(`/app/lands/${land.id}`)
    } catch (e) {
      toast.error(e instanceof ApiError && e.status === 422 ? t(`map.geomErrors.${e.code ?? 'invalid_geometry'}`, { defaultValue: e.message }) : t('errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  function flyTo(lon: number, lat: number, bbox?: [number, number, number, number] | null) {
    const map = mapRef.current
    if (!map) return
    if (bbox) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 60, maxZoom: 16 })
    else map.flyTo({ center: [lon, lat], zoom: 15 })
  }

  function locate() {
    if (!navigator.geolocation) {
      toast.error(t('map.noGeolocation'))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const { longitude, latitude, accuracy } = pos.coords
        const map = mapRef.current
        if (!map) return
        geoMarker.current?.remove()
        const el = document.createElement('div')
        el.className = 'size-4 rounded-full border-2 border-white bg-sky-deep shadow-[0_0_0_6px_rgba(61,126,166,0.3)]'
        geoMarker.current = new Marker({ element: el }).setLngLat([longitude, latitude]).addTo(map)
        map.flyTo({ center: [longitude, latitude], zoom: accuracy < 200 ? 17 : 14 })
      },
      (err) => {
        setLocating(false)
        toast.error(err.code === err.PERMISSION_DENIED ? t('map.locationDenied') : t('map.locationFailed'))
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const metrics = serverMetrics ?? preview
  const canSave = !!geometry && !!name.trim() && !selfIntersects && !measureError && !saving

  // ---------- panel content ----------
  let panel: React.ReactNode
  if (mode === 'draw' && !geometry) {
    panel = (
      <div className="space-y-3">
        <h2 className="font-display text-xl font-semibold">{t('map.drawTitle')}</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t('map.drawStep1')}</li>
          <li>{t('map.drawStep2')}</li>
          <li>{t('map.drawStep3')}</li>
        </ol>
        <Button variant="outline" className="w-full" onClick={cancelDraw}><X /> {t('common.cancel')}</Button>
      </div>
    )
  } else if (mode === 'draw' || mode === 'edit') {
    panel = (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{editingLand ? t('map.editField') : t('map.newField')}</h2>
          {measuring && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t('map.measuring')} />}
        </div>
        <p className="text-xs text-muted-foreground">{t('map.editHint')}</p>
        {selfIntersects && <p role="alert" className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{t('map.geomErrors.invalid_geometry')}</p>}
        {measureError && <p role="alert" className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{measureError}</p>}
        {metrics && <MetricsPanel metrics={metrics} unit={unit} source={serverMetrics ? 'server' : 'preview'} />}
        <div className="space-y-1.5">
          <Label htmlFor="field-name">{t('map.fieldName')}</Label>
          <Input id="field-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('map.fieldNamePlaceholder')} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="field-notes">{t('map.notes')}</Label>
          <Textarea id="field-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} disabled={!canSave}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} {t('common.save')}
          </Button>
          <Button variant="outline" onClick={redraw} aria-label={t('map.redraw')} title={t('map.redraw')}><PenLine /></Button>
          <Button variant="ghost" onClick={cancelDraw} aria-label={t('common.cancel')} title={t('common.cancel')}><X /></Button>
        </div>
      </div>
    )
  } else if (selectedLand) {
    panel = (
      <div className="space-y-4">
        <button type="button" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setParams((p) => { p.delete('land'); return p })}>
          <ArrowLeft className="size-4" /> {t('map.allFields')}
        </button>
        <h2 className="font-display text-2xl font-semibold">{selectedLand.name}</h2>
        <MetricsPanel metrics={selectedLand.metrics} unit={unit} source="server" />
        <div className="grid grid-cols-2 gap-2">
          <Button asChild><Link to={`/app/lands/${selectedLand.id}`}>{t('map.openField')}</Link></Button>
          <Button variant="outline" onClick={() => setParams((p) => { p.set('edit', selectedLand.id); p.delete('land'); return p })}>
            <Pencil /> {t('map.editBoundary')}
          </Button>
        </div>
      </div>
    )
  } else {
    panel = (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{t('map.myFields')}</h2>
          <Button size="sm" onClick={startDraw} disabled={!ready}><Plus /> {t('map.drawField')}</Button>
        </div>
        {lands.isPending ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : lands.isError ? (
          <ErrorState error={lands.error} onRetry={() => lands.refetch()} />
        ) : lands.data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{t('map.noFields')}</div>
        ) : (
          <ul className="space-y-2">
            {lands.data.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => {
                    setParams((p) => { p.set('land', l.id); return p })
                    flyTo(l.metrics.centroid.lon, l.metrics.centroid.lat, l.metrics.bbox)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-2.5 text-left transition hover:border-paddy-400 hover:bg-muted/50"
                >
                  <FieldThumb boundary={l.boundary} className="size-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{formatArea(l.metrics, unit, i18n.language)}{l.active_cycle ? ` · ${l.active_cycle.crop_name}` : ''}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-paddy-950 lg:grid lg:grid-cols-[1fr_400px]">
      <div className="relative h-full">
        {/* maplibre-gl.css sets position:relative on the container, overriding layered Tailwind utilities. */}
        <div className="absolute inset-0">
          <div ref={containerRef} className="h-full w-full" role="application" aria-label={t('map.mapLabel')} />
        </div>
        {mapFailed && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <ErrorState error={new Error('map')} className="max-w-sm bg-card" />
          </div>
        )}

        {/* top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-3 sm:p-4">
          <Button asChild variant="outline" size="icon" className="glass pointer-events-auto shrink-0 shadow-lg">
            <Link to="/app" aria-label={t('nav.dashboard')}><ArrowLeft /></Link>
          </Button>
          <SearchBox className="pointer-events-auto min-w-0 flex-1 sm:max-w-md" onPick={(r) => flyTo(r.lon, r.lat, r.bbox)} />
        </div>

        {/* map controls */}
        <div className="absolute right-3 top-20 z-10 flex flex-col gap-2 sm:right-4">
          <div className="relative">
            <Button variant="outline" size="icon" className="glass shadow-lg" onClick={() => setLayerMenu((v) => !v)} aria-label={t('map.layers')} aria-expanded={layerMenu}>
              <LayersIcon />
            </Button>
            {layerMenu && (
              <div className="absolute right-12 top-0 w-40 rounded-xl border border-border bg-card p-1 shadow-xl">
                {(['satellite', 'street', 'terrain'] as MapLayer[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => { setMapLayer(l); setLayerMenu(false) }}
                    className={cn('block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted', mapLayer === l && 'bg-muted font-semibold')}
                  >
                    {t(`map.layer.${l}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" size="icon" className="glass shadow-lg" onClick={locate} aria-label={t('map.myLocation')} disabled={locating}>
            {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
          </Button>
          {mode === 'edit' && editingLand && (
            <Button
              variant="outline"
              size="icon"
              className="glass shadow-lg"
              aria-label={t('map.deleteField')}
              onClick={async () => {
                if (!confirm(t('map.confirmDelete', { name: editingLand.name }))) return
                try {
                  await landsApi.remove(editingLand.id)
                  await qc.invalidateQueries({ queryKey: qk.lands })
                  qc.invalidateQueries({ queryKey: qk.dashboard })
                  cancelDraw()
                  toast.success(t('map.deleted'))
                } catch {
                  toast.error(t('errors.generic'))
                }
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>

        {mode === 'browse' && !selectedLand && (
          <div className="absolute inset-x-0 bottom-28 z-10 flex justify-center lg:bottom-8">
            <Button size="lg" variant="gold" className="shadow-xl" onClick={startDraw} disabled={!ready}>
              <PenLine /> {t('map.drawField')}
            </Button>
          </div>
        )}
      </div>

      {/* desktop side panel */}
      <aside className="hidden h-dvh overflow-y-auto border-l border-border bg-card p-6 lg:block">{panel}</aside>

      {/* mobile bottom sheet */}
      <section
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 rounded-t-3xl border-t border-border bg-card shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] transition-[max-height] duration-300 lg:hidden',
          sheetOpen ? 'max-h-[78dvh]' : 'max-h-24',
        )}
        aria-label={t('map.panel')}
      >
        <button type="button" onClick={() => setSheetOpen((v) => !v)} className="flex w-full flex-col items-center pt-2.5" aria-expanded={sheetOpen} aria-label={t('map.togglePanel')}>
          <span className="h-1.5 w-10 rounded-full bg-border" />
          <ChevronUp className={cn('mt-1 size-4 text-muted-foreground transition-transform', sheetOpen && 'rotate-180')} />
        </button>
        <div className={cn('overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]', sheetOpen ? 'max-h-[calc(78dvh-3rem)]' : 'max-h-12 overflow-hidden')}>{panel}</div>
      </section>
    </div>
  )
}
