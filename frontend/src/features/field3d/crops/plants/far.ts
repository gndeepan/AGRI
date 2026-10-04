import type * as THREE from 'three';
import { mulberry32 } from '../../prng';
import { LEAF, PART, PlantBuilder, dirFrom, v3 } from '../builder';
import type { CropSpec } from '../specs';

/**
 * A very light stand-in for one plant (about 40 vertices) for the far tier: a few leaves at the crop's
 * size and habit, a thin stem, and its flower, fruit or head. It carries the same attributes as the
 * detailed plants, so the crop shader unfolds, flowers and ripens it in step with them, and a field
 * can be filled with real plants well beyond the detailed rings.
 */
export function buildFarPlant(spec: CropSpec, seed: number): THREE.BufferGeometry {
  const b = new PlantBuilder(spec.heightM);
  const rand = mulberry32(seed);
  const grass = spec.archetype === 'tall_grass' || spec.archetype === 'tuft_grass';
  const H = spec.heightM;
  const R = Math.max(0.05, spec.spreadM);
  const n = 4;
  const pivot = v3(0, 0, 0);
  b.tube([v3(0, 0, 0), v3(0, H * 0.92, 0)], () => Math.max(0.004, H * 0.008), 3, { part: PART.STEM, order: 0, color: spec.colors.stem, pivot });
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + rand() * 0.7;
    const base = v3(0, grass ? H * 0.04 * i : H * (0.2 + 0.55 * (i / n)), 0);
    // Slightly fuller than one detailed plant's leaves: seen from afar, a few large leaves must carry the
    // same green as many small ones.
    const length = grass ? H * (0.6 + 0.2 * rand()) : Math.max(R * 0.8, H * 0.42) * (0.85 + 0.4 * rand());
    b.leaf(base, dirFrom(yaw, grass ? 1.05 : 0.45), { part: PART.LEAF, order: i / n, color: [1, 1, 1], pivot: base }, {
      length,
      width: grass ? length * 0.11 : length * 0.62,
      profile: grass ? LEAF.strap : LEAF.ovate,
      segs: 2,
      arch: grass ? 1.0 : 0.6,
      across: 3,
      veins: 'none',
    });
  }
  const top = v3(0, H * 0.95, 0);
  const r = Math.min(0.08, R * 0.14);
  if (spec.topBloom === 'flower') {
    b.disc(top, v3(0, 1, 0.3), r, 5, { part: PART.FLOWER, order: 0.5, color: spec.colors.flower, pivot: top });
  } else if (spec.topBloom === 'fruit') {
    const at = v3(R * 0.25, H * 0.55, 0);
    b.ellipsoid(at, v3(r, r * 1.2, r), 4, 2, { part: PART.FRUIT, order: 0.3, color: spec.colors.fruit, color2: spec.colors.fruitRipe, pivot: at });
  } else if (spec.topBloom === 'head') {
    b.ellipsoid(top, v3(r, r * 1.6, r), 4, 2, { part: PART.HEAD, order: 0.2, color: spec.colors.head, color2: spec.colors.headRipe, pivot: top });
  }
  return b.build();
}
