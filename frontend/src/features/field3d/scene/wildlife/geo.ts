import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ColoredPart = [THREE.BufferGeometry, string | THREE.Color];

/** Merges primitives into one non-indexed geometry with per-vertex colours (one draw call per body part). */
export function buildColored(parts: ColoredPart[]): THREE.BufferGeometry {
  const list = parts.map(([g, c]) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    n.deleteAttribute('uv');
    const col = new THREE.Color(c);
    const count = n.getAttribute('position').count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) arr.set([col.r, col.g, col.b], i * 3);
    n.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    return n;
  });
  const merged = mergeGeometries(list, false) ?? new THREE.BufferGeometry();
  parts.forEach(([g]) => g.dispose());
  list.forEach((g) => g.dispose());
  merged.computeVertexNormals();
  return merged;
}

/** Tapered limb segment whose origin is the top joint and which extends along -y. */
export function limb(topR: number, botR: number, len: number, radial = 7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(topR, botR, len, radial, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

export function ellipsoid(rx: number, ry: number, rz: number, w = 10, h = 8): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, h);
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
