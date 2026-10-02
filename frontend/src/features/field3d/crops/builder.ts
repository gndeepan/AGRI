import * as THREE from 'three';
import type { RGB } from './specs';

/** Organ classes understood by the crop shader (aPart attribute). */
export const PART = { STEM: 0, LEAF: 1, FLOWER: 2, FRUIT: 3, HEAD: 4 } as const;

export interface Organ {
  part: number;
  /** 0..1 appearance order within its part class: leaves unfold, flowers open and fruits set in this order. */
  order: number;
  color: RGB;
  /** Second colour (ripe fruit / ripe head). Defaults to `color`. */
  color2?: RGB;
  /** Organs grow from (and shrink to) this point. */
  pivot: THREE.Vector3;
  /** Displacement at full droop for a vertex position (onion tops falling, heads nodding). */
  morph?: (p: THREE.Vector3) => THREE.Vector3;
}

export type Profile = (s: number) => number;

/** Leaf outline width (0..1) along its length s (0 = base, 1 = tip). */
export const LEAF: Record<'strap' | 'lance' | 'ovate' | 'heart' | 'oblong' | 'needle' | 'oblance', Profile> = {
  /** Widest beyond the middle, tapering to a narrow base (cassava and castor lobes). */
  oblance: (s) => Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, s * 0.97 + 0.02), 1.5)), 0.9),
  strap: (s) => (s < 0.12 ? 0.55 + (0.45 * s) / 0.12 : Math.pow(1 - (s - 0.12) / 0.88, 0.7)),
  lance: (s) => Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.95 + 0.02)), 1.3),
  ovate: (s) => Math.pow(Math.sin(Math.PI * s), 0.75) * (1.05 - 0.35 * s),
  heart: (s) => Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 0.7),
  oblong: (s) => Math.min(1, s * 7) * Math.min(1, (1 - s) * 4.5),
  needle: (s) => 1 - s * 0.9,
};

export interface LeafOpts {
  length: number;
  width: number;
  profile: Profile;
  segs: number;
  /** Total bend towards the ground over the leaf length (radians). */
  arch?: number;
  /** Twist about the midrib over the length (radians). */
  twist?: number;
  /** V-crease depth as a share of width (grass leaves fold along the midrib). */
  fold?: number;
  /** Edge curl down for broad leaves (share of width). */
  curl?: number;
  /** Vertices across: 3 (cheap) or 5 (curled broad leaves). */
  across?: 3 | 5;
  /** Ragged edge amount 0..1 (torn banana leaves). */
  tear?: number;
  /** Vein pattern drawn by the shader: netted side veins (broad leaves) or a pale midrib (grasses). */
  veins?: 'pinnate' | 'parallel' | 'none';
  rand?: () => number;
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Rotation about `axis` through `pivot` by `angle`, as a morph displacement. */
export function rotateMorph(pivot: THREE.Vector3, axis: THREE.Vector3, angle: number): (p: THREE.Vector3) => THREE.Vector3 {
  const q = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);
  return (p) => p.clone().sub(pivot).applyQuaternion(q).add(pivot).sub(p);
}

/** Direction from yaw (around +y, 0 = +x) and elevation above the horizon. */
export function dirFrom(yaw: number, elevation: number): THREE.Vector3 {
  const ce = Math.cos(elevation);
  return v3(Math.cos(yaw) * ce, Math.sin(elevation), Math.sin(yaw) * ce);
}

/**
 * Accumulates organ meshes into one BufferGeometry with the attributes the crop
 * shader needs. Positions are in metres for a mature plant `heightM` tall.
 */
