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

/** Black gram / green gram / cowpea: a leafy, erect bush of broad trifoliate leaves with pods in clusters. */
export function trifoliatePulse(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const variant = spec.variant ?? 'black_gram';
  const main = curvedPath(v3(0, 0, 0), v3((rand() - 0.5) * 0.1, 1, (rand() - 0.5) * 0.1), H * 0.72, 0.15, near ? 5 : 3);
  b.tube(main, (s) => 0.006 * (1 - 0.5 * s), 4, stemOrgan(ctx));
  const branches = near ? 5 : 3;
  const stems = [main];
  for (let i = 0; i < branches; i++) {
    const p = along(main, 0.1 + i * 0.13);
    const path = curvedPath(p, dirFrom(i * 2.4 + rand(), 0.75), H * (0.4 + rand() * 0.15), 0.3, near ? 4 : 2);
    b.tube(path, () => 0.0035, 3, stemOrgan(ctx));
    stems.push(path);
  }
  // Leaflets are broad (green gram 6–10 cm): the canopy closes over the row.
  const leafL = variant === 'cowpea' ? 0.1 : variant === 'green_gram' ? 0.085 : 0.075;
  stems.forEach((path, si) => {
    const nodes = si === 0 ? (near ? 7 : 4) : near ? 4 : 2;
    for (let k = 0; k < nodes; k++) {
      const t = 0.2 + (k / nodes) * 0.8;
      const p = along(path, t);
      const order = Math.min(0.95, t * 0.85 + si * 0.03);
      trifoliate(ctx, p, dirFrom(k * 2.4 + si + rand() * 0.5, 0.6), { petiole: 0.085, leafletL: leafL, leafletW: leafL * 0.72, order });
      if (k >= nodes - 2) {
        // Axillary raceme: flowers, then a cluster of pods.
        const peduncle = curvedPath(p, dirFrom(k * 2.4 + 1.2, 0.9), 0.05, 0.2, 2);
        const tip = peduncle[peduncle.length - 1]!;
        flower(ctx, tip, v3(0, 1, 0), 0.01, rand() * 0.6);
        const pods = variant === 'cowpea' ? 2 : 3 + Math.floor(rand() * 2);
        const podL = variant === 'cowpea' ? 0.18 : variant === 'green_gram' ? 0.085 : 0.05;
        for (let j = 0; j < pods; j++) {
          // Green/black gram pods splay upward-outward; cowpea pods hang.
          const elev = variant === 'cowpea' ? -0.9 : 0.4 - j * 0.25;
          pod(ctx, tip, dirFrom(j * 1.9 + rand(), elev), podL, variant === 'cowpea' ? 0.0045 : 0.0038, rand() * 0.6, variant === 'cowpea' ? 0.5 : 0.2);
        }
      }
    }
  });
}

