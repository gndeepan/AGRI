import { insideField, nearestPointInside, type FieldShape } from '../../fieldShape';
import { mulberry32 } from '../../prng';

export interface BirdPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0..1 forward lean of the body. */
  pitch: number;
  /** Neck extension: 0 = retracted S-curve, 1 = fully stretched; >1 strike. */
  neck: number;
  /** Neck pitch down for foraging (radians). */
  neckDrop: number;
  /** Wing flap phase (radians) and amplitude 0..1 (0 = folded). */
  flap: number;
  flapAmp: number;
  /** Leg gait phase (radians) and 0..1 intensity; legs tuck in flight. */
  gait: number;
  gaitAmp: number;
  legsTucked: boolean;
  state: 'wade' | 'stalk' | 'strike' | 'stand' | 'flight' | 'perch' | 'walk' | 'hop' | 'sally';
}

const TAU = Math.PI * 2;
const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A smooth deterministic wander inside `radius` of (cx, cz) from summed sines (no state). */
function wander(cx: number, cz: number, r: number, t: number, p: { f1: number; f2: number; f3: number; f4: number; ph: number }) {
  const x = cx + r * (0.65 * Math.sin(t * p.f1 + p.ph) + 0.35 * Math.sin(t * p.f3 + p.ph * 2.1));
  const z = cz + r * (0.65 * Math.sin(t * p.f2 + p.ph * 1.7) + 0.35 * Math.sin(t * p.f4 + p.ph * 0.6));
  return [x, z] as const;
}

export interface WaderParams {
  cx: number;
  cz: number;
  r: number;
  f1: number; f2: number; f3: number; f4: number;
  ph: number;
  cyclePeriod: number;
  flightEvery: number;
  flightLoop: number;
  seed: number;
}

export function waderParams(seed: number, cx: number, cz: number, r: number): WaderParams {
  const rand = mulberry32(seed * 977 + 13);
  return {
    cx, cz, r,
    f1: 0.05 + rand() * 0.03, f2: 0.045 + rand() * 0.03, f3: 0.11 + rand() * 0.05, f4: 0.09 + rand() * 0.05,
    ph: rand() * TAU,
    cyclePeriod: 20 + rand() * 6,
    flightEvery: 5 + Math.floor(rand() * 3),
    flightLoop: 5 + rand() * 4,
    seed,
  };
}

/** Walk-clock: advances only while the egret is actually stepping (full speed wading, a crawl while stalking). */
function egretWalkClock(p: WaderParams, k: number, u: number): number {
  const perCycle = p.cyclePeriod * (0.5 + 0.2 * 0.25);
  const within = u < 0.5 ? u * p.cyclePeriod : p.cyclePeriod * 0.5 + (Math.min(u, 0.7) - 0.5) * p.cyclePeriod * 0.25;
  return k * perCycle + within;
}

/**
 * Cattle egret: a slow wading gait, then stalk (head and neck retract, steps slow), a quick strike at the water,
 * a pause to swallow, and every few cycles a take-off, a short glide loop over the field, and a landing.
 */
