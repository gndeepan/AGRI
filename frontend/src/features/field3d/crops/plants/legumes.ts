import * as THREE from 'three';
import {
  LEAF, PART, along, curvedPath, dirFrom, flower, hangMorph, pinnateLeaf, stemOrgan, tangentAt, trifoliate, v3, type Ctx, type Organ,
} from './common';

/** Hanging pod (cylinder-ish) from `p` along `dir`; ripens from fruit → fruitRipe. */
function pod(ctx: Ctx, p: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, order: number, curve = 0.3) {
  const organ: Organ = { part: PART.FRUIT, order, color: ctx.spec.colors.fruit, color2: ctx.spec.colors.fruitRipe, pivot: p.clone() };
  const path = curvedPath(p, dir, length, curve, ctx.near ? 4 : 2);
  ctx.b.tube(path, (s) => radius * Math.min(1, Math.sin(Math.PI * Math.min(1, 0.08 + s * 0.92)) * 1.4), ctx.near ? 5 : 3, organ);
}

/** Groundnut: low, spreading branches with 4-leaflet leaves and small yellow flowers near the base. */
export function groundnut(ctx: Ctx) {
  const { b, rand, near } = ctx;
  const branches = near ? 7 : 4;
  for (let i = 0; i < branches; i++) {
    const yaw = (i / branches) * Math.PI * 2 + rand() * 0.5;
    const main = i === 0;
    const path = curvedPath(v3(0, 0, 0), dirFrom(yaw, main ? 1.35 : 0.55 + rand() * 0.3), main ? 0.3 : 0.24 + rand() * 0.08, main ? 0.1 : -0.35, near ? 5 : 3);
    b.tube(path, (s) => 0.004 * (1 - 0.5 * s), 3, stemOrgan(ctx));
    const nodes = near ? 5 : 3;
    for (let k = 0; k < nodes; k++) {
      const t = 0.2 + (k / nodes) * 0.8;
      const p = along(path, t);
      const d = tangentAt(path, t).add(dirFrom(yaw + (k % 2 ? 1.2 : -1.2), 0.9)).normalize();
      pinnateLeaf(ctx, p, d, { rachis: 0.05, pairs: 2, terminal: false, leafletL: 0.035, leafletW: 0.022, order: (t + i * 0.02) * 0.9, arch: 0.3 });
      // Flowers sit low on the branches; pegs (hidden) go into the soil after.
      if (k < 3 && rand() > 0.3) flower(ctx, p.clone().add(v3(0, 0.01, 0)), v3(0, 1, 0.2), 0.009, rand() * 0.8, undefined, 4);
    }
  }
}

/** Black gram / green gram / cowpea: an erect bush of trifoliate leaves with pods in clusters. */
export function trifoliatePulse(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const variant = spec.variant ?? 'black_gram';
  const main = curvedPath(v3(0, 0, 0), v3((rand() - 0.5) * 0.1, 1, (rand() - 0.5) * 0.1), H * 0.7, 0.15, near ? 5 : 3);
  b.tube(main, (s) => 0.006 * (1 - 0.5 * s), 4, stemOrgan(ctx));
  const branches = near ? 4 : 2;
  const stems = [main];
  for (let i = 0; i < branches; i++) {
    const p = along(main, 0.15 + i * 0.15);
    const path = curvedPath(p, dirFrom(i * 2.4 + rand(), 0.7), H * (0.35 + rand() * 0.15), 0.3, near ? 4 : 2);
    b.tube(path, () => 0.0035, 3, stemOrgan(ctx));
    stems.push(path);
  }
  const leafL = variant === 'cowpea' ? 0.085 : 0.06;
  stems.forEach((path, si) => {
    const nodes = si === 0 ? (near ? 6 : 3) : near ? 3 : 2;
    for (let k = 0; k < nodes; k++) {
      const t = 0.2 + (k / nodes) * 0.8;
      const p = along(path, t);
      const order = Math.min(0.95, t * 0.85 + si * 0.03);
      trifoliate(ctx, p, dirFrom(k * 2.4 + si + rand() * 0.5, 0.55), { petiole: 0.06, leafletL: leafL, leafletW: leafL * 0.62, order });
      if (k >= nodes - 2) {
        // Axillary raceme: flowers, then a cluster of pods.
        const peduncle = curvedPath(p, dirFrom(k * 2.4 + 1.2, 0.9), 0.04, 0.2, 2);
        const tip = peduncle[peduncle.length - 1]!;
        flower(ctx, tip, v3(0, 1, 0), 0.008, rand() * 0.6);
        const pods = variant === 'cowpea' ? 2 : 3 + Math.floor(rand() * 2);
        const podL = variant === 'cowpea' ? 0.16 : variant === 'green_gram' ? 0.08 : 0.05;
        for (let j = 0; j < pods; j++) {
          // Green/black gram pods splay upward-outward; cowpea pods hang.
          const elev = variant === 'cowpea' ? -0.9 : 0.4 - j * 0.25;
          pod(ctx, tip, dirFrom(j * 1.9 + rand(), elev), podL, variant === 'cowpea' ? 0.004 : 0.0035, rand() * 0.6, variant === 'cowpea' ? 0.5 : 0.2);
        }
      }
    }
  });
}

