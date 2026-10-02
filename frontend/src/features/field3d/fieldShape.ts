import type { Polygon } from 'geojson';
import { hash01 } from './prng';

/**
 * The farmer's drawn polygon in local scene metres.
 * Scene axes: +x = east, -z = north, y up. Equirectangular projection around the
 * centroid is accurate to well under 0.1% for fields of a few km², which is far
 * finer than the visual needs.
 */
export interface FieldShape {
  /** Outer ring, counter-clockwise when viewed from above (+y), without the closing point. */
  ring: Array<[number, number]>;
  /** Holes (e.g. a well or a tree island), same orientation rules reversed. */
  holes: Array<Array<[number, number]>>;
  areaM2: number;
  perimeterM: number;
  /** Row direction (radians, in the x/z plane) — along the longest edge, as farmers transplant. */
  rowAngle: number;
  /** Oriented size along / across the rows. */
  lengthM: number;
  widthM: number;
  /** Centre of the oriented bounding box (scene coords). */
  center: [number, number];
  /** Radius of the circle around `center` that contains the field. */
  radius: number;
  /** True when this is the built-in demo plot (no boundary supplied). */
  synthetic: boolean;
}

const EARTH_R = 6371008.8;
const DEG = Math.PI / 180;

type Pt = [number, number];

function signedArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function openRing(coords: number[][]): number[][] {
  if (coords.length > 1) {
    const f = coords[0]!;
    const l = coords[coords.length - 1]!;
    if (f[0] === l[0] && f[1] === l[1]) return coords.slice(0, -1);
  }
  return coords;
}

/**
 * Orientation in (x, z) where z points south: a ring that is CCW seen from +y has a
 * *negative* signed area in plain (x, z) maths. We normalise so the outer ring has
 * negative (x,z) area and holes positive, which is what THREE.Shape expects once
 * mapped to (x, -z).
 */
function orient(ring: Pt[], outer: boolean): Pt[] {
  const a = signedArea(ring);
  const wantNegative = outer;
  return (a < 0) === wantNegative ? ring : [...ring].reverse();
}

export function syntheticShape(width = 24, depth = 16): FieldShape {
  const ring: Pt[] = orient([[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]], true);
  return {
    ring, holes: [], areaM2: width * depth, perimeterM: 2 * (width + depth), rowAngle: 0,
    lengthM: width, widthM: depth, center: [0, 0], radius: Math.hypot(width, depth) / 2, synthetic: true,
  };
}

export function fieldShapeFromPolygon(polygon: Polygon | null | undefined): FieldShape {
  const outerCoords = polygon?.coordinates?.[0];
  if (!polygon || !outerCoords || openRing(outerCoords).length < 3) return syntheticShape();

  const outer = openRing(outerCoords);
  let lon0 = 0;
  let lat0 = 0;
  for (const c of outer) { lon0 += c[0] ?? 0; lat0 += c[1] ?? 0; }
  lon0 /= outer.length;
  lat0 /= outer.length;
  const kx = EARTH_R * Math.cos(lat0 * DEG) * DEG;
  const kz = EARTH_R * DEG;
  const project = (ring: number[][]): Pt[] => openRing(ring).map((c) => [((c[0] ?? 0) - lon0) * kx, -((c[1] ?? 0) - lat0) * kz]);

  const ring = orient(project(outer), true);
  const holes = polygon.coordinates.slice(1).map((h) => orient(project(h), false)).filter((h) => h.length >= 3);

  let areaM2 = Math.abs(signedArea(ring));
  for (const h of holes) areaM2 -= Math.abs(signedArea(h));

  let perimeterM = 0;
  let longest = 0;
  let rowAngle = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    perimeterM += len;
    if (len > longest) { longest = len; rowAngle = Math.atan2(q[1] - p[1], q[0] - p[0]); }
  }

  // Oriented extent along/across the row direction.
  const ux = Math.cos(rowAngle);
  const uz = Math.sin(rowAngle);
  let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
  for (const [x, z] of ring) {
    const u = x * ux + z * uz;
    const v = -x * uz + z * ux;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  const center: Pt = [cu * ux - cv * uz, cu * uz + cv * ux];
  let radius = 0;
  for (const [x, z] of ring) radius = Math.max(radius, Math.hypot(x - center[0], z - center[1]));

  return {
    ring, holes, areaM2, perimeterM, rowAngle,
    lengthM: maxU - minU, widthM: maxV - minV, center, radius, synthetic: false,
  };
}

function inRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function insideField(shape: FieldShape, x: number, z: number): boolean {
  if (!inRing(x, z, shape.ring)) return false;
  for (const h of shape.holes) if (inRing(x, z, h)) return false;
  return true;
}

