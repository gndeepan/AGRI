import { lazy } from 'react'

export const GlobeZoom = lazy(() => import('./GlobeZoomMap'))
export { KAVERI_DELTA_BBOX, TAMIL_NADU_BBOX } from './camera'
export type { Bbox, GlobeField, GlobeZoomProps } from './types'
