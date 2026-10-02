import * as THREE from 'three';
import { LEAF, PART, PlantBuilder, dirFrom, rotateMorph, v3, type Organ, type Profile } from '../builder';
import type { CropSpec, RGB } from '../specs';

export type Detail = 'near' | 'mid';
export type Rand = () => number;

export interface Ctx {
  b: PlantBuilder;
  spec: CropSpec;
  rand: Rand;
  near: boolean;
}

/** Leaves carry only a brightness in their vertex colour; the shader applies the stage hue. */
export function leafTint(rand: Rand, lo = 0.9, hi = 1.12): RGB {
  const t = lo + rand() * (hi - lo);
  return [t, t, t];
}

export const leafOrgan = (ctx: Ctx, pivot: THREE.Vector3, order: number, morph?: Organ['morph']): Organ => ({
  part: PART.LEAF, order, color: leafTint(ctx.rand), pivot, morph,
});

export const stemOrgan = (ctx: Ctx, pivot = v3(0, 0, 0), color?: RGB): Organ => ({
  part: PART.STEM, order: 0, color: color ?? ctx.spec.colors.stem, pivot,
});

/** Smooth curved stem from base towards `dir`, bending by `bend` (radians) over its length. */
export function curvedPath(base: THREE.Vector3, dir: THREE.Vector3, length: number, bend: number, segs: number, bendAxis?: THREE.Vector3): THREE.Vector3[] {
  const d = dir.clone().normalize();
  const axis = (bendAxis ?? d.clone().cross(v3(0, -1, 0))).clone();
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  axis.normalize();
  const pts = [base.clone()];
  const p = base.clone();
  for (let i = 0; i < segs; i++) {
    p.addScaledVector(d, length / segs);
    d.applyAxisAngle(axis, bend / segs).normalize();
    pts.push(p.clone());
  }
  return pts;
}

/** Point a fraction `t` (0..1) along a polyline. */
export function along(path: THREE.Vector3[], t: number): THREE.Vector3 {
  const f = Math.min(0.9999, Math.max(0, t)) * (path.length - 1);
  const i = Math.floor(f);
  return path[i]!.clone().lerp(path[i + 1] ?? path[i]!, f - i);
}

/** Tangent direction at fraction t of a polyline. */
export function tangentAt(path: THREE.Vector3[], t: number): THREE.Vector3 {
  const f = Math.min(0.9999, Math.max(0, t)) * (path.length - 1);
  const i = Math.floor(f);
  return path[Math.min(i + 1, path.length - 1)]!.clone().sub(path[i]!).normalize();
}

/** A compound leaf with leaflets in pairs along a rachis (groundnut, tomato, chickpea). */
export function pinnateLeaf(
  ctx: Ctx, base: THREE.Vector3, dir: THREE.Vector3, opts: {
    rachis: number; pairs: number; terminal: boolean; leafletL: number; leafletW: number; profile?: Profile; order: number; arch?: number;
    /** Tiny leaflets (chickpea) need only a couple of segments. */
    light?: boolean;
  },
) {
  const { b, near } = ctx;
  const segs = near && !opts.light ? 4 : 2;
  const path = curvedPath(base, dir, opts.rachis, opts.arch ?? 0.6, near ? 4 : 2);
  const organ = leafOrgan(ctx, base, opts.order);
  b.tube(path, () => 0.0018, 3, organ);
  for (let i = 0; i < opts.pairs; i++) {
    const t = 0.25 + (0.75 * (i + 1)) / (opts.pairs + 1);
    const p = along(path, t);
    const tan = tangentAt(path, t);
    const side = tan.clone().cross(v3(0, 1, 0)).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    for (const sgn of [-1, 1]) {
      const d = side.clone().multiplyScalar(sgn).addScaledVector(tan, 0.5).add(v3(0, 0.25, 0)).normalize();
      b.leaf(p, d, organ, { length: opts.leafletL, width: opts.leafletW, profile: opts.profile ?? LEAF.ovate, segs, arch: 0.4 });
    }
  }
  if (opts.terminal) {
    const end = path[path.length - 1]!;
    b.leaf(end, tangentAt(path, 1).add(v3(0, 0.2, 0)), organ, { length: opts.leafletL * 1.1, width: opts.leafletW, profile: opts.profile ?? LEAF.ovate, segs, arch: 0.4 });
  }
}

/** Three leaflets on a petiole (black gram, green gram, cowpea, red gram). */
export function trifoliate(ctx: Ctx, base: THREE.Vector3, dir: THREE.Vector3, opts: { petiole: number; leafletL: number; leafletW: number; profile?: Profile; order: number; light?: boolean }) {
  const { b, near } = ctx;
  const path = curvedPath(base, dir, opts.petiole, 0.5, 2);
  const organ = leafOrgan(ctx, base, opts.order);
  b.tube(path, () => 0.002, 3, organ);
  const end = path[path.length - 1]!;
  const tan = tangentAt(path, 1);
  const side = tan.clone().cross(v3(0, 1, 0)).normalize();
  // `light` keeps very leafy shrubs (red gram) inside the vertex budget.
  const seg = near && !opts.light ? 4 : 2;
  const prof = opts.profile ?? LEAF.ovate;
  b.leaf(end, tan.clone().add(v3(0, 0.25, 0)), organ, { length: opts.leafletL, width: opts.leafletW, profile: prof, segs: seg, arch: 0.5, curl: 0.05, across: near && !opts.light ? 5 : 3 });
  for (const sgn of [-1, 1]) {
    const d = side.clone().multiplyScalar(sgn).addScaledVector(tan, 0.35).add(v3(0, 0.2, 0));
    b.leaf(end, d, organ, { length: opts.leafletL * 0.85, width: opts.leafletW * 0.9, profile: prof, segs: seg, arch: 0.5 });
  }
}