/** Distance from (x, z) to the field outline (positive outside, negative inside). */
export function signedDistanceToEdge(shape: FieldShape, x: number, z: number): number {
  let best = Infinity;
  const rings = [shape.ring, ...shape.holes];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!;
      const [bx, bz] = ring[(i + 1) % ring.length]!;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
  }
  return insideField(shape, x, z) ? -best : best;
}

/** Nearest point inside the field to (x, z) — used to centre the detailed plant patch near the camera. */
export function nearestPointInside(shape: FieldShape, x: number, z: number, inset = 0.5): [number, number] {
  if (insideField(shape, x, z) && signedDistanceToEdge(shape, x, z) < -inset) return [x, z];
  let best: Pt = shape.center;
  let bestD = Infinity;
  for (let i = 0; i < shape.ring.length; i++) {
    const [ax, az] = shape.ring[i]!;
    const [bx, bz] = shape.ring[(i + 1) % shape.ring.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + t * dx;
    const pz = az + t * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestD) { bestD = d; best = [px, pz]; }
  }
  // Step inward towards the field centre so the patch sits on planted ground.
  const vx = shape.center[0] - best[0];
  const vz = shape.center[1] - best[1];
  const vl = Math.hypot(vx, vz) || 1;
  const step = Math.min(inset, vl);
  return [best[0] + (vx / vl) * step, best[1] + (vz / vl) * step];
}

/** Common Tamil Nadu transplanting geometry: 20 cm between rows, 15 cm between hills. */
export const ROW_SPACING_M = 0.2;
export const HILL_SPACING_M = 0.15;

export interface Hill {
  x: number;
  z: number;
  /** Stable per-hill random numbers (from grid indices, not from order). */
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  /** Distance from the patch centre. */
  d: number;
}

/**
 * Hills on the transplanting grid, clipped to the field, within [rMin, rMax) of `focus`.
 * Positions and randoms depend only on grid indices, so moving the patch never makes
 * a hill jump or change — scrubbing and orbiting stay deterministic.
 */
export function hillsAround(
  shape: FieldShape,
  focus: [number, number],
  rMin: number,
  rMax: number,
  budget: number,
  rowSpacing = ROW_SPACING_M,
  hillSpacing = HILL_SPACING_M,
): Hill[] {
  const ux = Math.cos(shape.rowAngle);
  const uz = Math.sin(shape.rowAngle);
  // Grid frame: u along rows, v across rows, origin at the field centre.
  const fu = (focus[0] - shape.center[0]) * ux + (focus[1] - shape.center[1]) * uz;
  const fv = -(focus[0] - shape.center[0]) * uz + (focus[1] - shape.center[1]) * ux;
  const i0 = Math.floor((fu - rMax) / hillSpacing);
  const i1 = Math.ceil((fu + rMax) / hillSpacing);
  const j0 = Math.floor((fv - rMax) / rowSpacing);
  const j1 = Math.ceil((fv + rMax) / rowSpacing);
  const out: Hill[] = [];
  const rMax2 = rMax * rMax;
  const rMin2 = rMin * rMin;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const seed = (i * 73856093) ^ (j * 19349663);
      const r1 = hash01(seed);
      const r2 = hash01(seed + 1);
      const r3 = hash01(seed + 2);
      const r4 = hash01(seed + 3);
      // Hand transplanting is never perfectly on the grid.
      const u = i * hillSpacing + (r1 - 0.5) * hillSpacing * 0.35;
      const v = j * rowSpacing + (r2 - 0.5) * rowSpacing * 0.25;
      const du = u - fu;
      const dv = v - fv;
      const d2 = du * du + dv * dv;
      if (d2 >= rMax2 || d2 < rMin2) continue;
      const x = shape.center[0] + u * ux - v * uz;
      const z = shape.center[1] + u * uz + v * ux;
      if (!insideField(shape, x, z)) continue;
      // Farmers leave a little gap along the bund.
      if (signedDistanceToEdge(shape, x, z) > -0.12) continue;
      out.push({ x, z, r1, r2, r3, r4, d: Math.sqrt(d2) });
    }
  }
  if (out.length > budget) {
    out.sort((a, b) => a.d - b.d);
    out.length = budget;
  }
  return out;
}

/** "≈ 98 m × 64 m · 0.63 ha" style summary for the on-screen scale label. */
export function describeShape(shape: FieldShape): { length: number; width: number; hectares: number; acres: number } {
  return {
    length: shape.lengthM,
    width: shape.widthM,
    hectares: shape.areaM2 / 10000,
    acres: shape.areaM2 / 4046.8564224,
  };
}
