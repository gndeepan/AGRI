import type { Polygon } from 'geojson'

export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number]

export interface GlobeField {
  id: string
  name: string
  /** Shown on the map, e.g. "North plot · 2.4 ac". */
  label: string
  boundary: Polygon
  bbox: Bbox
}

export interface GlobeZoomProps {
  /** Fields to fly to; when empty the camera settles on `fallbackBbox`. */
  fields?: GlobeField[]
  fallbackBbox: Bbox
  /** Background mode: no user interaction, no controls (landing hero). */
  interactive?: boolean
  showControls?: boolean
  onFieldClick?: (id: string) => void
  className?: string
  /** Fired when the map cannot start (no WebGL, style failure) so callers can show a fallback. */
  onFailed?: () => void
}
