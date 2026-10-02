import * as THREE from 'three';
import { mulberry32 } from '../prng';

/**
 * Rice hill (clump) geometry in unit height. Attributes beyond position/normal/uv:
 *  - aBlade: tiller order 0..1 (0 = first, central, upright; 1 = last, outer, arching).
 *            The shader hides blades above the current tiller count and browns the
 *            outer (oldest, lowest) leaves first during senescence.
 *  - aT:     0 at the base, 1 at the tip; drives sway weight and colour gradients.
 */
export interface ClumpOptions {
  blades: number;
  segments: number;
  /** Creased leaf (V-shaped across the midrib) — reads far better in raking light. */
  folded: boolean;
  seed?: number;
}

export function createClumpGeometry({ blades, segments, folded, seed = 7 }: ClumpOptions): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const positions: number[] = [];
  const uvs: number[] = [];
  const bladeIdx: number[] = [];
  const along: number[] = [];
  const indices: number[] = [];
  const across = folded ? 3 : 2;

  const axis = new THREE.Vector3();
  const side = new THREE.Vector3();
  const faceN = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const prev = new THREE.Vector3();
  const cur = new THREE.Vector3();

  for (let b = 0; b < blades; b++) {
    const order = b / Math.max(1, blades - 1);
    const azimuth = b * 2.399963 + rand() * 0.5; // golden-angle fan
    // Young central leaves stand up; older outer leaves lean out and arch over.
    const lean = 0.06 + order * 0.3 + rand() * 0.08;
    const arch = 0.12 + order * 0.5 + rand() * 0.15;
    const length = 0.78 + rand() * 0.2 + (1 - order) * 0.1;
    const width = 0.011 + rand() * 0.005 + order * 0.003;
    const twist = (rand() - 0.5) * 2.2;
    const tipCurl = 0.15 + rand() * 0.25;
    const dirX = Math.cos(azimuth);
    const dirZ = Math.sin(azimuth);
    const base = positions.length / 3;

    const centre = (t: number, out: THREE.Vector3) => {
      const outward = lean * t + arch * t * t * t + tipCurl * Math.pow(t, 6) * order;
      const y = length * (t - arch * 0.32 * t * t * t - tipCurl * 0.25 * Math.pow(t, 6) * order);
      return out.set(dirX * outward, y, dirZ * outward);
    };

    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      centre(t, cur);
      centre(Math.min(1, t + 0.02), prev);
      axis.copy(prev).sub(cur);
      if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0);
      axis.normalize();
      // Width vector: perpendicular to lean, then twisted about the blade axis.
      side.set(-dirZ, 0, dirX).applyAxisAngle(axis, twist * t);
      faceN.crossVectors(side, axis).normalize();
      if (faceN.dot(up) < 0) faceN.negate();
      // Sheath at the base, widest at ~1/3, tapering to a sharp tip.
      const profile = t < 0.06 ? 0.55 + t * 7 : Math.pow(Math.sin(Math.min(1, (t - 0.02) * 1.05) * Math.PI * 0.5 + 0.35), 0.6) * (1 - Math.pow(t, 3.5));
      const w = width * Math.max(0, profile);
      const crease = w * 0.45;
      if (folded) {
        positions.push(cur.x - side.x * w, cur.y - side.y * w, cur.z - side.z * w);
        positions.push(cur.x - faceN.x * crease, cur.y - faceN.y * crease, cur.z - faceN.z * crease);
        positions.push(cur.x + side.x * w, cur.y + side.y * w, cur.z + side.z * w);
        uvs.push(0, t, 0.5, t, 1, t);
      } else {
        positions.push(cur.x - side.x * w, cur.y - side.y * w, cur.z - side.z * w);
        positions.push(cur.x + side.x * w, cur.y + side.y * w, cur.z + side.z * w);
        uvs.push(0, t, 1, t);
      }
      for (let k = 0; k < across; k++) { bladeIdx.push(order); along.push(t); }
      if (s < segments) {
        const row = base + s * across;
        const next = row + across;
        for (let k = 0; k < across - 1; k++) {
          indices.push(row + k, row + k + 1, next + k, row + k + 1, next + k + 1, next + k);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aBlade', new THREE.Float32BufferAttribute(bladeIdx, 1));
  geometry.setAttribute('aT', new THREE.Float32BufferAttribute(along, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  // Instances are displaced in the shader, so give culling a generous sphere.
  if (geometry.boundingSphere) geometry.boundingSphere.radius = 1.5;
  return geometry;
}

export interface PanicleOptions {
  panicles: number;
  /** Primary branches per panicle (0 = grains straight on the rachis). */
  branches: number;
  grainsPerBranch: number;
  seed?: number;
}

/**
 * Panicles built pointing up from y=0 in unit length. aPan = (baseX, baseZ, length, 0)
 * lets the shader bend each panicle about its own base as grains fill (droop);
 * aBlade marks which panicle (young hills show fewer), aT runs base→tip.
 */
export function createPanicleGeometry({ panicles, branches, grainsPerBranch, seed = 11 }: PanicleOptions): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const positions: number[] = [];
  const bladeIdx: number[] = [];
  const along: number[] = [];
  const pan: number[] = [];
  const indices: number[] = [];

  const meta = (order: number, t: number, bx: number, bz: number, len: number) => {
    bladeIdx.push(order);
    along.push(t);
    pan.push(bx, bz, len, 0);
  };

  /** A spindle-shaped grain (husk) between two points. */
  const pushGrain = (
    from: THREE.Vector3, dir: THREE.Vector3, size: number,
    order: number, t: number, bx: number, bz: number, len: number,
  ) => {
    const base = positions.length / 3;
    const tip = from.clone().addScaledVector(dir, size * 2.6);
    const mid = from.clone().addScaledVector(dir, size * 1.2);
    const s1 = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    if (s1.lengthSq() < 1e-6) s1.set(1, 0, 0);
    const s2 = new THREE.Vector3().crossVectors(dir, s1).normalize();
    const verts = [
      from, tip,
      mid.clone().addScaledVector(s1, size * 0.62), mid.clone().addScaledVector(s1, -size * 0.62),
      mid.clone().addScaledVector(s2, size * 0.45), mid.clone().addScaledVector(s2, -size * 0.45),
    ];
    for (const v of verts) { positions.push(v.x, v.y, v.z); meta(order, t, bx, bz, len); }
    const faces = [1, 2, 4, 1, 4, 3, 1, 3, 5, 1, 5, 2, 0, 4, 2, 0, 3, 4, 0, 5, 3, 0, 2, 5];
    for (const f of faces) indices.push(base + f);
  };

  /** Thin two-sided ribbon for the rachis / branches. */
  const pushStem = (points: THREE.Vector3[], width: number, order: number, ts: number[], bx: number, bz: number, len: number) => {
    const base = positions.length / 3;
    points.forEach((p, i) => {
      positions.push(p.x - width, p.y, p.z, p.x + width, p.y, p.z);
      meta(order, ts[i] ?? 0, bx, bz, len);
      meta(order, ts[i] ?? 0, bx, bz, len);
      if (i < points.length - 1) {
        const k = base + i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    });
  };

  for (let p = 0; p < panicles; p++) {
    const order = p / Math.max(1, panicles - 1);
    const azimuth = p * 2.399963 + rand();
    const spread = 0.03 + rand() * 0.06;
    const bx = Math.cos(azimuth) * spread;
    const bz = Math.sin(azimuth) * spread;
    const len = 0.2 + rand() * 0.07;
    const lean = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth)).multiplyScalar(0.12);

    const rachisPts: THREE.Vector3[] = [];
    const rachisT: number[] = [];
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      rachisPts.push(new THREE.Vector3(bx + lean.x * t * len, t * len, bz + lean.z * t * len));
      rachisT.push(t);
    }
    pushStem(rachisPts, 0.0014, order, rachisT, bx, bz, len);

    if (branches === 0) {
      for (let g = 0; g < grainsPerBranch; g++) {
        const t = 0.2 + (g / Math.max(1, grainsPerBranch - 1)) * 0.8;
        const side = g % 2 === 0 ? 1 : -1;
        const from = new THREE.Vector3(bx + side * 0.004 * Math.cos(azimuth + 1.57), t * len, bz + side * 0.004 * Math.sin(azimuth + 1.57));
        pushGrain(from, new THREE.Vector3(side * 0.3 * Math.cos(azimuth + 1.57), 1, side * 0.3 * Math.sin(azimuth + 1.57)).normalize(), 0.0034, order, t, bx, bz, len);
      }
      continue;
    }

    for (let br = 0; br < branches; br++) {
      // Branches sit on the lower 3/4 of the rachis and get shorter towards the tip.
      const t0 = 0.12 + (br / branches) * 0.7;
      const start = new THREE.Vector3(bx + lean.x * t0 * len, t0 * len, bz + lean.z * t0 * len);
      const ang = azimuth + br * 2.2 + rand() * 0.6;
      const bLen = len * (0.42 - 0.25 * (br / branches)) * (0.85 + rand() * 0.3);
      const bDir = new THREE.Vector3(Math.cos(ang) * 0.45, 1, Math.sin(ang) * 0.45).normalize();
      const end = start.clone().addScaledVector(bDir, bLen);
      pushStem([start, end], 0.0008, order, [t0, Math.min(1, t0 + bLen / len)], bx, bz, len);
      for (let g = 0; g < grainsPerBranch; g++) {
        const f = (g + 0.5) / grainsPerBranch;
        const from = start.clone().lerp(end, f);
        const side = g % 2 === 0 ? 1 : -1;
        const gDir = bDir.clone().add(new THREE.Vector3(-bDir.z, 0, bDir.x).multiplyScalar(side * 0.5)).normalize();
        pushGrain(from, gDir, 0.0032 + rand() * 0.0006, order, Math.min(1, t0 + (f * bLen) / len), bx, bz, len);
      }
    }
    // Terminal grains at the rachis tip.
    const tip = rachisPts[rachisPts.length - 1]!;
    pushGrain(tip, new THREE.Vector3(lean.x, 1, lean.z).normalize(), 0.0034, order, 1, bx, bz, len);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aBlade', new THREE.Float32BufferAttribute(bladeIdx, 1));
  geometry.setAttribute('aT', new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute('aPan', new THREE.Float32BufferAttribute(pan, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius = 1.6;
  return geometry;
}
