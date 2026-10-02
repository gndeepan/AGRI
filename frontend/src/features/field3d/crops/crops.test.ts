/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fieldShapeFromPolygon } from '../fieldShape';
import { cropVisual, GENERIC_STAGES, genericStageIndex } from './cropGrowth';
import { buildPlant, PLANT_MODELS } from './plants';
import { rowSegments } from './rows';
import { CROP_SPECS, isPaddySlug, specFor, UPLAND_SLUGS } from './specs';

/** Plannable non-paddy crops in backend/app/seed/crops.py (coconut is perennial and not plannable). */
const SEED_PLANNABLE = [
  'groundnut', 'black-gram', 'green-gram', 'maize', 'cotton', 'sugarcane', 'finger-millet',
  'sorghum', 'pearl-millet', 'foxtail-millet', 'little-millet', 'kodo-millet', 'red-gram', 'bengal-gram', 'cowpea',
  'sesame', 'sunflower', 'castor', 'banana', 'turmeric', 'small-onion', 'tomato', 'brinjal', 'chilli', 'bhendi', 'tapioca',
];

const sum = (c: readonly number[]) => c[0]! + c[1]! + c[2]!;

describe('crop specs', () => {
  it('cover every plannable catalogue crop except paddy', () => {
    expect([...UPLAND_SLUGS].sort()).toEqual([...SEED_PLANNABLE].sort());
    for (const slug of SEED_PLANNABLE) expect(specFor(slug), slug).not.toBeNull();
    expect(specFor('coconut')).toBeNull();
    expect(isPaddySlug('paddy')).toBe(true);
    expect(isPaddySlug('maize')).toBe(false);
  });

  it('stay in sync with the backend seed when it is available', () => {
    // Vitest runs from frontend/.
    const seed = resolve(process.cwd(), '../backend/app/seed/crops.py');
    if (!existsSync(seed)) return; // frontend-only checkout (e.g. the web container)
    const src = readFileSync(seed, 'utf8');
    const slugs = new Set([...src.matchAll(/"slug": "([a-z-]+)"|_crop\("([a-z-]+)"/g)].map((m) => m[1] ?? m[2]));
    slugs.delete('paddy');
    slugs.delete('coconut');
    expect([...slugs].sort()).toEqual([...SEED_PLANNABLE].sort());
  });

  it('use positive agronomic spacing and heights', () => {
    for (const s of Object.values(CROP_SPECS)) {
      expect(s.rowM, s.slug).toBeGreaterThan(0.1);
      expect(s.plantM, s.slug).toBeGreaterThan(0.05);
      expect(s.rowM, s.slug).toBeGreaterThanOrEqual(s.plantM);
      expect(s.heightM, s.slug).toBeGreaterThan(0.2);
    }
  });
});

describe('cropVisual', () => {
  it('is deterministic and continuous across stage boundaries', () => {
    for (const s of Object.values(CROP_SPECS)) {
      expect(cropVisual(s, 2, 0.37)).toEqual(cropVisual(s, 2, 0.37));
      for (let i = 0; i < GENERIC_STAGES.length - 1; i++) {
        const end = cropVisual(s, i, 1);
        const start = cropVisual(s, i + 1, 0);
        expect(end.scale).toBeCloseTo(start.scale, 6);
        expect(end.leafColor[1]).toBeCloseTo(start.leafColor[1], 6);
      }
    }
  });

  it('grows monotonically through establishment and vegetative growth', () => {
    for (const s of Object.values(CROP_SPECS)) {
      let prev = -1;
      for (const stage of [0, 1]) {
        for (let t = 0; t <= 1.0001; t += 0.1) {
          const v = cropVisual(s, stage, t);
          expect(v.scale, s.slug).toBeGreaterThanOrEqual(prev - 1e-9);
          prev = v.scale;
        }
      }
    }
  });

  it('shows nothing before sowing and a full stand afterwards', () => {
    const maize = CROP_SPECS.maize!;
    expect(cropVisual(maize, -1, 0).presence).toBe(0);
    expect(cropVisual(maize, 1, 0.5).presence).toBe(1);
  });

  it('ripens grain crops to dry, non-green colours at maturity', () => {
    for (const slug of ['maize', 'sorghum', 'finger-millet', 'black-gram', 'groundnut', 'sesame', 'small-onion', 'turmeric']) {
      const s = CROP_SPECS[slug]!;
      const young = cropVisual(s, 1, 0.5);
      const ripe = cropVisual(s, 4, 1);
      expect(ripe.ripe, slug).toBeGreaterThan(0.9);
      // Green dominates young leaves; at maturity red catches up as leaves dry.
      expect(young.leafColor[1] - young.leafColor[0], slug).toBeGreaterThan(0.1);
      expect(ripe.leafColor[1] - ripe.leafColor[0], slug).toBeLessThan(young.leafColor[1] - young.leafColor[0]);
      expect(ripe.senescence, slug).toBeGreaterThan(young.senescence);
    }
  });

  it('opens cotton bolls white and turns tomatoes and chillies red', () => {
    expect(sum(cropVisual(CROP_SPECS.cotton!, 4, 1).bloomColor)).toBeGreaterThan(2.7);
    for (const slug of ['tomato', 'chilli']) {
      const c = cropVisual(CROP_SPECS[slug]!, 4, 1).bloomColor;
      expect(c[0], slug).toBeGreaterThan(c[1]! * 2);
    }
  });

  it('maps backend stage keys before visual ones', () => {
    expect(genericStageIndex('yield_formation', 'grain_filling')).toBe(3);
    expect(genericStageIndex('vegetative', 'tillering')).toBe(1);
    expect(genericStageIndex(null, 'fallow')).toBe(-1);
    expect(genericStageIndex(undefined, 'harvested')).toBe(5);
  });
});

describe('plant geometry', () => {
  it('builds every model deterministically within a vertex budget', () => {
    expect(PLANT_MODELS.length).toBe(new Set(Object.values(CROP_SPECS).map((s) => s.model)).size);
    for (const s of Object.values(CROP_SPECS)) {
      const a = buildPlant(s, 'near', 7);
      const b = buildPlant(s, 'near', 7);
      const mid = buildPlant(s, 'mid', 7);
      const n = a.getAttribute('position').count;
      expect(n, s.slug).toBeGreaterThan(50);
      expect(n, s.slug).toBeLessThan(12000);
      expect(mid.getAttribute('position').count, s.slug).toBeLessThan(n);
      expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
      const box = a.boundingSphere!;
      // A mature plant fits roughly within its height (banana leaves arch out further).
      expect(box.radius, s.slug).toBeLessThan(s.heightM * 1.4 + 0.5);
      for (const g of [a, b, mid]) g.dispose();
    }
  });
});

describe('rowSegments', () => {
  it('clips rows to the drawn field', () => {
    const shape = fieldShapeFromPolygon({
      type: 'Polygon',
      coordinates: [[[79.13, 10.786], [79.1309, 10.786], [79.1309, 10.7869], [79.13, 10.7869], [79.13, 10.786]]],
    });
    const rows = rowSegments(shape, 0.6, shape.center, 1000, 0);
    // ~98 m wide field at 60 cm rows.
    expect(rows.length).toBeGreaterThan(150);
    expect(rows.length).toBeLessThan(170);
    for (const r of rows) expect(Math.hypot(r.bx - r.ax, r.bz - r.az)).toBeLessThan(101);
  });
});

describe('senescence cap', () => {
  it('keeps castor and red gram leafy at maturity while other dicots dry off', () => {
    for (const slug of ['castor', 'red-gram']) {
      const s = CROP_SPECS[slug]!;
      const ripe = cropVisual(s, 4, 1);
      expect(ripe.senescence, slug).toBeLessThanOrEqual(s.maxSenescence!);
      expect(ripe.ripe, slug).toBeGreaterThan(0.9);
      // Still green-dominant: leaves yellow but do not turn straw.
      expect(ripe.leafColor[1], slug).toBeGreaterThan(ripe.leafColor[2]! + 0.1);
    }
    expect(cropVisual(CROP_SPECS.sesame!, 4, 1).senescence).toBeGreaterThan(0.8);
  });
});