/**
 * Palmate leaf: lobes fanned out from the petiole tip (castor, cotton, bhendi, tapioca).
 * The blade is tilted outward (`tilt`, radians from horizontal) so it reads from eye level,
 * and the fused centre of the blade is filled by a small web.
 */
export function palmateLeaf(
  ctx: Ctx, base: THREE.Vector3, dir: THREE.Vector3, opts: {
    petiole: number; lobes: number; lobeL: number; lobeW: number; spread: number; order: number; profile?: Profile; petioleColor?: RGB;
    tilt?: number; web?: number; droop?: number; petioleR?: number;
  },
) {
  const { b, near } = ctx;
  const path = curvedPath(base, dir, opts.petiole, 0.7, near ? 3 : 2);
  const organ = leafOrgan(ctx, base, opts.order);
  b.tube(path, () => opts.petioleR ?? 0.003, 3, opts.petioleColor ? { ...organ, color: opts.petioleColor, part: PART.STEM } : organ);
  const end = path[path.length - 1]!;
  const tan = tangentAt(path, 1);
  const out = v3(tan.x, 0, tan.z);
  if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
  out.normalize();
  const tilt = opts.tilt ?? 0.35;
  // In-plane axes of the tilted blade: `fwd` points away from the plant and downhill, `side` across.
  const fwd = out.clone().multiplyScalar(Math.cos(tilt)).add(v3(0, -Math.sin(tilt), 0));
  const side = out.clone().cross(v3(0, 1, 0)).normalize();
  const normal = side.clone().cross(fwd).normalize();
  const web = (opts.web ?? 0.3) * opts.lobeL;
  if (web > 0) b.disc(end, normal.y < 0 ? normal.clone().negate() : normal, web, near ? Math.max(6, opts.lobes) : 5, organ, 0.92);
  for (let i = 0; i < opts.lobes; i++) {
    const f = opts.lobes === 1 ? 0 : i / (opts.lobes - 1) - 0.5;
    const a = f * opts.spread;
    const len = opts.lobeL * (1 - Math.abs(f) * 0.5);
    const d = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).normalize();
    b.leaf(end, d, organ, {
      length: len, width: opts.lobeW * (1 - Math.abs(f) * 0.25), profile: opts.profile ?? LEAF.lance, segs: near ? 4 : 2,
      arch: opts.droop ?? 0.35, curl: 0.06, across: near ? 5 : 3,
    });
  }
}

/** Tubular bell flower (sesame): a short tube from `base` along `dir`, flaring at the mouth. */
export function bellFlower(ctx: Ctx, base: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, order: number, color?: RGB) {
  const organ: Organ = { part: PART.FLOWER, order, color: color ?? ctx.spec.colors.flower, pivot: base.clone() };
  const path = curvedPath(base, dir, length, 0.5, ctx.near ? 3 : 2);
  ctx.b.tube(path, (s) => radius * (0.35 + 0.65 * s * s + (s > 0.85 ? 0.35 : 0)), ctx.near ? 6 : 4, organ, (s) => 0.9 + 0.15 * s);
}

/** Small star/cup flower facing `normal`. */
export function flower(ctx: Ctx, center: THREE.Vector3, normal: THREE.Vector3, radius: number, order: number, color?: RGB, petals = 5, eye?: RGB) {
  const organ: Organ = { part: PART.FLOWER, order, color: color ?? ctx.spec.colors.flower, pivot: center.clone() };
  // Contrasting centre (bhendi's crimson eye, brinjal's yellow anther cone).
  if (eye) ctx.b.disc(center.clone().addScaledVector(normal.clone().normalize(), radius * 0.12), normal, radius * 0.32, 5, { ...organ, color: eye });
  if (!ctx.near) {
    ctx.b.disc(center, normal, radius, 5, organ);
    return;
  }
  const n = normal.clone().normalize();
  let a = n.clone().cross(v3(0, 1, 0));
  if (a.lengthSq() < 1e-6) a = v3(1, 0, 0);
  a.normalize();
  const c = n.clone().cross(a).normalize();
  for (let k = 0; k < petals; k++) {
    const t = (k / petals) * Math.PI * 2;
    const d = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(c, Math.sin(t)).addScaledVector(n, 0.35).normalize();
    ctx.b.leaf(center, d, organ, { length: radius, width: radius * 0.75, profile: LEAF.ovate, segs: 2 });
  }
}

/** Droop morph that swings an organ down about a horizontal axis through its pivot. */
export function hangMorph(pivot: THREE.Vector3, outward: THREE.Vector3, angle: number) {
  const axis = outward.clone().setY(0).cross(v3(0, 1, 0));
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  return rotateMorph(pivot, axis.normalize(), angle);
}

/** Even yaw spread with jitter (phyllotaxis): golden angle by default. */
export function phyllo(i: number, rand: Rand, step = 2.39996): number {
  return i * step + (rand() - 0.5) * 0.5;
}

export { LEAF, PART, v3, dirFrom, rotateMorph };
export type { Organ };