export function egretPose(shape: FieldShape, p: WaderParams, waterY: number, t: number): BirdPose {
  const k = Math.floor(t / p.cyclePeriod);
  const u = (t - k * p.cyclePeriod) / p.cyclePeriod;
  const flying = k % p.flightEvery === p.flightEvery - 1;
  const tau = egretWalkClock(p, k, u);
  const [wx, wz] = wander(p.cx, p.cz, p.r, tau, p);
  // Travel direction comes from the wander path itself so a bird that stops keeps facing the way it was going.
  const [vx, vz] = wander(p.cx, p.cz, p.r, tau + 0.5, p);
  let yaw = Math.atan2(vx - wx, vz - wz);

  let x = wx;
  let z = wz;
  let y = waterY;
  let neck: number;
  let neckDrop = 0;
  let pitch = 0;
  let flapAmp = 0;
  let state: BirdPose['state'] = 'wade';
  let flap = t * 11;
  let legsTucked = false;
  let gaitAmp = 0;

  const loopAt = (uu: number) => {
    const sh = Math.sin(Math.PI * uu);
    const ang = uu * TAU + p.ph;
    return [Math.cos(ang) * p.flightLoop * sh, Math.sin(ang) * p.flightLoop * sh] as const;
  };

  if (flying) {
    const a = ease(clamp01(u / 0.12)) * ease(clamp01((1 - u) / 0.14));
    const [ox, oz] = loopAt(u);
    const [ox2, oz2] = loopAt(Math.min(1, u + 0.01));
    x += ox;
    z += oz;
    y += a * (1.6 + 1.4 * Math.sin(Math.PI * u));
    if (Math.hypot(ox2 - ox, oz2 - oz) > 1e-4) yaw = Math.atan2(ox2 - ox, oz2 - oz);
    pitch = 0.2 * a;
    neck = 0.3 + 0.2 * (1 - a); // neck folded back in flight
    flapAmp = a * (u < 0.3 || u > 0.7 ? 1 : 0.25 + 0.2 * Math.max(0, Math.sin(t * 1.3)));
    flap = t * 9;
    legsTucked = a > 0.5;
    gaitAmp = (1 - a) * 0.4;
    state = 'flight';
  } else if (u < 0.5) {
    gaitAmp = 1;
    neck = 0.55 + 0.1 * Math.sin(t * 2.2); // head bobs with each step
  } else if (u < 0.7) {
    const sm = ease(clamp01((u - 0.5) / 0.06));
    gaitAmp = 0.25;
    neck = 0.5 - 0.4 * sm;
    neckDrop = 0.15 * sm;
    pitch = 0.22 * sm;
    state = 'stalk';
  } else if (u < 0.74) {
    const sm = (u - 0.7) / 0.04;
    const snap = Math.sin(Math.PI * clamp01(sm));
    neck = 0.1 + 1.0 * snap;
    neckDrop = 0.15 + 0.95 * snap;
    pitch = 0.22 + 0.25 * snap;
    state = 'strike';
  } else {
    const sm = ease(clamp01((u - 0.74) / 0.12));
    neck = 0.1 + 0.4 * sm;
    neckDrop = 0.15 * (1 - sm);
    pitch = 0.22 * (1 - sm);
    state = 'stand';
  }

  if (!flying && !insideField(shape, x, z)) {
    const [nx, nz] = nearestPointInside(shape, x, z, 0.8);
    x = nx;
    z = nz;
  }
  const stepping = state === 'wade' || state === 'stalk';
  return {
    x, y, z, yaw, pitch, neck, neckDrop, flap, flapAmp,
    gait: stepping ? tau * 3.2 * Math.PI : 0,
    gaitAmp: stepping || flying ? gaitAmp : 0,
    legsTucked, state,
  };
}

export interface PerchParams {
  cx: number;
  cz: number;
  r: number;
  h: number;
  perchH: number;
  speed: number;
  ph: number;
  /** Seconds per fly+perch cycle. */
  period: number;
  perchFrac: number;
}

export function parakeetParams(seed: number, cx: number, cz: number, r: number, canopyH: number): PerchParams {
  const rand = mulberry32(seed * 311 + 5);
  return { cx, cz, r: r * (0.55 + rand() * 0.3), h: 3 + rand() * 3, perchH: canopyH + 0.12, speed: 0.55 + rand() * 0.25, ph: rand() * TAU, period: 16 + rand() * 6, perchFrac: 0.35 };
}

/**
 * Rose-ringed parakeet: fast, direct flight in loops over the field with rapid wingbeats; when `ripeness`
 * is high it lands on a grain head near the loop, sits, and takes off again.
 */
