import type * as THREE from 'three';
import { mulberry32 } from '../../prng';
import { PlantBuilder } from '../builder';
import type { CropSpec, PlantModel } from '../specs';
import { banana, bhendi, brinjal, castor, chilli, cotton, onion, sesame, sunflower, tapioca, tomato, turmeric } from './broadleaf';
import type { Ctx, Detail } from './common';
import { fingerMillet, foxtailMillet, kodoMillet, littleMillet, maize, pearlMillet, sorghum, sugarcane } from './grasses';
import { bengalGram, groundnut, redGram, trifoliatePulse } from './legumes';

const GENERATORS: Record<PlantModel, (ctx: Ctx) => void> = {
  maize, sorghum, pearl_millet: pearlMillet, sugarcane,
  finger_millet: fingerMillet, foxtail_millet: foxtailMillet, little_millet: littleMillet, kodo_millet: kodoMillet,
  groundnut, trifoliate_pulse: trifoliatePulse, red_gram: redGram, bengal_gram: bengalGram,
  sesame, sunflower, castor, cotton,
  tomato, brinjal, chilli, bhendi, onion,
  banana, turmeric, tapioca,
};

/** One mature plant of `spec` at the origin, deterministic for a given seed. */
export function buildPlant(spec: CropSpec, detail: Detail, seed: number): THREE.BufferGeometry {
  const b = new PlantBuilder(spec.heightM);
  GENERATORS[spec.model]({ b, spec, rand: mulberry32(seed), near: detail === 'near' });
  return b.build();
}

export const PLANT_MODELS = Object.keys(GENERATORS) as PlantModel[];
