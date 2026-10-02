import type { Polygon } from 'geojson';
import type { SkyParams } from '@/features/sky/params';

export type GrowthStageKey = 'fallow'|'nursery'|'establishment'|'tillering'|'stem_elongation'|'panicle_initiation'|'flowering'|'grain_filling'|'maturity'|'harvested';
export interface FieldVisualState {
  stageKey: GrowthStageKey; stageProgress: number; cycleProgress: number;
  hourOfDay: number; sunrise?: string|null; sunset?: string|null;
  cloudCover: number; rainIntensity: number;
  windSpeedKmh: number; windDirectionDeg: number;
  standingWater: boolean;
  weatherKind: 'observed'|'forecast'|'climatology'|'simulated';
  /** 0..1 surface wetness that lingers for a few hours after rain stops. */
  groundWetness?: number;
  /** Mean relative humidity for the day, drives morning mist. */
  humidityPct?: number | null;
  /** The crop model's own stage key (e.g. 'vegetative', 'yield_formation') for non-paddy crops. */
  rawStageKey?: string | null;
}
export interface VirtualFieldProps {
  state: FieldVisualState;
  quality?: 'auto'|'low'|'high';
  soundEnabled?: boolean;
  className?: string;
  /** The farmer's drawn field (EPSG:4326). When given, the scene is built at true shape and scale. */
  boundary?: Polygon;
  /** Catalogue slug of the crop. Paddy (or omitted) renders the paddy scene; other crops their own plants. */
  cropSlug?: string;
  /** 'drip' adds laterals (and mulch on vegetable beds); 'flood'/'awd' keeps furrows damp. */
  irrigationMethod?: string;
  /** The live sky for this moment (features/sky). Lights the scene; derived from `state` if omitted. */
  sky?: SkyParams;
}
