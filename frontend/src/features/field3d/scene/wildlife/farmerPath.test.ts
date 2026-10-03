import { describe, expect, it } from 'vitest';
import { fieldShapeFromPolygon, insideField, signedDistanceToEdge, syntheticShape } from '../../fieldShape';
import { BUND_WALK_OFFSET, buildPathRing, farmerPoseAt, planFarmer, samplePath } from './farmerPath';

// Synthetic polygons only (an L-shaped plot near Thanjavur), not real survey data.
const L_SHAPE = {
  type: 'Polygon' as const,
  coordinates: [[
    [79.1300, 10.7860], [79.1312, 10.7860], [79.1312, 10.7866],
    [79.1306, 10.7866], [79.1306, 10.7872], [79.1300, 10.7872], [79.1300, 10.7860],
  ]],
};

describe('bund path', () => {
  for (const [name, shape] of [['demo plot', syntheticShape()], ['L-shaped plot', fieldShapeFromPolygon(L_SHAPE)]] as const) {
    it(`${name}: every sampled point stays outside the crop polygon, on the bund`, () => {
      const path = buildPathRing(shape);
      for (let s = 0; s < path.length; s += 0.25) {
        const p = samplePath(path, s);
        expect(insideField(shape, p.x, p.z)).toBe(false);
        const d = signedDistanceToEdge(shape, p.x, p.z);
        // Offset is exact on straight edges and larger at convex mitres; never inside, never far off the bund.
        expect(d).toBeGreaterThan(BUND_WALK_OFFSET * 0.7);
        expect(d).toBeLessThan(BUND_WALK_OFFSET * 2.2);
      }
    });

    it(`${name}: "inward" points into the field`, () => {
      const path = buildPathRing(shape);
      for (let s = 0; s < path.length; s += 3) {
        // Away from corners: from a mitred corner the probe is still outside the neighbouring edge.
        if (path.cum.some((c) => Math.abs(c - s) < 2.2)) continue;
        const p = samplePath(path, s);
        expect(insideField(shape, p.x + p.inward[0] * (BUND_WALK_OFFSET + 1), p.z + p.inward[1] * (BUND_WALK_OFFSET + 1))).toBe(true);
      }
    });
  }

  it('path length is slightly longer than the perimeter (outer offset)', () => {
    const shape = syntheticShape();
    const path = buildPathRing(shape);
    expect(path.length).toBeGreaterThan(shape.perimeterM);
  });
});

describe('farmer plan', () => {
  const shape = syntheticShape();
  const path = buildPathRing(shape);

  it('is deterministic for the same seed and different across seeds', () => {
    expect(planFarmer(7, path.length)).toEqual(planFarmer(7, path.length));
    expect(planFarmer(7, path.length)).not.toEqual(planFarmer(8, path.length));
  });

  it('alternates walking with stops and covers the whole timeline contiguously', () => {
    const plan = planFarmer(3, path.length);
    expect(plan.segments[0]!.action).toBe('walk');
    for (let i = 1; i < plan.segments.length; i++) {
      expect(plan.segments[i]!.t0).toBeCloseTo(plan.segments[i - 1]!.t1, 9);
      if (plan.segments[i]!.action !== 'walk') expect(plan.segments[i - 1]!.action).toBe('walk');
    }
    expect(plan.segments.some((sg) => sg.action === 'inspect')).toBe(true);
  });

  it('pose is a pure function of time and never leaves the bund line', () => {
    const plan = planFarmer(11, path.length);
    for (let t = 0; t < plan.duration * 1.2; t += 0.7) {
      const a = farmerPoseAt(plan, path, t);
      expect(farmerPoseAt(plan, path, t)).toEqual(a);
      expect(insideField(shape, a.x, a.z)).toBe(false);
      expect(a.crouch).toBeGreaterThanOrEqual(0);
      expect(a.crouch).toBeLessThanOrEqual(1);
    }
  });

  it('crouches only while inspecting and faces the field when stopped', () => {
    const plan = planFarmer(5, path.length);
    const inspect = plan.segments.find((sg) => sg.action === 'inspect')!;
    const mid = farmerPoseAt(plan, path, (inspect.t0 + inspect.t1) / 2);
    expect(mid.crouch).toBeGreaterThan(0.9);
    expect(mid.faceField).toBeGreaterThan(0.9);
    const walk = plan.segments[0]!;
    expect(farmerPoseAt(plan, path, (walk.t0 + walk.t1) / 2).crouch).toBe(0);
  });

  it('walking is continuous: no teleporting between frames', () => {
    const plan = planFarmer(2, path.length);
    let prev = farmerPoseAt(plan, path, 0);
    for (let t = 0.05; t < plan.duration; t += 0.05) {
      const p = farmerPoseAt(plan, path, t);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.12);
      prev = p;
    }
  });
});
