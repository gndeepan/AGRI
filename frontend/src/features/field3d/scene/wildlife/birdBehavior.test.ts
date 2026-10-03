import { describe, expect, it } from 'vitest';
import { insideField, syntheticShape } from '../../fieldShape';
import { drongoPose, egretPose, mynaPose, parakeetParams, parakeetPose, waderParams } from './birdBehavior';
import { buildPathRing, samplePath } from './farmerPath';

const shape = syntheticShape();
const wp = waderParams(5, shape.center[0], shape.center[1], 5);

describe('egret', () => {
  it('is a pure function of time', () => {
    expect(egretPose(shape, wp, 0.05, 12.3)).toEqual(egretPose(shape, wp, 0.05, 12.3));
  });

  it('stays inside the paddy while wading and stalking', () => {
    for (let t = 0; t < wp.cyclePeriod * (wp.flightEvery - 1); t += 0.37) {
      const p = egretPose(shape, wp, 0.05, t);
      expect(insideField(shape, p.x, p.z)).toBe(true);
      expect(p.y).toBeCloseTo(0.05, 6);
    }
  });

  it('strikes: the neck shoots forward and down within a stalk-strike cycle', () => {
    const states = new Set<string>();
    let maxDrop = 0;
    for (let t = 0; t < wp.cyclePeriod; t += 0.05) {
      const p = egretPose(shape, wp, 0, t);
      states.add(p.state);
      maxDrop = Math.max(maxDrop, p.neckDrop);
    }
    expect(['wade', 'stalk', 'strike', 'stand'].every((s) => states.has(s))).toBe(true);
    expect(maxDrop).toBeGreaterThan(0.8);
  });

  it('takes off and lands again: height returns to the water on the flight cycle edges', () => {
    const k = wp.flightEvery - 1;
    const t0 = k * wp.cyclePeriod;
    expect(egretPose(shape, wp, 0, t0 + 0.001).y).toBeLessThan(0.05);
    expect(egretPose(shape, wp, 0, t0 + wp.cyclePeriod * 0.5).y).toBeGreaterThan(1.5);
    expect(egretPose(shape, wp, 0, t0 + wp.cyclePeriod - 0.001).y).toBeLessThan(0.05);
  });

  it('does not slide while stalking: movement per second is a fraction of wading speed', () => {
    const speed = (t: number) => {
      const a = egretPose(shape, wp, 0, t);
      const b = egretPose(shape, wp, 0, t + 0.5);
      return Math.hypot(b.x - a.x, b.z - a.z) / 0.5;
    };
    const wade = speed(wp.cyclePeriod * 0.25);
    const stand = speed(wp.cyclePeriod * 0.9);
    expect(stand).toBeLessThan(0.01);
    expect(wade).toBeGreaterThan(stand);
  });
});

describe('myna, parakeet, drongo', () => {
  const ring = buildPathRing(shape, 1.3);
  const sample = (s: number) => samplePath(ring, s);

  it('myna walks the bund ring outside the crop and pauses to peck', () => {
    let pecked = false;
    for (let t = 0; t < 40; t += 0.2) {
      const p = mynaPose(sample, { s0: 3, speed: 1, ph: 0 }, t);
      expect(insideField(shape, p.x, p.z)).toBe(false);
      if (p.neckDrop > 0.3) pecked = true;
    }
    expect(pecked).toBe(true);
  });

  it('parakeet only perches when the grain is ripening, and perches at canopy height', () => {
    const pp = parakeetParams(3, shape.center[0], shape.center[1], 12, 0.9);
    let perched = false;
    for (let t = 0; t < pp.period * 3; t += 0.25) {
      const green = parakeetPose(shape, pp, 0, t);
      expect(green.state).toBe('flight');
      const ripe = parakeetPose(shape, pp, 1, t);
      if (ripe.state === 'perch') {
        perched = true;
        expect(ripe.y).toBeCloseTo(pp.perchH, 6);
        expect(insideField(shape, ripe.x, ripe.z)).toBe(true);
      }
    }
    expect(perched).toBe(true);
  });

  it('drongo returns to its post after a sally', () => {
    const post = { x: 3, z: 4, top: 1.45, yaw: 0.5 };
    const period = 14 + (2 % 5); // the drongo's cycle length for seed 2
    for (let k = 0; k < 4; k++) {
      const edge = drongoPose(post, 2, k * period + 0.01);
      expect(edge.state).toBe('perch');
      expect(edge.x).toBeCloseTo(post.x, 6);
      expect(edge.y).toBeCloseTo(post.top, 6);
    }
    let sallied = false;
    for (let t = 0; t < period * 4; t += 0.1) if (drongoPose(post, 2, t).state === 'sally') sallied = true;
    expect(sallied).toBe(true);
  });
});
