import { describe, expect, it } from 'vitest';
import { fieldShapeFromPolygon, signedDistanceToEdge, syntheticShape } from './fieldShape';
import { blocksPlot, distToSegment, hashShape, planLandscape } from './landscape';
import { layoutPlots } from './scene/Ground';

// Synthetic ~1 ha square near Thanjavur (test fixture, not a real survey).
const polygon = {
  type: 'Polygon' as const,
  coordinates: [[[79.13, 10.786], [79.1309, 10.786], [79.1309, 10.7869], [79.13, 10.7869], [79.13, 10.786]]],
};

describe('planLandscape', () => {
  const shape = fieldShapeFromPolygon(polygon);

  it('is deterministic for the same land and differs between lands', () => {
    const a = planLandscape(shape);
    const b = planLandscape(shape);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const other = planLandscape(syntheticShape(60, 40));
    expect(other.seed).not.toBe(a.seed);
    expect(hashShape(shape)).toBe(a.seed);
  });

  it('keeps houses, poles, trees and the road clear of the farmer field', () => {
    const p = planLandscape(shape);
    expect(p.houses.length).toBeGreaterThanOrEqual(14);
    for (const h of p.houses) expect(signedDistanceToEdge(shape, h.x, h.z)).toBeGreaterThan(30);
    for (const [x, z] of p.poles) expect(signedDistanceToEdge(shape, x, z)).toBeGreaterThan(15);
    for (const t of p.trees) expect(signedDistanceToEdge(shape, t.x, t.z)).toBeGreaterThan(5);
    expect(distToSegment(shape.center, p.road.a, p.road.b)).toBeGreaterThan(shape.radius + 20);
  });

  it('puts no tree on a house or on the road', () => {
    const p = planLandscape(shape);
    for (const t of p.trees) {
      expect(distToSegment([t.x, t.z], p.road.a, p.road.b)).toBeGreaterThanOrEqual(p.road.width / 2 + 2);
      for (const h of p.houses) expect(Math.hypot(h.x - t.x, h.z - t.z)).toBeGreaterThanOrEqual(5);
    }
  });

  it('keeps canals away from the field and has trees of several kinds', () => {
    const p = planLandscape(shape);
    for (const c of p.canals) for (const q of [c.a, c.b]) expect(signedDistanceToEdge(shape, q[0], q[1])).toBeGreaterThan(4);
    expect(new Set(p.trees.map((t) => t.kind)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('layoutPlots', () => {
  const shape = fieldShapeFromPolygon(polygon);
  const plots = layoutPlots(shape);

  it('fills the ring around the field with plots that never touch it', () => {
    expect(plots.length).toBeGreaterThan(60);
    for (const p of plots) for (const [x, z] of p.ring) expect(signedDistanceToEdge(shape, x, z)).toBeGreaterThan(2);
    // Plots hug the field: some corner lies within ~15 m of the bund.
    const nearest = Math.min(...plots.flatMap((p) => p.ring.map(([x, z]) => -signedDistanceToEdge(shape, x, z) * -1)));
    expect(nearest).toBeLessThan(15);
  });

  it('never covers the village, road or tank and varies per plot', () => {
    const plan = planLandscape(shape);
    for (const p of plots) {
      const cx = p.ring.reduce((s, q) => s + q[0], 0) / p.ring.length;
      const cz = p.ring.reduce((s, q) => s + q[1], 0) / p.ring.length;
      expect(blocksPlot(plan, cx, cz, 0)).toBe(false);
    }
    expect(new Set(plots.map((p) => p.tint.toFixed(2))).size).toBeGreaterThan(20);
    expect(plots.every((p) => p.heightVar >= 0.82 && p.heightVar <= 1.16)).toBe(true);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(layoutPlots(shape))).toBe(JSON.stringify(plots));
  });

  it('prints the village direction (debug)', () => {
    const plan = planLandscape(shape);
    const ang = (Math.atan2(plan.village.center[1] - shape.center[1], plan.village.center[0] - shape.center[0]) * 180) / Math.PI;
    console.log('VILLAGE angle(deg, x→z)', ang.toFixed(0), 'dist', Math.hypot(plan.village.center[0] - shape.center[0], plan.village.center[1] - shape.center[1]).toFixed(0), 'houses', plan.houses.length);
  });
});
