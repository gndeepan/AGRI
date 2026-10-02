import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { fieldShapeFromPolygon, hillsAround, insideField, nearestPointInside, syntheticShape } from './fieldShape';

// Synthetic plot near Thanjavur (~0.98 ha; the backend's geodesic area for it is 0.9799 ha).
const square: Polygon = {
  type: 'Polygon',
  coordinates: [[[79.13, 10.786], [79.1309, 10.786], [79.1309, 10.7869], [79.13, 10.7869], [79.13, 10.786]]],
};

// A long thin, rotated field (~200 m × 30 m) to check the row direction follows the longest edge.
const strip: Polygon = {
  type: 'Polygon',
  coordinates: [[[79.0, 10.0], [79.0013, 10.0013], [79.0011, 10.0015], [78.9998, 10.0002], [79.0, 10.0]]],
};

describe('fieldShapeFromPolygon', () => {
  it('projects to true-scale metres', () => {
    const s = fieldShapeFromPolygon(square);
    expect(s.synthetic).toBe(false);
    expect(s.areaM2 / 10000).toBeCloseTo(0.98, 1);
    expect(Math.abs(s.areaM2 - 9799) / 9799).toBeLessThan(0.01);
    expect(s.lengthM).toBeGreaterThan(97);
    expect(s.lengthM).toBeLessThan(101);
    expect(s.perimeterM).toBeCloseTo(2 * (98.3 + 100.1), -1);
    expect(insideField(s, s.center[0], s.center[1])).toBe(true);
  });

  it('puts north at -z and aligns rows with the longest edge', () => {
    const s = fieldShapeFromPolygon(square);
    const zs = s.ring.map((p) => p[1]);
    expect(Math.min(...zs)).toBeLessThan(0);
    const t = fieldShapeFromPolygon(strip);
    expect(t.lengthM).toBeGreaterThan(5 * t.widthM);
    expect(Math.abs(Math.sin(t.rowAngle))).toBeGreaterThan(0.5); // diagonal (NE) edge, not an axis
  });

  it('falls back to a labelled synthetic plot without a boundary', () => {
    const s = fieldShapeFromPolygon(undefined);
    expect(s.synthetic).toBe(true);
    expect(s.areaM2).toBe(syntheticShape().areaM2);
  });
});

describe('hillsAround', () => {
  const s = fieldShapeFromPolygon(square);

  it('fills a patch on the 20 × 15 cm transplanting grid', () => {
    const hills = hillsAround(s, s.center, 0, 3, 1e6);
    const expected = (Math.PI * 9) / (0.2 * 0.15);
    expect(hills.length).toBeGreaterThan(expected * 0.9);
    expect(hills.length).toBeLessThan(expected * 1.1);
    expect(hills.every((h) => insideField(s, h.x, h.z))).toBe(true);
  });

  it('is deterministic and independent of the patch centre', () => {
    const a = hillsAround(s, s.center, 0, 2, 1e6);
    const b = hillsAround(s, [s.center[0] + 0.7, s.center[1] - 0.4], 0, 3, 1e6);
    const key = (h: { x: number; z: number }) => `${h.x.toFixed(5)},${h.z.toFixed(5)}`;
    const inB = new Map(b.map((h) => [key(h), h.r3]));
    const shared = a.filter((h) => inB.has(key(h)));
    expect(shared.length).toBeGreaterThan(a.length * 0.5);
    expect(shared.every((h) => inB.get(key(h)) === h.r3)).toBe(true);
  });

  it('respects the budget, keeping the nearest hills', () => {
    const hills = hillsAround(s, s.center, 0, 5, 200);
    expect(hills.length).toBe(200);
    expect(Math.max(...hills.map((h) => h.d))).toBeLessThan(1.5);
  });

  it('clips at the field edge and moves the focus inside', () => {
    const outside: [number, number] = [s.center[0] + 500, s.center[1]];
    const p = nearestPointInside(s, ...outside);
    expect(insideField(s, p[0], p[1])).toBe(true);
    const edge = hillsAround(s, p, 0, 4, 1e6);
    expect(edge.length).toBeGreaterThan(0);
    expect(edge.length).toBeLessThan((Math.PI * 16) / 0.03 * 0.75);
  });
});
