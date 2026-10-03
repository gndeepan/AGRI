import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../prng';

/** Non-indexed, uv-less copy of `geo` painted with one colour (optionally jittered per triangle). */
export function colored(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i += 3) {
    const k = 1 + (rand() - 0.5) * jitter;
    for (let v = 0; v < 3 && i + v < count; v++) colors.set([c.r * k, c.g * k, c.b * k], (i + v) * 3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  geo.dispose();
  return g;
}

/** Merge coloured parts; disposes the inputs. Returns an empty geometry for an empty list. */
export function mergeColored(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    if (!p.getAttribute('normal')) p.computeVertexNormals();
    return p;
  });
  const merged = list.length ? mergeGeometries(list, false) : null;
  list.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Position/rotate/scale a geometry in place and return it. */
export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, scale = 1, pitch = 0, roll = 0): THREE.BufferGeometry {
  _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(scale, scale, scale));
  g.applyMatrix4(_m);
  return g;
}

/** Box with its base on y = 0, centred in x/z. */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

/**
 * Gable roof (ridge along x) with an overhang, base at y = 0. Slopes use `roofColor`, the
 * triangular gable ends `endColor`.
 */
export function gableRoof(w: number, d: number, h: number, roofColor: THREE.ColorRepresentation, endColor: THREE.ColorRepresentation, jitter = 0.18, seed = 3): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const slope = (...p: number[]) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const front = slope(-hw, 0, hd, hw, 0, hd, hw, h, 0, -hw, 0, hd, hw, h, 0, -hw, h, 0);
  const back = slope(hw, 0, -hd, -hw, 0, -hd, -hw, h, 0, hw, 0, -hd, -hw, h, 0, hw, h, 0);
  const endL = slope(-hw, 0, -hd, -hw, 0, hd, -hw, h, 0);
  const endR = slope(hw, 0, hd, hw, 0, -hd, hw, h, 0);
  for (const g of [front, back, endL, endR]) g.computeVertexNormals();
  return mergeColored([
    colored(front, roofColor, jitter, seed),
    colored(back, roofColor, jitter, seed + 1),
    colored(endL, endColor, 0, seed),
    colored(endR, endColor, 0, seed),
  ]);
}

/** Thin ribbon between two ground points at height y (flat quad, normal +y). */
export function ribbon(ax: number, az: number, bx: number, bz: number, width: number, y: number): THREE.BufferGeometry {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * (width / 2);
  const nz = (dx / len) * (width / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
    ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  return g;
}