export class PlantBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private col2: number[] = [];
  private part: number[] = [];
  private order: number[] = [];
  private tt: number[] = [];
  private pivot: number[] = [];
  private morph: number[] = [];
  /** Leaf-local coordinates for the vein shader: (across -1..1, along 0..1, vein type 0 none / 1 pinnate / 2 parallel). */
  private leafUv: number[] = [];
  private idx: number[] = [];

  constructor(readonly heightM: number) {}

  vertex(p: THREE.Vector3, o: Organ, shade = 1, leaf?: readonly [number, number, number]): number {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z);
    const c2 = o.color2 ?? o.color;
    this.col.push(o.color[0] * shade, o.color[1] * shade, o.color[2] * shade);
    this.col2.push(c2[0] * shade, c2[1] * shade, c2[2] * shade);
    this.part.push(o.part);
    this.order.push(o.order);
    this.tt.push(Math.min(1.2, Math.max(0, p.y / this.heightM)));
    this.pivot.push(o.pivot.x, o.pivot.y, o.pivot.z);
    const m = o.morph ? o.morph(p) : null;
    this.morph.push(m?.x ?? 0, m?.y ?? 0, m?.z ?? 0);
    this.leafUv.push(leaf?.[0] ?? 0, leaf?.[1] ?? 0, leaf?.[2] ?? 0);
    return i;
  }

  /** Quads between consecutive rows of vertices (rows of equal length). */
  grid(
    rows: THREE.Vector3[][], o: Organ, shade: (r: number, c: number) => number = () => 1, closed = false,
    leaf?: (r: number, c: number) => readonly [number, number, number],
  ) {
    const ids = rows.map((row, r) => row.map((p, cIdx) => this.vertex(p, o, shade(r, cIdx), leaf?.(r, cIdx))));
    for (let r = 0; r + 1 < ids.length; r++) {
      const a = ids[r]!;
      const b = ids[r + 1]!;
      const n = closed ? a.length : a.length - 1;
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % a.length;
        this.idx.push(a[k]!, b[k]!, a[k1]!, a[k1]!, b[k]!, b[k1]!);
      }
    }
  }

  /** Tube along a polyline with radius r(s). */
  tube(path: THREE.Vector3[], radius: (s: number) => number, sides: number, o: Organ, shade?: (s: number) => number) {
    const rows: THREE.Vector3[][] = [];
    let normal = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < path.length; i++) {
      const s = path.length === 1 ? 0 : i / (path.length - 1);
      const p = path[i]!;
      const t = (path[Math.min(i + 1, path.length - 1)]!.clone().sub(path[Math.max(i - 1, 0)]!)).normalize();
      if (t.lengthSq() < 1e-8) t.copy(UP);
      normal = normal.sub(t.clone().multiplyScalar(normal.dot(t)));
      if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3(0, 0, 1).cross(t);
      normal.normalize();
      const bin = t.clone().cross(normal).normalize();
      const r = radius(s);
      const row: THREE.Vector3[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        row.push(p.clone().addScaledVector(normal, Math.cos(a) * r).addScaledVector(bin, Math.sin(a) * r));
      }
      rows.push(row);
    }
    this.grid(rows, o, shade ? (r) => shade(r / Math.max(1, rows.length - 1)) : undefined, true);
  }

  /**
   * A leaf blade grown from `base` in direction `dir`, bending under gravity.
   * Returns the spine so callers can attach things to it.
   */
  leaf(base: THREE.Vector3, dir: THREE.Vector3, o: Organ, opts: LeafOpts): THREE.Vector3[] {
    const segs = Math.max(2, opts.segs);
    const across = opts.across ?? 3;
    const d = dir.clone().normalize();
    let side = d.clone().cross(UP);
    if (side.lengthSq() < 1e-6) side = v3(1, 0, 0);
    side.normalize();
    const step = opts.length / segs;
    const archStep = (opts.arch ?? 0) / segs;
    const twistStep = (opts.twist ?? 0) / segs;
    const p = base.clone();
    const spine: THREE.Vector3[] = [];
    const rows: THREE.Vector3[][] = [];
    const rand = opts.rand;
    for (let i = 0; i <= segs; i++) {
      const s = i / segs;
      spine.push(p.clone());
      const nrm = side.clone().cross(d).normalize();
      let w = opts.width * opts.profile(s) * 0.5;
      if (opts.tear && rand && s > 0.1 && s < 0.95) w *= 1 - opts.tear * (rand() > 0.55 ? rand() * 0.7 : 0);
      const fold = (opts.fold ?? 0) * opts.width;
      const curl = (opts.curl ?? 0) * opts.width;
      const row: THREE.Vector3[] = [];
      if (across === 3) {
        row.push(p.clone().addScaledVector(side, -w).addScaledVector(nrm, -fold * 0.6));
        row.push(p.clone());
        row.push(p.clone().addScaledVector(side, w).addScaledVector(nrm, -fold * 0.6));
      } else {
        row.push(p.clone().addScaledVector(side, -w).addScaledVector(nrm, -curl - fold * 0.4));
        row.push(p.clone().addScaledVector(side, -w * 0.5).addScaledVector(nrm, -curl * 0.2 - fold * 0.2));
        row.push(p.clone());
        row.push(p.clone().addScaledVector(side, w * 0.5).addScaledVector(nrm, -curl * 0.2 - fold * 0.2));
        row.push(p.clone().addScaledVector(side, w).addScaledVector(nrm, -curl - fold * 0.4));
      }
      rows.push(row);
      if (i === segs) break;
      p.addScaledVector(d, step);
      // Bend towards the ground, twist about the midrib, keep the frame orthonormal.
      const axis = d.clone().cross(DOWN);
      if (axis.lengthSq() > 1e-6 && archStep !== 0) d.applyAxisAngle(axis.normalize(), archStep).normalize();
      if (twistStep !== 0) side.applyAxisAngle(d, twistStep);
      side.sub(d.clone().multiplyScalar(side.dot(d))).normalize();
    }
    const mid = (across - 1) / 2;
    const veins = opts.veins ?? ((opts.fold ?? 0) > 0 || opts.profile === LEAF.strap ? 'parallel' : 'pinnate');
    const veinType = veins === 'none' ? 0 : veins === 'pinnate' ? 1 : 2;
    // The shaded leaf base is a touch darker; the shader draws midrib and veins from the leaf coordinates.
    this.grid(rows, o, (r) => 0.8 + 0.2 * (r / segs), false, (r, cIdx) => [(cIdx - mid) / mid, r / segs, veinType]);
    return spine;
  }

  ellipsoid(center: THREE.Vector3, radii: THREE.Vector3, segU: number, segV: number, o: Organ, rotation?: THREE.Quaternion) {
    const rows: THREE.Vector3[][] = [];
    for (let j = 0; j <= segV; j++) {
      const phi = (j / segV) * Math.PI;
      const row: THREE.Vector3[] = [];
      for (let k = 0; k < segU; k++) {
        const th = (k / segU) * Math.PI * 2;
        const local = v3(Math.sin(phi) * Math.cos(th) * radii.x, Math.cos(phi) * radii.y, Math.sin(phi) * Math.sin(th) * radii.z);
        if (rotation) local.applyQuaternion(rotation);
        row.push(local.add(center));
      }
      rows.push(row);
    }
    this.grid(rows, o, (r) => 0.85 + 0.25 * (1 - r / segV), true);
  }

  /** Flat disc (fan) facing `normal`. */
  disc(center: THREE.Vector3, normal: THREE.Vector3, radius: number, segs: number, o: Organ, shade = 1) {
    const n = normal.clone().normalize();
    let a = n.clone().cross(UP);
    if (a.lengthSq() < 1e-6) a = v3(1, 0, 0);
    a.normalize();
    const b = n.clone().cross(a).normalize();
    const c = this.vertex(center.clone().addScaledVector(n, radius * 0.08), o, shade * 0.9);
    const ring: number[] = [];
    for (let k = 0; k < segs; k++) {
      const t = (k / segs) * Math.PI * 2;
      ring.push(this.vertex(center.clone().addScaledVector(a, Math.cos(t) * radius).addScaledVector(b, Math.sin(t) * radius), o, shade));
    }
    for (let k = 0; k < segs; k++) this.idx.push(c, ring[k]!, ring[(k + 1) % segs]!);
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aColor2', new THREE.Float32BufferAttribute(this.col2, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aOrder', new THREE.Float32BufferAttribute(this.order, 1));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(this.tt, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.pivot, 3));
    g.setAttribute('aMorph', new THREE.Float32BufferAttribute(this.morph, 3));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.leafUv, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
