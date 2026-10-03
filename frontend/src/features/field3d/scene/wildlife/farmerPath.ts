import type { FieldShape } from '../../fieldShape';
import { mulberry32 } from '../../prng';

type Pt = [number, number];

/** Distance of the walking line outside the drawn boundary — on the crest of the bund (see Ground.tsx). */
export const BUND_WALK_OFFSET = 0.38;

export interface PathRing {
  pts: Pt[];
  /** Cumulative arc length at each point; cum[pts.length] = total (closed loop). */
  cum: number[];
  length: number;
}

function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Offsets a closed ring outwards by `d` metres using mitred corners (mitre limited to 2d). */
export function offsetRingOutward(ring: Pt[], d: number): Pt[] {
  const n = ring.length;
  const sign = ringArea(ring) >= 0 ? 1 : -1;
  // Outward normal for an edge direction (dx, dz): (dz, -dx) for +area rings, (-dz, dx) otherwise.
  const normal = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    return [(sign * dz) / len, (-sign * dx) / len];
  };
  return ring.map((p, i) => {
    const n0 = normal(ring[(i - 1 + n) % n]!, p);
    const n1 = normal(p, ring[(i + 1) % n]!);
    let mx = n0[0] + n1[0];
    let mz = n0[1] + n1[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) return [p[0] + n1[0] * d, p[1] + n1[1] * d] as Pt;
    mx /= ml;
    mz /= ml;
    // Mitre length = d / cos(half-angle) where cos = m · n1.
    const cos = Math.max(0.5, mx * n1[0] + mz * n1[1]);
    return [p[0] + (mx * d) / cos, p[1] + (mz * d) / cos] as Pt;
  });
}

export function buildPathRing(shape: FieldShape, offset = BUND_WALK_OFFSET): PathRing {
  const pts = offsetRingOutward(shape.ring, offset);
  const cum = [0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    cum.push(cum[i]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { pts, cum, length: cum[pts.length]! };
}

export interface PathSample {
  x: number;
  z: number;
  /** Heading of travel (radians, atan2(dx, dz) so +z faces yaw 0). */
  yaw: number;
  /** Unit vector pointing from the bund into the field. */
  inward: Pt;
}

/** Position at arc length `s` (wraps), travelling in the ring's order. */
export function samplePath(path: PathRing, s: number): PathSample {
  const L = path.length || 1;
  const w = ((s % L) + L) % L;
  let lo = 0;
  let hi = path.pts.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.cum[mid]! <= w) lo = mid;
    else hi = mid;
  }
  const a = path.pts[lo]!;
  const b = path.pts[(lo + 1) % path.pts.length]!;
  const segLen = path.cum[lo + 1]! - path.cum[lo]! || 1;
  const t = (w - path.cum[lo]!) / segLen;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  // Which side is the field on? Probe by the ring's own area sign.
  const sign = ringArea(path.pts) >= 0 ? 1 : -1;
  return {
    x: a[0] + dx * t,
    z: a[1] + dz * t,
    yaw: Math.atan2(dx, dz),
    inward: [(-sign * dz) / len, (sign * dx) / len],
  };
}

