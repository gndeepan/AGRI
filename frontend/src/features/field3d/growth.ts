import type { GrowthStageKey } from './types';

/**
 * Pure mapping from the crop-model stage to visual parameters.
 *
 * Each stage has a keyframe describing the plant at the *start* of that stage.
 * Within a stage we ease from its keyframe to the next stage's keyframe, so
 * (stage i, progress 1) === (stage i+1, progress 0) and scrubbing the timeline
 * backwards and forwards always lands on the same picture.
 *
 * These are illustrative visuals of the crop model, not measurements.
 */

export type RGB = readonly [number, number, number];

export interface GrowthParams {
  /** Mature canopy height in metres (before per-plant variation). */
  heightM: number;
  /** Visible tillers/leaves per hill, 0..MAX_TILLERS. */
  tillers: number;
  /** 0 = no plants in the main field, 1 = full stand. */
  presence: number;
  /** Leaf base colour (linear-ish sRGB 0..1). */
  leafColor: RGB;
  /** Leaf tip colour – lets older leaves yellow at the tips first. */
  leafTipColor: RGB;
  /** 0 = no panicle, 1 = fully exserted. */
  panicleEmergence: number;
  /** 0 = upright, 1 = heavily drooping with grain weight. */
  panicleDroop: number;
  panicleColor: RGB;
  /** Default standing water depth 0..1 for this stage (app may override). */
  waterLevel: number;
  /** 0 = dry cracked soil, 1 = puddled mud. */
  soilWetness: number;
  /** Harvested stubble look (short, straw-coloured, cut tops). */
  stubble: number;
  /** 0 = all leaves green, 1 = lower/outer leaves dead and brown (late maturity). */
  senescence: number;
}

export const MAX_TILLERS = 12;

export const STAGE_ORDER: readonly GrowthStageKey[] = [
  'fallow',
  'nursery',
  'establishment',
  'tillering',
  'stem_elongation',
  'panicle_initiation',
  'flowering',
  'grain_filling',
  'maturity',
  'harvested',
] as const;

const YOUNG_GREEN: RGB = [0.46, 0.74, 0.24];
const FRESH_GREEN: RGB = [0.3, 0.62, 0.16];
const DEEP_GREEN: RGB = [0.16, 0.44, 0.1];
const RIPENING: RGB = [0.56, 0.6, 0.18];
const GOLDEN: RGB = [0.86, 0.66, 0.2];
const STRAW: RGB = [0.72, 0.6, 0.36];

const PANICLE_GREEN: RGB = [0.56, 0.7, 0.3];
const PANICLE_FILLING: RGB = [0.74, 0.72, 0.3];
const PANICLE_GOLD: RGB = [0.93, 0.74, 0.28];

type Keyframe = GrowthParams;