/** Red gram: a tall, woody shrub with small trifoliate leaves; yellow flowers streaked red; flat pods. */
export function redGram(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const main = curvedPath(v3(0, 0, 0), v3(0, 1, 0), H * 0.92, 0.08, near ? 7 : 4);
  b.tube(main, (s) => 0.012 * (1 - 0.6 * s), 5, stemOrgan(ctx));
  const branches = near ? 8 : 5;
  for (let i = 0; i < branches; i++) {
    const t = 0.25 + (i / branches) * 0.65;
    const p = along(main, t);
    const path = curvedPath(p, dirFrom(i * 2.4 + rand(), 0.85), H * (0.32 - t * 0.12), 0.25, near ? 4 : 2);
    b.tube(path, () => 0.004, 3, stemOrgan(ctx));
    const leaves = near ? 4 : 2;
    for (let k = 0; k < leaves; k++) {
      const q = along(path, 0.3 + (k / leaves) * 0.7);
      trifoliate(ctx, q, dirFrom(k * 2.1 + i, 0.4), { petiole: 0.03, leafletL: 0.06, leafletW: 0.022, profile: LEAF.lance, order: Math.min(0.95, t * 0.9) });
    }
    const tip = path[path.length - 1]!;
    // Terminal racemes: yellow flowers with red streaks, then flat pods.
    for (let k = 0; k < (near ? 3 : 1); k++) {
      const fp = tip.clone().add(v3((rand() - 0.5) * 0.05, rand() * 0.04, (rand() - 0.5) * 0.05));
      flower(ctx, fp, v3(0, 1, 0), 0.01, rand() * 0.7, k === 0 ? spec.colors.head : spec.colors.flower);
      pod(ctx, fp, dirFrom(rand() * 6.28, -0.4), 0.065, 0.005, rand() * 0.6, 0.15);
    }
  }
}

/** Bengal gram: low bushy plant with many small feathery leaflets and single pods. */
export function bengalGram(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const branches = near ? 6 : 3;
  for (let i = 0; i < branches; i++) {
    const yaw = (i / branches) * Math.PI * 2 + rand() * 0.4;
    const path = curvedPath(v3(0, 0, 0), dirFrom(yaw, 1.0 + rand() * 0.3), H * (0.75 + rand() * 0.2), -0.2, near ? 5 : 3);
    b.tube(path, (s) => 0.003 * (1 - 0.4 * s), 3, stemOrgan(ctx));
    const nodes = near ? 6 : 3;
    for (let k = 0; k < nodes; k++) {
      const t = 0.15 + (k / nodes) * 0.85;
      const p = along(path, t);
      pinnateLeaf(ctx, p, dirFrom(yaw + (k % 2 ? 1.3 : -1.3), 0.4), {
        rachis: 0.045, pairs: near ? 5 : 3, terminal: true, leafletL: 0.011, leafletW: 0.007, profile: LEAF.ovate, order: t * 0.9, arch: 0.3,
      });
      if (k % 2 === 1) {
        flower(ctx, p.clone().add(v3(0, 0.012, 0)), v3(0, 1, 0), 0.006, rand() * 0.6);
        const organ: Organ = { part: PART.FRUIT, order: rand() * 0.6, color: spec.colors.fruit, color2: spec.colors.fruitRipe, pivot: p.clone() };
        b.ellipsoid(p.clone().add(v3(0.01, 0.005, 0)), v3(0.008, 0.006, 0.012), near ? 6 : 4, 3, organ);
      }
    }
  }
}

export { hangMorph };