export function parakeetPose(shape: FieldShape, p: PerchParams, ripeness: number, t: number): BirdPose {
  const wantPerch = ripeness > 0.35;
  const k = Math.floor(t / p.period);
  const u = (t - k * p.period) / p.period;
  const perching = wantPerch && u > 1 - p.perchFrac;
  const orbit = (tt: number) => {
    const a = tt * p.speed + p.ph + k * 1.7;
    return [p.cx + Math.cos(a) * p.r, p.cz + Math.sin(a * 0.8) * p.r * 0.8, a] as const;
  };
  const flightU = u / (1 - p.perchFrac);
  // Frozen orbit position while perching (the orbit time at the moment of landing).
  const tl = k * p.period + (1 - p.perchFrac) * p.period;
  const [ox, oz] = orbit(perching ? tl : t);
  let x = ox;
  let z = oz;
  if (!insideField(shape, x, z) && (perching || ripeness > 0.35)) {
    const [nx, nz] = nearestPointInside(shape, x, z, 1.0);
    x = nx;
    z = nz;
  }
  const [ox2, oz2] = orbit(t + 0.05);
  let yaw = Math.atan2(ox2 - ox, oz2 - oz);
  const yawA = yaw;
  let y = p.h + Math.sin(t * 0.9 + p.ph) * 0.4;
  let flapAmp = 1;
  let state: BirdPose['state'] = 'flight';
  if (wantPerch) {
    // Descend into the landing during the last part of the flight, climb out after the perch.
    const down = ease(clamp01((flightU - 0.7) / 0.3));
    const up = ease(clamp01((u - 0) / 0.08));
    if (perching) {
      y = p.perchH;
      flapAmp = 0;
      state = 'perch';
      yaw = yawA;
    } else {
      y = p.perchH + (y - p.perchH) * (1 - down) * up + (u < 0.08 ? (y - p.perchH) * (1 - up) * 0 : 0);
      flapAmp = 1 - 0.6 * down * (flightU > 0.95 ? 1 : 0);
    }
  }
  return {
    x, y, z, yaw: wrapAngle(yaw), pitch: perching ? 0 : 0.12, neck: 0.3, neckDrop: perching ? 0.2 + 0.1 * Math.sin(t * 6) : 0,
    flap: t * 24, flapAmp, gait: 0, gaitAmp: 0, legsTucked: !perching, state,
  };
}

export interface GroundParams {
  s0: number;
  speed: number;
  ph: number;
}

/** Indian myna: walks briskly along the bund in short bursts with a head-bob, pausing to peck, with the odd hop. */
export function mynaPose(ringSample: (s: number) => { x: number; z: number; yaw: number }, p: GroundParams, t: number): BirdPose {
  const period = 7;
  const k = Math.floor(t / period);
  const u = (t - k * period) / period;
  const walkEnd = 0.55;
  const dist = k * 3.2 * p.speed + (u < walkEnd ? (u / walkEnd) * 3.2 * p.speed : 3.2 * p.speed);
  const s = p.s0 + dist;
  const q = ringSample(s);
  const walking = u < walkEnd;
  const step = t * 7;
  const peck = !walking && u < 0.85 ? Math.max(0, Math.sin(t * 5)) : 0;
  const hopping = !walking && u >= 0.85;
  const hop = hopping ? Math.abs(Math.sin((u - 0.85) / 0.15 * Math.PI * 2)) * 0.05 : 0;
  return {
    x: q.x, y: hop, z: q.z, yaw: q.yaw,
    pitch: 0.1 + peck * 0.3,
    neck: walking ? 0.5 + 0.5 * Math.sin(step) : 0.3,
    neckDrop: peck * 0.7,
    flap: 0, flapAmp: hopping ? 0.35 : 0,
    gait: step, gaitAmp: walking ? 1 : 0, legsTucked: false,
    state: walking ? 'walk' : hopping ? 'hop' : 'stand',
  };
}

/** Black drongo: perched upright on a post, scanning, with an occasional sally out and back after an insect. */
export function drongoPose(post: { x: number; z: number; top: number; yaw: number }, seed: number, t: number): BirdPose {
  const period = 14 + (seed % 5);
  const k = Math.floor(t / period);
  const u = (t - k * period) / period;
  const out = u > 0.82 && u < 0.97 && k % 2 === 0;
  let x = post.x;
  let y = post.top;
  let z = post.z;
  let flapAmp = 0;
  let state: BirdPose['state'] = 'perch';
  let yaw = post.yaw + Math.sin(t * 0.5 + seed) * 0.7;
  if (out) {
    const s = (u - 0.82) / 0.15;
    const loop = Math.sin(Math.PI * s);
    x += Math.cos(post.yaw) * 3.2 * loop;
    z += Math.sin(post.yaw) * 3.2 * loop;
    y += 0.8 * loop - 0.3 * Math.sin(2 * Math.PI * s) ** 2;
    yaw = post.yaw + Math.PI * (s < 0.5 ? 0 : 1) + 0.0;
    flapAmp = 1;
    state = 'sally';
  }
  return {
    x, y, z, yaw, pitch: out ? 0.1 : -0.15, neck: 0.4, neckDrop: 0, flap: t * 16, flapAmp,
    gait: 0, gaitAmp: 0, legsTucked: out, state,
  };
}
