import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setSurface, type SurfKind } from './organicMaterial';

/**
 * A primitive, its colour and (optionally) its surface kind; parts without one use the build's default.
 * A `null` colour keeps the primitive's own per-vertex `color` attribute (sculpted, painted parts).
 */
export type ColoredPart = [THREE.BufferGeometry, string | THREE.Color | null, SurfKind?];

/**
 * Merges primitives into one non-indexed geometry with per-vertex colours and surface kinds
 * (one draw call per body part). Each primitive keeps its own smooth normals: recomputing them on
 * the merged, non-indexed geometry would facet every surface.
 */
export function buildColored(parts: ColoredPart[], surface: SurfKind = 'skin'): THREE.BufferGeometry {
  const list = parts.map(([g, c, kind]) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    n.deleteAttribute('uv');
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    if (c !== null || !n.getAttribute('color')) {
      const col = new THREE.Color(c ?? '#ffffff');
      const count = n.getAttribute('position').count;
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) arr.set([col.r, col.g, col.b], i * 3);
      n.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    }
    setSurface(n, kind ?? surface);
    return n;
  });
  const merged = mergeGeometries(list, false) ?? new THREE.BufferGeometry();
  parts.forEach(([g]) => g.dispose());
  list.forEach((g) => g.dispose());
  return merged;
}

/** Tapered limb segment whose origin is the top joint and which extends along -y. */
export function limb(topR: number, botR: number, len: number, radial = 7): THREE.BufferGeometry {
  // At least 12 sides so limbs read as round, not as prisms.
  const g = new THREE.CylinderGeometry(topR, botR, len, Math.max(12, radial * 2), 3);
  g.translate(0, -len / 2, 0);
  return g;
}

export function ellipsoid(rx: number, ry: number, rz: number, w = 10, h = 8): THREE.BufferGeometry {
  // Doubled tessellation: silhouettes stay round at close range (the single-plant and bund views).
  const g = new THREE.SphereGeometry(1, Math.max(12, w * 2), Math.max(9, h * 2));
  g.scale(rx, ry, rz);
  return g;
}

export function at<T extends THREE.BufferGeometry>(g: T, x: number, y: number, z: number): T {
  g.translate(x, y, z);
  return g;
}

/** Soft shading cue baked into vertex colours: darker toward the bottom of a part. */
export function shadeY(g: THREE.BufferGeometry, lo: number, hi: number, amount = 0.25): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - amount * (1 - Math.min(1, Math.max(0, (pos.getY(i) - lo) / (hi - lo || 1))));
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return g;
}

/** One cross-section of a lofted body part: an ellipse at height `y`, centred at (x, z). */
export interface LoftRing {
  y: number;
  rx: number;
  rz: number;
  x?: number;
  z?: number;
}

/**
 * A smooth tube through elliptical cross-sections (a sculpted limb, torso or garment), with smooth
 * normals and no seam. `shape(theta, y)` scales the radius around each ring (theta 0 = +x,
 * PI/2 = +z, the front) for muscle, ribs or cloth folds. Ends are closed with a small cap unless open.
 */
export function loft(
  rings: LoftRing[],
  radial = 24,
  shape?: (theta: number, y: number) => number,
  open: { top?: boolean; bottom?: boolean } = {},
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of rings) {
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const k = shape ? shape(th, r.y) : 1;
      pos.push((r.x ?? 0) + Math.cos(th) * r.rx * k, r.y, (r.z ?? 0) + Math.sin(th) * r.rz * k);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (ring: number, flip: boolean) => {
    const r = rings[ring]!;
    const centre = pos.length / 3;
    pos.push(r.x ?? 0, r.y, r.z ?? 0);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j;
      const b = ring * radial + ((j + 1) % radial);
      if (flip) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  };
  const first = rings[0]!;
  const last = rings[rings.length - 1]!;
  const firstIsTop = first.y > last.y;
  if (!(firstIsTop ? open.top : open.bottom)) cap(0, false);
  if (!(firstIsTop ? open.bottom : open.top)) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make the winding face outward whichever way the rings run.
  const mid = Math.floor(rings.length / 2) * radial;
  const r = rings[Math.floor(rings.length / 2)]!;
  const n = g.getAttribute('normal');
  if ((pos[mid * 3]! - (r.x ?? 0)) * n.getX(mid) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/** Paints a geometry with per-vertex colours from a function of its position. */
export function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => THREE.Color | void): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const arr = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const r = fn(p.getX(i), p.getY(i), p.getZ(i), c);
    if (r && r !== c) c.copy(r);
    arr.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

export const gauss = (d: number, w: number) => Math.exp(-((d / w) ** 2));
export const smooth01 = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
