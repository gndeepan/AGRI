import { describe, expect, it } from 'vitest';
import { plantFacts } from './plantFacts';
import type { FieldVisualState } from './types';

const base: FieldVisualState = {
  stageKey: 'tillering', stageProgress: 0.5, cycleProgress: 0.3, hourOfDay: 10,
  cloudCover: 0, rainIntensity: 0, windSpeedKmh: 5, windDirectionDeg: 0, standingWater: true, weatherKind: 'simulated',
};

describe('plantFacts', () => {
  it('describes a paddy hill from the rice growth model', () => {
    const f = plantFacts(base, 'paddy');
    expect(f.kind).toBe('paddy');
    if (f.kind !== 'paddy') return;
    expect(f.present).toBe(true);
    expect(f.heightM).toBeGreaterThan(0.26);
    expect(f.heightM).toBeLessThan(0.52);
    expect(f.tillers).toBeGreaterThanOrEqual(4);
    expect(f.panicle).toBe(0);
  });

  it('shows a nursery seedling even though the main field is still empty', () => {
    const f = plantFacts({ ...base, stageKey: 'nursery', stageProgress: 1 }, 'paddy');
    expect(f).toMatchObject({ kind: 'paddy', present: true, seedling: true, tillers: 1 });
    expect(f.heightM).toBeCloseTo(0.25);
  });

  it('has no plant on a fallow field', () => {
    expect(plantFacts({ ...base, stageKey: 'fallow', stageProgress: 0.5 }, 'paddy').present).toBe(false);
  });

  it('grows taller and sets panicles through the season', () => {
    const early = plantFacts({ ...base, stageKey: 'establishment', stageProgress: 0.2 }, null);
    const late = plantFacts({ ...base, stageKey: 'grain_filling', stageProgress: 0.5 }, null);
    expect(late.heightM).toBeGreaterThan(early.heightM);
    if (late.kind === 'paddy') expect(late.panicle).toBeGreaterThan(0.9);
  });

  it('uses the upland crop model for non-paddy crops', () => {
    const f = plantFacts({ ...base, stageKey: 'flowering', rawStageKey: 'flowering', stageProgress: 0.5 }, 'maize');
    expect(f.kind).toBe('upland');
    if (f.kind !== 'upland') return;
    expect(f.present).toBe(true);
    expect(f.heightM).toBeGreaterThan(0.5);
    expect(f.heightM).toBeLessThanOrEqual(f.spec.heightM);
  });
});
