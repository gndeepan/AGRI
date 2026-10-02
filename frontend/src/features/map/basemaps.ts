import type { Map as MLMap, StyleSpecification } from 'maplibre-gl'
import type { MapLayer } from '@/stores/ui'

/**
 * One style holding all base layers; switching toggles visibility so drawn
 * features and field layers survive (setStyle would wipe them).
 * Licensing: see docs/DATA_SOURCES.md — attribution is shown in the map control.
 */
export const BASE_LAYERS: Record<MapLayer, string[]> = {
  satellite: ['esri-imagery', 'esri-labels'],
  street: ['osm'],
  terrain: ['opentopo'],
}

export const baseStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
    'esri-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
    },
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
    opentopo: {
      type: 'raster',
      tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 17,
      attribution: 'Map data © OpenStreetMap contributors, SRTM · Style © OpenTopoMap (CC-BY-SA)',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#dfe6d6' } },
    { id: 'esri-imagery', type: 'raster', source: 'esri-imagery', layout: { visibility: 'none' } },
    { id: 'esri-labels', type: 'raster', source: 'esri-labels', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.9 } },
    { id: 'osm', type: 'raster', source: 'osm' },
    { id: 'opentopo', type: 'raster', source: 'opentopo', layout: { visibility: 'none' } },
  ],
}

export function applyBaseLayer(map: MLMap, layer: MapLayer) {
  for (const [key, ids] of Object.entries(BASE_LAYERS))
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', key === layer ? 'visible' : 'none')
}

/** Tamil Nadu default view. */
export const DEFAULT_CENTER: [number, number] = [78.7, 10.8]
export const DEFAULT_ZOOM = 6.6