const KEYFRAMES: Record<GrowthStageKey, Keyframe> = {
  fallow: {
    heightM: 0, tillers: 0, presence: 0, leafColor: STRAW, leafTipColor: STRAW,
    panicleEmergence: 0, panicleDroop: 0, panicleColor: PANICLE_GREEN,
    waterLevel: 0, soilWetness: 0.25, stubble: 0, senescence: 0,
  },
  // Seedlings are in the nursery bed; the main field is being puddled.
  nursery: {
    heightM: 0, tillers: 0, presence: 0, leafColor: YOUNG_GREEN, leafTipColor: YOUNG_GREEN,
    panicleEmergence: 0, panicleDroop: 0, panicleColor: PANICLE_GREEN,
    waterLevel: 0.7, soilWetness: 1, stubble: 0, senescence: 0,
  },
  establishment: {
    heightM: 0.16, tillers: 2, presence: 1, leafColor: YOUNG_GREEN, leafTipColor: [0.58, 0.8, 0.34],
    panicleEmergence: 0, panicleDroop: 0, panicleColor: PANICLE_GREEN,
    waterLevel: 0.75, soilWetness: 1, stubble: 0, senescence: 0,
  },
  tillering: {
    heightM: 0.26, tillers: 4, presence: 1, leafColor: FRESH_GREEN, leafTipColor: YOUNG_GREEN,
    panicleEmergence: 0, panicleDroop: 0, panicleColor: PANICLE_GREEN,
    waterLevel: 0.6, soilWetness: 1, stubble: 0, senescence: 0,
  },
  stem_elongation: {
    heightM: 0.52, tillers: 10, presence: 1, leafColor: DEEP_GREEN, leafTipColor: FRESH_GREEN,
    panicleEmergence: 0, panicleDroop: 0, panicleColor: PANICLE_GREEN,
    waterLevel: 0.55, soilWetness: 1, stubble: 0, senescence: 0,
  },
  panicle_initiation: {
    heightM: 0.72, tillers: 12, presence: 1, leafColor: DEEP_GREEN, leafTipColor: DEEP_GREEN,
    panicleEmergence: 0, panicleDroop: 0, panicleColor: PANICLE_GREEN,
    waterLevel: 0.6, soilWetness: 1, stubble: 0, senescence: 0,
  },
  flowering: {
    heightM: 0.92, tillers: 12, presence: 1, leafColor: DEEP_GREEN, leafTipColor: FRESH_GREEN,
    panicleEmergence: 0.55, panicleDroop: 0.05, panicleColor: PANICLE_GREEN,
    waterLevel: 0.6, soilWetness: 1, stubble: 0, senescence: 0,
  },
  grain_filling: {
    heightM: 1.0, tillers: 12, presence: 1, leafColor: [0.22, 0.48, 0.12], leafTipColor: RIPENING,
    panicleEmergence: 1, panicleDroop: 0.3, panicleColor: PANICLE_FILLING,
    waterLevel: 0.4, soilWetness: 0.9, stubble: 0, senescence: 0.1,
  },
  // Water is drained ~10 days before harvest.
  maturity: {
    heightM: 1.0, tillers: 12, presence: 1, leafColor: RIPENING, leafTipColor: GOLDEN,
    panicleEmergence: 1, panicleDroop: 0.75, panicleColor: PANICLE_GOLD,
    waterLevel: 0.05, soilWetness: 0.5, stubble: 0, senescence: 0.45,
  },
  harvested: {
    heightM: 0.14, tillers: 8, presence: 1, leafColor: STRAW, leafTipColor: STRAW,
    panicleEmergence: 0, panicleDroop: 0, panicleColor: PANICLE_GOLD,
    waterLevel: 0, soilWetness: 0.35, stubble: 1, senescence: 1,
  },
};

/** What each stage eases towards at progress 1 (the next stage's keyframe, or a terminal state). */
const END_KEYFRAMES: Partial<Record<GrowthStageKey, Keyframe>> = {
  // Seedlings stay in the nursery bed until transplanting, a discrete event.
  nursery: KEYFRAMES.nursery,
  maturity: {
    ...KEYFRAMES.maturity,
    leafColor: GOLDEN, leafTipColor: STRAW, panicleDroop: 0.9, panicleColor: GOLDEN, waterLevel: 0, soilWetness: 0.4, senescence: 0.85,
  },
  harvested: { ...KEYFRAMES.harvested, soilWetness: 0.25 },
};

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const ease = (t: number) => t * t * (3 - 2 * t); // smoothstep: C1-continuous at both ends
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function endKeyframe(stage: GrowthStageKey): Keyframe {
  const explicit = END_KEYFRAMES[stage];
  if (explicit) return explicit;
  const next = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
  return next ? KEYFRAMES[next] : KEYFRAMES[stage];
}

export function growthParams(stage: GrowthStageKey, stageProgress: number): GrowthParams {
  const a = KEYFRAMES[stage] ?? KEYFRAMES.fallow;
  const b = endKeyframe(stage in KEYFRAMES ? stage : 'fallow');
  const t = ease(clamp01(stageProgress));
  return {
    heightM: lerp(a.heightM, b.heightM, t),
    tillers: lerp(a.tillers, b.tillers, t),
    presence: lerp(a.presence, b.presence, t),
    leafColor: lerpRGB(a.leafColor, b.leafColor, t),
    leafTipColor: lerpRGB(a.leafTipColor, b.leafTipColor, t),
    panicleEmergence: lerp(a.panicleEmergence, b.panicleEmergence, t),
    panicleDroop: lerp(a.panicleDroop, b.panicleDroop, t),
    panicleColor: lerpRGB(a.panicleColor, b.panicleColor, t),
    waterLevel: lerp(a.waterLevel, b.waterLevel, t),
    soilWetness: lerp(a.soilWetness, b.soilWetness, t),
    stubble: lerp(a.stubble, b.stubble, t),
    senescence: lerp(a.senescence, b.senescence, t),
  };
}

/** Per-hill variation, deterministic for a given hill index. */
export interface PlantVariation {
  heightScale: number;
  colorJitter: number;
  phase: number;
  tillerBias: number;
}

export function plantVariation(rand: () => number): PlantVariation {
  return {
    heightScale: 0.86 + rand() * 0.28,
    colorJitter: rand(),
    phase: rand(),
    tillerBias: rand(),
  };
}