/** Arc length of the path point nearest to (x, z) — used to start the farmer where the viewer can see him. */
export function nearestArc(path: PathRing, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s < path.length; s += 0.5) {
    const p = samplePath(path, s);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export type FarmerAction = 'walk' | 'idle' | 'inspect' | 'look';

export interface FarmerSegment {
  action: FarmerAction;
  t0: number;
  t1: number;
  /** Arc length at the segment start and end (equal unless walking). */
  s0: number;
  s1: number;
}

export interface FarmerPlan {
  segments: FarmerSegment[];
  /** Total duration of one loop in seconds. */
  duration: number;
  carriesSpade: boolean;
}

export const WALK_SPEED = 0.95; // m/s — an unhurried walk along a bund

/**
 * A deterministic behaviour loop: walk a stretch of bund, then stop to look over the field or
 * crouch to inspect the crop, repeating around the ring. Same seed + same ring length → same plan.
 */
export function planFarmer(seed: number, ringLength: number, startS?: number): FarmerPlan {
  const rand = mulberry32(seed ^ 0x5eed);
  const segments: FarmerSegment[] = [];
  let t = 0;
  const jitter = rand() * ringLength;
  let s = startS ?? jitter;
  const target = Math.min(ringLength, 240);
  let travelled = 0;
  let guard = 0;
  while (travelled < target && guard++ < 64) {
    const stretch = Math.min(ringLength * 0.25, 4 + rand() * 9);
    const walkT = stretch / WALK_SPEED;
    segments.push({ action: 'walk', t0: t, t1: t + walkT, s0: s, s1: s + stretch });
    t += walkT;
    s += stretch;
    travelled += stretch;
    const r = rand();
    const action: FarmerAction = r < 0.5 ? 'inspect' : r < 0.8 ? 'look' : 'idle';
    const dur = action === 'inspect' ? 7 + rand() * 4 : action === 'look' ? 5 + rand() * 4 : 3 + rand() * 2;
    segments.push({ action, t0: t, t1: t + dur, s0: s, s1: s });
    t += dur;
  }
  return { segments, duration: t || 1, carriesSpade: rand() < 0.6 };
}

export interface FarmerPose {
  x: number;
  z: number;
  yaw: number;
  action: FarmerAction;
  /** 0..1 walking intensity (eases in and out around stops). */
  walk: number;
  /** Cycle phase for the gait (radians), advances with distance walked. */
  gait: number;
  /** 0..1 crouch depth. */
  crouch: number;
  /** 0..1 how much the farmer has turned to face the field. */
  faceField: number;
  /** Seconds into the current segment. */
  segT: number;
}

const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Pose at time `t` (loops). Pure and deterministic — no state carried between frames. */
export function farmerPoseAt(plan: FarmerPlan, path: PathRing, t: number): FarmerPose {
  const w = ((t % plan.duration) + plan.duration) % plan.duration;
  let i = plan.segments.findIndex((sg) => w >= sg.t0 && w < sg.t1);
  if (i < 0) i = plan.segments.length - 1;
  const seg = plan.segments[i]!;
  const segT = w - seg.t0;
  const segLen = seg.t1 - seg.t0 || 1;
  const u = clamp01(segT / segLen);
  const walking = seg.action === 'walk';
  // Ease speed at the ends of a walk so starts and stops aren't abrupt.
  const speedEase = walking ? ease(clamp01(Math.min(segT / 0.8, (segLen - segT) / 0.8, 1))) : 0;
  const s = walking ? seg.s0 + (seg.s1 - seg.s0) * u : seg.s1;
  const p = samplePath(path, s);
  // Smooth heading: look slightly ahead so corners round off.
  const ahead = samplePath(path, s + 0.6);
  let yaw = Math.atan2(ahead.x - p.x, ahead.z - p.z);
  if (!Number.isFinite(yaw)) yaw = p.yaw;

  const fieldYaw = Math.atan2(p.inward[0], p.inward[1]);
  let face = 0;
  let crouch = 0;
  if (!walking) {
    const settle = ease(clamp01(segT / 0.9)) * ease(clamp01((segLen - segT) / 0.9));
    face = seg.action === 'idle' ? settle * 0.35 : settle;
    if (seg.action === 'inspect') crouch = ease(clamp01(Math.min(segT - 0.8, segLen - segT - 0.4) / 1.1));
  }
  // Blend heading toward the field while stopped (shortest arc).
  let d = fieldYaw - yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  yaw += d * face;

  const dist = walking ? (seg.s1 - seg.s0) * u : 0;
  return {
    x: p.x,
    z: p.z,
    yaw,
    action: seg.action,
    walk: speedEase,
    gait: ((seg.s0 + dist) / 0.62) * Math.PI, // ~0.62 m per step
    crouch,
    faceField: face,
    segT,
  };
}