/** Red gram: a tall, woody, densely leafy shrub with ascending branches; yellow flowers streaked red; flat pods. */
export function redGram(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const main = curvedPath(v3(0, 0, 0), v3(0, 1, 0), H * 0.94, 0.08, near ? 7 : 4);
  b.tube(main, (s) => 0.013 * (1 - 0.6 * s), 5, stemOrgan(ctx));
  const leafy = (path: THREE.Vector3[], count: number, yaw0: number, orderBase: number) => {
    for (let k = 0; k < count; k++) {
      const q = along(path, 0.18 + (k / count) * 0.82);
      trifoliate(ctx, q, dirFrom(yaw0 + k * 2.4 + rand() * 0.4, 0.55), {
        petiole: 0.04, leafletL: 0.092, leafletW: 0.036, profile: LEAF.lance, order: Math.min(0.95, orderBase + (k / count) * 0.15), light: true,
      });
    }
  };
  const branches = near ? 10 : 6;
  for (let i = 0; i < branches; i++) {
    const t = 0.18 + (i / branches) * 0.7;
    const p = along(main, t);
    const yaw = i * 2.4 + rand();
    // Branches ascend steeply, giving the broom-like pigeonpea outline.
    const path = curvedPath(p, dirFrom(yaw, 1.0 + rand() * 0.15), H * (0.5 - t * 0.3), 0.18, near ? 4 : 2);
    b.tube(path, (s) => 0.005 * (1 - 0.5 * s), 3, stemOrgan(ctx));
    leafy(path, near ? 8 : 3, yaw, t * 0.8);
    // Leafy side twigs make the dense, bushy crown.
    for (let w = 0; w < (near ? 2 : 1); w++) {
      const twig = curvedPath(along(path, 0.35 + w * 0.28), dirFrom(yaw + (w ? -1.1 : 1.1), 0.8), H * 0.16, 0.25, 2);
      b.tube(twig, () => 0.0025, 3, stemOrgan(ctx));
      leafy(twig, near ? 4 : 2, yaw + w, Math.min(0.9, t * 0.8 + 0.1));
    }
    const tip = path[path.length - 1]!;
    // Terminal racemes: yellow flowers with red-streaked standards, then clusters of flat pods.
    for (let k = 0; k < (near ? 4 : 2); k++) {
      const fp = tip.clone().add(v3((rand() - 0.5) * 0.07, (rand() - 0.3) * 0.07, (rand() - 0.5) * 0.07));
      flower(ctx, fp, dirFrom(rand() * 6.28, 0.6), 0.013, rand() * 0.7, k % 2 === 0 ? spec.colors.flower : spec.colors.head);
      pod(ctx, fp, dirFrom(rand() * 6.28, -0.5), 0.07, 0.0058, rand() * 0.6, 0.15);
    }
  }
  leafy(main, near ? 5 : 3, rand() * 6.28, 0.7);
}

/** Bengal gram: a low, much-branched bush of small feathery leaves with single inflated pods. */
export function bengalGram(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const shoot = (base: THREE.Vector3, yaw: number, elev: number, len: number, nodes: number, orderBase: number) => {
    const path = curvedPath(base, dirFrom(yaw, elev), len, -0.2, near ? 5 : 3);
    b.tube(path, (s) => 0.003 * (1 - 0.4 * s), 3, stemOrgan(ctx));
    for (let k = 0; k < nodes; k++) {
      const t = 0.12 + (k / nodes) * 0.88;
      const p = along(path, t);
      pinnateLeaf(ctx, p, dirFrom(yaw + (k % 2 ? 1.3 : -1.3), 0.45), {
        rachis: 0.06, pairs: near ? 5 : 2, terminal: true, leafletL: 0.021, leafletW: 0.013, profile: LEAF.ovate,
        order: Math.min(0.95, orderBase + t * 0.6), arch: 0.4, light: true,
      });
      if (k % 2 === 1) {
        flower(ctx, p.clone().add(v3(0, 0.012, 0)), v3(0, 1, 0), 0.007, rand() * 0.6);
        const organ: Organ = { part: PART.FRUIT, order: rand() * 0.6, color: spec.colors.fruit, color2: spec.colors.fruitRipe, pivot: p.clone() };
        b.ellipsoid(p.clone().add(v3(0.01, -0.004, 0)), v3(0.009, 0.007, 0.013), near ? 6 : 4, 3, organ);
      }
    }
    return path;
  };
  const branches = near ? 6 : 4;
  for (let i = 0; i < branches; i++) {
    const yaw = (i / branches) * Math.PI * 2 + rand() * 0.4;
    const path = shoot(v3(0, 0, 0), yaw, 0.85 + rand() * 0.4, H * (0.75 + rand() * 0.2), near ? 5 : 3, 0.1);
    // Secondary branches fill the bush out.
    if (near || i % 2 === 0) shoot(along(path, 0.35), yaw + (rand() > 0.5 ? 0.9 : -0.9), 0.8, H * 0.45, near ? 3 : 2, 0.3);
  }
}

export { hangMorph };
