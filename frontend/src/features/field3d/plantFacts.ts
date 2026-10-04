import { cropVisual, genericStageIndex, type CropVisual } from './crops/cropGrowth';
import { specFor, type CropSpec } from './crops/specs';
import { growthParams, MAX_TILLERS, type GrowthParams } from './growth';
import type { FieldVisualState } from './types';

/**
 * What the single-plant view shows for one moment of the season: the crop model's plant, resolved
 * the same way as the field scene so the close-up and the field always agree. Pure, so the page can
 * show the numbers next to the 3D view.
 */
export type PlantFacts =
  | {
      kind: 'paddy';
      /** False before transplanting/sowing, or once the field is bare. */
      present: boolean;
      /** Seedling in the nursery bed (shown on its own; the main field is still empty). */
      seedling: boolean;
      heightM: number;
      /** Visible tillers on the hill, whole number. */
      tillers: number;
      /** 0..1 share of the panicle exserted. */
      panicle: number;
      /** 0..1 grain ripeness (droop and colour). */
      ripeness: number;
      growth: GrowthParams;
    }
  | {
      kind: 'upland';
      present: boolean;
      seedling: false;
      heightM: number;
      /** 0..1 open flowers. */
      flowering: number;
      /** 0..1 fruits, pods or heads set and grown. */
      fruiting: number;
      ripeness: number;
      spec: CropSpec;
      visual: CropVisual;
    };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Nursery seedlings grow from ~5 cm to ~25 cm before they are pulled for transplanting. */
const NURSERY_HEIGHT = { from: 0.05, to: 0.25 } as const;

export function plantFacts(state: FieldVisualState, cropSlug?: string | null): PlantFacts {
  const spec = specFor(cropSlug);
  if (spec) {
    const visual = cropVisual(spec, genericStageIndex(state.rawStageKey, state.stageKey), state.stageProgress);
    const fruiting = Math.max(visual.fruit * (0.25 + 0.75 * visual.fruitSize), visual.head);
    return {
      kind: 'upland',
      present: visual.presence > 0.01,
      seedling: false,
      heightM: spec.heightM * visual.scale * visual.presence,
      flowering: clamp01((visual.flower - visual.flowerDrop) * 2),
      fruiting: clamp01(fruiting),
      ripeness: clamp01(visual.ripe),
      spec,
      visual,
    };
  }
  const growth = growthParams(state.stageKey, state.stageProgress);
  const seedling = state.stageKey === 'nursery';
  const heightM = seedling
    ? NURSERY_HEIGHT.from + (NURSERY_HEIGHT.to - NURSERY_HEIGHT.from) * clamp01(state.stageProgress)
    : growth.heightM * growth.presence;
  return {
    kind: 'paddy',
    present: seedling || growth.presence > 0.01,
    seedling,
    heightM,
    tillers: seedling ? 1 : Math.max(1, Math.round(Math.min(MAX_TILLERS, growth.tillers))),
    panicle: clamp01(growth.panicleEmergence),
    ripeness: clamp01(growth.panicleDroop),
    growth,
  };
}
