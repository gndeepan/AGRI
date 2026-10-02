import { describe, expect, it } from 'vitest';
import { growthParams, plantVariation, STAGE_ORDER } from './growth';
import { mulberry32 } from './prng';
import type { GrowthStageKey } from './types';

describe('growthParams', () => {
  it('is deterministic for the same input', () => {
    expect(growthParams('tillering', 0.37)).toEqual(growthParams('tillering', 0.37));
  });

  it('is continuous across stage boundaries', () => {
    for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
      const end = growthParams(STAGE_ORDER[i] as GrowthStageKey, 1);
      const start = growthParams(STAGE_ORDER[i + 1] as GrowthStageKey, 0);
      // Transplanting and harvest are deliberate discrete cuts.
      if (STAGE_ORDER[i] === 'maturity' || STAGE_ORDER[i] === 'nursery') continue;
      expect(end.heightM).toBeCloseTo(start.heightM, 6);
      expect(end.tillers).toBeCloseTo(start.tillers, 6);
    }
  });

  it('grows monotonically through the vegetative and reproductive stages', () => {
    const stages: GrowthStageKey[] = ['establishment', 'tillering', 'stem_elongation', 'panicle_initiation', 'flowering', 'grain_filling'];
    let previous = -1;
    for (const stage of stages) {
      for (let p = 0; p <= 1.0001; p += 0.1) {
        const h = growthParams(stage, p).heightM;
        expect(h).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = h;
      }
    }
  });

  it('turns golden at the end of maturity', () => {
    const [r, g, b] = growthParams('maturity', 1).panicleColor;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeGreaterThan(0.8);
    const [lr, lg, lb] = growthParams('maturity', 1).leafColor;
    expect(lr).toBeGreaterThan(lb);
    expect(lr).toBeGreaterThan(lg * 0.9);
  });

  it('is green during vegetative growth', () => {
    const [r, g, b] = growthParams('stem_elongation', 0.5).leafColor;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('clamps out-of-range and NaN progress', () => {
    expect(growthParams('tillering', -3)).toEqual(growthParams('tillering', 0));
    expect(growthParams('tillering', 9)).toEqual(growthParams('tillering', 1));
    expect(growthParams('tillering', Number.NaN)).toEqual(growthParams('tillering', 0));
  });

  it('shows no plants before establishment', () => {
    expect(growthParams('fallow', 0.5).presence).toBe(0);
    expect(growthParams('nursery', 0.5).presence).toBe(0);
  });
});

describe('plantVariation', () => {
  it('repeats for the same seed', () => {
    const a = plantVariation(mulberry32(42));
    const b = plantVariation(mulberry32(42));
    expect(a).toEqual(b);
    expect(a.heightScale).toBeGreaterThanOrEqual(0.86);
    expect(a.heightScale).toBeLessThanOrEqual(1.14);
  });
});
