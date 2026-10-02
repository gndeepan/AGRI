import * as THREE from 'three';
import {
  LEAF, PART, along, bellFlower, curvedPath, dirFrom, flower, hangMorph, leafOrgan, palmateLeaf, pinnateLeaf, stemOrgan, tangentAt, v3, type Ctx, type Organ,
} from './common';

const fruitOrgan = (ctx: Ctx, pivot: THREE.Vector3, order: number, morph?: Organ['morph']): Organ => ({
  part: PART.FRUIT, order, color: ctx.spec.colors.fruit, color2: ctx.spec.colors.fruitRipe, pivot: pivot.clone(), morph,
});

/**
 * Sesame: an erect stem with a few ascending branches, opposite leaves (broad below, lance
 * above), white-pink bell flowers in the axils and upright four-sided capsules held close to the stem.
 */
export function sesame(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const axis = (base: THREE.Vector3, dir: THREE.Vector3, len: number, nodes: number, fruitFrom: number, orderBase: number, yaw0: number) => {
    const stem = curvedPath(base, dir, len, 0.06, near ? 7 : 4);
    b.tube(stem, (s) => 0.0075 * (len / H) * (1 - 0.5 * s) + 0.002, 4, stemOrgan(ctx));
    for (let k = 0; k < nodes; k++) {
      const t = 0.08 + (k / nodes) * 0.88;
      const p = along(stem, t);
      const up = tangentAt(stem, t);
      for (const sideYaw of [0, Math.PI]) {
        const yaw = yaw0 + k * 1.57 + sideYaw;
        const order = Math.min(0.95, orderBase + t * (1 - orderBase) * 0.92);
        b.leaf(p, dirFrom(yaw, 0.3), leafOrgan(ctx, p, order), {
          length: 0.16 * (1.1 - t * 0.5), width: 0.075 * (1.05 - t * 0.65), profile: t < 0.4 ? LEAF.ovate : LEAF.lance,
          segs: near ? 5 : 2, arch: 0.9, across: near ? 5 : 3, curl: 0.06,
        });
        if (t > fruitFrom) {
          const fo = (t - fruitFrom) / (1 - fruitFrom) * 0.85;
          const axil = p.clone().addScaledVector(dirFrom(yaw + 0.5, 0), 0.012);
          // Bell hangs outward and slightly down; the capsule that follows stands upright against the stem.
          bellFlower(ctx, axil, dirFrom(yaw + 0.5, -0.15), 0.03, 0.0085, fo);
          const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), up.clone().add(dirFrom(yaw + 0.5, 0).multiplyScalar(0.25)).normalize());
          b.ellipsoid(axil.clone().addScaledVector(up, 0.02), v3(0.007, 0.019, 0.007), near ? 5 : 4, 3, fruitOrgan(ctx, axil, fo), q);
        }
      }
    }
    return stem;
  };
  const yaw0 = rand() * 6.28;
  const main = axis(v3(0, 0, 0), v3((rand() - 0.5) * 0.05, 1, (rand() - 0.5) * 0.05), H, near ? 11 : 5, 0.38, 0, yaw0);
  const branches = near ? 3 : 2;
  for (let i = 0; i < branches; i++) {
    const t = 0.14 + i * 0.09;
    axis(along(main, t), dirFrom(yaw0 + i * 2.2 + 0.8, 1.05), H * (0.62 - i * 0.06), near ? 6 : 3, 0.45, 0.2, yaw0 + i);
  }
}

/** Sunflower: a stout stem, large heart-shaped leaves, and a big east-facing head that nods when ripe. */
export function sunflower(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3(0, 1, 0), H * 0.95, 0.05, near ? 8 : 4);
  b.tube(stem, (s) => 0.016 * (1 - 0.35 * s), near ? 6 : 4, stemOrgan(ctx));
  const nodes = near ? 12 : 6;
  for (let k = 0; k < nodes; k++) {
    const t = 0.06 + (k / nodes) * 0.86;
    const p = along(stem, t);
    const yaw = k * 2.4 + rand() * 0.3;
    const petiole = curvedPath(p, dirFrom(yaw, 0.6), 0.08, 0.4, 2);
    b.tube(petiole, () => 0.003, 3, leafOrgan(ctx, p, t * 0.9));
    b.leaf(petiole[petiole.length - 1]!, dirFrom(yaw, 0.1), leafOrgan(ctx, p, t * 0.9), {
      length: 0.24 * (1.15 - t * 0.55), width: 0.2 * (1.15 - t * 0.55), profile: LEAF.heart, segs: near ? 5 : 3, arch: 0.9, across: near ? 5 : 3, curl: 0.1,
    });
  }
  // Head faces east (+x); at maturity the back turns yellow and the head hangs.
  const top = stem[stem.length - 1]!;
  const face = v3(1, 0.35, 0).normalize();
  const morph = hangMorph(top, v3(1, 0, 0), 1.0);
  const center = top.clone().addScaledVector(face, 0.05);
  const disc: Organ = { part: PART.HEAD, order: 0, color: spec.colors.head, color2: spec.colors.headRipe, pivot: top.clone(), morph };
  b.disc(center, face, 0.11, near ? 18 : 10, disc);
  b.disc(center.clone().addScaledVector(face, -0.012), face.clone().negate(), 0.115, near ? 14 : 8, { ...disc, color: spec.colors.stem, color2: spec.colors.stemRipe });
  const rays = near ? 28 : 14;
  // Ray petals open with the head and only fall once seeds are filling.
  const petal: Organ = { part: PART.FLOWER, order: 0.6, color: spec.colors.flower, pivot: center.clone(), morph };
  const a = face.clone().cross(v3(0, 1, 0)).normalize();
  const c = face.clone().cross(a).normalize();
  for (let k = 0; k < rays; k++) {
    const t = (k / rays) * Math.PI * 2;
    const dir = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(c, Math.sin(t)).addScaledVector(face, -0.1).normalize();
    b.leaf(center.clone().addScaledVector(dir, 0.095), dir, petal, { length: 0.075, width: 0.034, profile: LEAF.ovate, segs: 2, arch: 0.25 });
  }
}

/** Castor: thick reddish stem, very large palmate leaves on long petioles, erect spikes of spiny capsules. */
export function castor(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const raceme = (top: THREE.Vector3, dir: THREE.Vector3, len: number, orderBase: number) => {
    const head: Organ = { part: PART.HEAD, order: orderBase, color: spec.colors.stem, color2: spec.colors.stemRipe, pivot: top.clone() };
    const axis = curvedPath(top, dir, len, 0.08, 3);
    b.tube(axis, (s) => 0.006 * (1 - 0.4 * s), 3, head);
    const caps = near ? 18 : 8;
    for (let k = 0; k < caps; k++) {
      const t = 0.15 + (k / caps) * 0.83;
      const p = along(axis, t);
      const o = fruitOrgan(ctx, p, Math.min(0.9, orderBase + rand() * 0.25));
      // Capsules crowd round the axis; soft spines are suggested by the faceted, low-poly sphere.
      b.ellipsoid(p.clone().addScaledVector(dirFrom(k * 2.4, 0.1), 0.024 * (1.15 - t * 0.5)), v3(0.015, 0.016, 0.015), near ? 6 : 4, near ? 4 : 3, o);
    }
  };
  const leaves = (stem: THREE.Vector3[], nodes: number, from: number, yaw0: number, orderBase: number, size: number) => {
    for (let k = 0; k < nodes; k++) {
      const t = from + (k / nodes) * (0.95 - from);
      const p = along(stem, t);
      palmateLeaf(ctx, p, dirFrom(yaw0 + k * 2.4 + rand() * 0.3, 0.7), {
        petiole: 0.3 * size * (1.1 - t * 0.35), lobes: near ? 7 : 5, lobeL: 0.23 * size * (1.1 - t * 0.3), lobeW: 0.085 * size, spread: 4.3,
        order: Math.min(0.95, orderBase + t * 0.6), petioleColor: spec.colors.stem, petioleR: 0.005, tilt: 0.75, web: 0.4, droop: 0.5, profile: LEAF.oblance,
      });
    }
  };
  const stem = curvedPath(v3(0, 0, 0), v3(0, 1, 0), H * 0.78, 0.08, near ? 7 : 4);
  b.tube(stem, (s) => 0.022 * (1 - 0.5 * s), near ? 6 : 4, stemOrgan(ctx), (s) => (((s * 10) % 1) < 0.1 ? 0.8 : 1));
  const yaw0 = rand() * 6.28;
  leaves(stem, near ? 8 : 4, 0.18, yaw0, 0.05, 1);
  raceme(stem[stem.length - 1]!, v3(0, 1, 0), 0.34, 0);
  // Sympodial branches below the first spike, each ending in its own (later) spike.
  const branches = near ? 2 : 1;
  for (let i = 0; i < branches; i++) {
    const p = along(stem, 0.62 + i * 0.14);
    const path = curvedPath(p, dirFrom(yaw0 + i * 2.6 + 1, 0.95), H * 0.36, 0.2, near ? 4 : 2);
    b.tube(path, (s) => 0.012 * (1 - 0.4 * s), 4, stemOrgan(ctx));
    leaves(path, near ? 3 : 2, 0.3, yaw0 + i, 0.5, 0.8);
    raceme(path[path.length - 1]!, tangentAt(path, 1).add(v3(0, 0.6, 0)).normalize(), 0.26, 0.3 + i * 0.15);
  }
}

/** Cotton: branching shrub with lobed leaves, cream flowers, green bolls bursting into white lint. */
export function cotton(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3(0, 1, 0), H * 0.95, 0.05, near ? 7 : 4);
  b.tube(stem, (s) => 0.012 * (1 - 0.55 * s), 5, stemOrgan(ctx));
  const branches = near ? 9 : 5;
  for (let i = 0; i < branches; i++) {
    const t = 0.18 + (i / branches) * 0.75;
    const p = along(stem, t);
    const yaw = i * 2.4 + rand() * 0.4;
    const path = curvedPath(p, dirFrom(yaw, 0.55), (0.38 - t * 0.25) * (H / 1.3), 0.4, near ? 4 : 2);
    b.tube(path, () => 0.004, 3, stemOrgan(ctx));
    const leaves = near ? 3 : 2;
    for (let k = 0; k < leaves; k++) {
      const q = along(path, 0.3 + (k / leaves) * 0.7);
      palmateLeaf(ctx, q, dirFrom(yaw + (k % 2 ? 1 : -1), 0.7), { petiole: 0.06, lobes: 3, lobeL: 0.08, lobeW: 0.055, spread: 1.6, order: t * 0.9, profile: LEAF.ovate });
    }
    // Fruiting positions along the sympodial branch: flower → boll → open boll.
    for (let k = 0; k < (near ? 3 : 2); k++) {
      const q = along(path, 0.35 + k * 0.3).add(v3(0, 0.01, 0));
      const order = Math.min(0.95, t * 0.7 + k * 0.1);
      flower(ctx, q.clone().add(v3(0, 0.02, 0)), v3(0, 1, 0), 0.025, order, spec.colors.flower, 5);
      // The boll swells (ripe swell) as lint bursts out white.
      b.ellipsoid(q.clone().add(v3(0, 0.02, 0)), v3(0.018, 0.022, 0.018), near ? 8 : 5, near ? 6 : 3, fruitOrgan(ctx, q, order));
    }
  }
}

/** Tomato: plants trained on a short stake, compound leaves, yellow flowers, fruit clusters ripening red. */
export function tomato(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  // Bamboo stake (TN farmers stake tomato for the main season).
  b.tube([v3(0.05, 0, 0.0), v3(0.05, H * 1.05, 0)], () => 0.007, 4, { part: PART.STEM, order: 0, color: [0.62, 0.52, 0.36], pivot: v3(0, 0, 0) });
  const stems = near ? 3 : 2;
  for (let s = 0; s < stems; s++) {
    const yaw = s * 2.1 + rand();
    const stem = curvedPath(v3(0, 0, 0), v3(Math.cos(yaw) * 0.15, 1, Math.sin(yaw) * 0.15), H * (s === 0 ? 0.95 : 0.7), 0.35, near ? 6 : 3);
    b.tube(stem, (t) => 0.007 * (1 - 0.5 * t), 4, stemOrgan(ctx));
    const nodes = near ? 6 : 3;
    for (let k = 0; k < nodes; k++) {
      const t = 0.12 + (k / nodes) * 0.85;
      const p = along(stem, t);
      pinnateLeaf(ctx, p, dirFrom(yaw + k * 2.4, 0.3), { rachis: 0.2, pairs: near ? 3 : 2, terminal: true, leafletL: 0.07, leafletW: 0.045, profile: LEAF.ovate, order: t * 0.9, arch: 0.9 });
      if (k % 2 === 1 && k < nodes - 1) {
        // Truss: flowers, then 2–3 fruits hanging.
        const truss = curvedPath(p, dirFrom(yaw + k * 2.4 + 1.5, -0.2), 0.06, 0.6, 2);
        const tip = truss[truss.length - 1]!;
        const order = Math.min(0.9, t * 0.8);
        flower(ctx, tip.clone().add(v3(0, 0.01, 0)), v3(0, -0.3, 1), 0.012, order, spec.colors.flower, 5);
        const n = near ? 3 : 2;
        for (let j = 0; j < n; j++) {
          const fp = tip.clone().add(v3((rand() - 0.5) * 0.06, -0.02 - rand() * 0.04, (rand() - 0.5) * 0.06));
          b.ellipsoid(fp, v3(0.022, 0.019, 0.022), near ? 9 : 5, near ? 6 : 4, fruitOrgan(ctx, tip, order + j * 0.03));
        }
      }
    }
  }
}

/** Brinjal: a bushy, forking plant with large soft leaves, purple star flowers and glossy oval fruits. */
export function brinjal(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const trunk = curvedPath(v3(0, 0, 0), v3((rand() - 0.5) * 0.08, 1, (rand() - 0.5) * 0.08), H * 0.3, 0.05, 3);
  b.tube(trunk, () => 0.011, 5, stemOrgan(ctx));
  const fork = trunk[trunk.length - 1]!;
  let fruits = 0;
  const limb = (base: THREE.Vector3, yaw: number, elev: number, len: number, nodes: number, orderBase: number) => {
    const path = curvedPath(base, dirFrom(yaw, elev), len, 0.35, near ? 5 : 3);
    b.tube(path, (t) => 0.007 * (1 - 0.5 * t), 4, stemOrgan(ctx));
    for (let k = 0; k < nodes; k++) {
      const t = 0.12 + (k / nodes) * 0.88;
      const p = along(path, t);
      const ly = yaw + k * 2.3 + rand() * 0.4;
      const order = Math.min(0.92, orderBase + t * 0.5);
      // Big, slightly wavy leaves held out on short petioles.
      const pet = curvedPath(p, dirFrom(ly, 0.6), 0.05, 0.3, 2);
      b.tube(pet, () => 0.003, 3, leafOrgan(ctx, p, order));
      b.leaf(pet[pet.length - 1]!, dirFrom(ly, 0.25), leafOrgan(ctx, p, order), {
        length: 0.19 * (1.1 - t * 0.3), width: 0.135 * (1.1 - t * 0.3), profile: LEAF.ovate, segs: near ? 5 : 3, arch: 0.95, curl: 0.1, across: near ? 5 : 3,
      });
      // A flower, then a fruit, at every other node — a handful per plant, as in the field.
      if (k % 2 === 1 && fruits < (near ? 7 : 4)) {
        fruits++;
        const q = p.clone().addScaledVector(dirFrom(ly + 1.5, -0.2), 0.035);
        const fo = Math.min(0.9, orderBase * 0.6 + t * 0.6);
        flower(ctx, q, dirFrom(ly + 1.5, -0.5), 0.02, fo, spec.colors.flower, 5, [0.95, 0.78, 0.15]);
        const dir = dirFrom(ly + 1.5, -1.3);
        const o = fruitOrgan(ctx, q, fo);
        const centre = q.clone().addScaledVector(dir, 0.058);
        b.ellipsoid(centre, v3(0.03, 0.052, 0.03), near ? 9 : 5, near ? 6 : 3, o, new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir));
        // Green spiny calyx capping the fruit.
        b.ellipsoid(q.clone().addScaledVector(dir, 0.012), v3(0.022, 0.012, 0.022), 5, 3, { ...o, color: [0.36, 0.48, 0.26], color2: [0.36, 0.48, 0.26] });
      }
    }
    return path;
  };
  const limbs = near ? 4 : 3;
  for (let s = 0; s < limbs; s++) {
    const yaw = (s / limbs) * Math.PI * 2 + rand();
    const path = limb(fork, yaw, 1.0, H * (0.62 + rand() * 0.12), near ? 5 : 3, 0.1);
    if (near) limb(along(path, 0.5), yaw + (s % 2 ? 1 : -1), 0.85, H * 0.36, 3, 0.4);
  }
  // A few leaves on the trunk hide the bare fork.
  for (let k = 0; k < (near ? 3 : 2); k++) {
    const p = along(trunk, 0.4 + k * 0.25);
    b.leaf(p, dirFrom(k * 2.4 + rand(), 0.3), leafOrgan(ctx, p, 0.05 + k * 0.05), { length: 0.17, width: 0.12, profile: LEAF.ovate, segs: near ? 4 : 2, arch: 0.9, curl: 0.08, across: near ? 5 : 3 });
  }
}

/** Chilli: a dense, repeatedly forking bush of glossy lance leaves; white flowers; slender pods hanging green → red. */
export function chilli(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3((rand() - 0.5) * 0.06, 1, (rand() - 0.5) * 0.06), H * 0.34, 0.05, 3);
  b.tube(stem, () => 0.008, 4, stemOrgan(ctx));
  const twig = (base: THREE.Vector3, yaw: number, elev: number, len: number, depth: number, orderBase: number) => {
    const path = curvedPath(base, dirFrom(yaw, elev), len, 0.3, near ? 3 : 2);
    b.tube(path, () => 0.0045 - depth * 0.001, 3, stemOrgan(ctx));
    const nodes = near ? 4 : 2;
    for (let k = 0; k < nodes; k++) {
      const t = 0.2 + (k / nodes) * 0.8;
      const p = along(path, t);
      const order = Math.min(0.92, orderBase + t * 0.25);
      for (const off of near ? [0, 2.1, 4.2] : [0, 2.6]) {
        b.leaf(p, dirFrom(yaw + k * 2.4 + off + rand() * 0.6, 0.35 + rand() * 0.5), leafOrgan(ctx, p, order), {
          length: 0.075 + rand() * 0.025, width: 0.04, profile: LEAF.lance, segs: near ? 3 : 2, arch: 0.9 + rand() * 0.5, twist: (rand() - 0.5) * 0.8,
        });
      }
      // Pods hang singly from most nodes; the outer twigs carry the most.
      if (k % 2 === 1 || depth > 0) {
        flower(ctx, p.clone().add(v3(0, 0.004, 0)), v3(0, -1, 0.3), 0.009, order, spec.colors.flower, 5);
        const dir = dirFrom(yaw + k * 2.4 + 0.8, -1.35);
        b.tube(curvedPath(p, dir, 0.075 + rand() * 0.02, 0.35, near ? 4 : 2), (u) => 0.0068 * (1 - 0.8 * u), near ? 5 : 3, fruitOrgan(ctx, p, order));
      }
    }
    // Chilli branches fork in twos.
    if (depth < (near ? 2 : 1)) {
      const tip = path[path.length - 1]!;
      for (const sgn of [-1, 1]) twig(tip, yaw + sgn * (0.6 + rand() * 0.6), elev - 0.25 + rand() * 0.35, len * (0.55 + rand() * 0.35), depth + 1, orderBase + 0.25);
    }
  };
  const fork = stem[stem.length - 1]!;
  const limbs = near ? 3 : 2;
  for (let s = 0; s < limbs; s++) twig(fork, (s / limbs) * Math.PI * 2 + rand(), 0.85 + rand() * 0.35, H * (0.26 + rand() * 0.1), 0, 0.2);
  for (let k = 0; k < 3; k++) {
    const p = along(stem, 0.35 + k * 0.25);
    b.leaf(p, dirFrom(k * 2.4 + rand(), 0.3), leafOrgan(ctx, p, 0.05 + k * 0.05), { length: 0.09, width: 0.042, profile: LEAF.lance, segs: near ? 4 : 2, arch: 0.6 });
  }
}

/** Bhendi: a tall single stem, broad lobed leaves on long petioles, yellow hibiscus flowers with a crimson eye, upright ridged pods. */
export function bhendi(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3((rand() - 0.5) * 0.05, 1, 0), H * 0.92, 0.05, near ? 7 : 4);
  b.tube(stem, (s) => 0.012 * (1 - 0.5 * s), 5, stemOrgan(ctx));
  const nodes = near ? 11 : 6;
  const yaw0 = rand() * 6.28;
  for (let k = 0; k < nodes; k++) {
    const t = 0.08 + (k / nodes) * 0.88;
    const p = along(stem, t);
    const yaw = yaw0 + k * 2.4;
    palmateLeaf(ctx, p, dirFrom(yaw, 0.65), {
      petiole: 0.2 * (1.1 - t * 0.45), lobes: 5, lobeL: 0.15 * (1.1 - t * 0.35), lobeW: 0.075 * (1.1 - t * 0.3), spread: 2.5,
      order: t * 0.9, profile: LEAF.lance, tilt: 0.6, web: 0.45, droop: 0.5, petioleR: 0.0035,
    });
    if (t > 0.3) {
      const q = p.clone().addScaledVector(dirFrom(yaw + 1.2, 0), 0.02);
      const order = (t - 0.3) * 1.3;
      // Only the top few nodes carry open flowers; below them the pods stand upright.
      flower(ctx, q.clone().addScaledVector(dirFrom(yaw + 1.2, 0.6), 0.04), dirFrom(yaw + 1.2, 0.5), 0.04, order, spec.colors.flower, 5, [0.5, 0.06, 0.12]);
      b.tube(curvedPath(q, dirFrom(yaw + 1.2, 1.25), 0.13, 0.1, near ? 4 : 3), (u) => 0.011 * (u < 0.15 ? 0.6 + u * 2.7 : 1 - 0.85 * ((u - 0.15) / 0.85)), 5, fruitOrgan(ctx, q, order), (u) => 0.9 + 0.1 * u);
    }
  }
}

/** Small onion: a clump of bulbs with full tufts of tubular leaves that fall over and dry at maturity. */
export function onion(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const bulbs = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < bulbs; i++) {
    const yaw = (i / bulbs) * Math.PI * 2 + rand() * 0.5;
    // Aggregatum bulbs sit half out of the soil, pinkish-red and glossy.
    const c = v3(Math.cos(yaw) * 0.02, 0.013, Math.sin(yaw) * 0.02);
    b.ellipsoid(c, v3(0.017, 0.02, 0.017), near ? 8 : 5, near ? 6 : 3, fruitOrgan(ctx, c, rand() * 0.4));
    const leaves = near ? 4 : 3;
    for (let k = 0; k < leaves; k++) {
      const base = c.clone().add(v3(0, 0.014, 0));
      const dir = dirFrom(yaw + (k - (leaves - 1) / 2) * 0.55, 1.4 - Math.abs(k - (leaves - 1) / 2) * 0.14);
      const fall = hangMorph(base, dirFrom(yaw, 0), 1.25);
      const organ = leafOrgan(ctx, base, (i + k) / (bulbs * leaves) * 0.6, fall);
      b.tube(curvedPath(base, dir, H * (0.75 + rand() * 0.25), 0.4, near ? 6 : 3), (s) => 0.005 * (1 - 0.75 * s), near ? 5 : 3, organ);
    }
  }
}

/** Turmeric: clumps of large, upright canna-like leaves on long sheathing petioles; they yellow and dry at harvest. */
export function turmeric(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  // Two or three tillers per clump, each a fan of leaves.
  const shoots = near ? 3 : 2;
  for (let sIdx = 0; sIdx < shoots; sIdx++) {
    const sy = (sIdx / shoots) * Math.PI * 2 + rand();
    const origin = v3(Math.cos(sy) * 0.035, 0, Math.sin(sy) * 0.035);
    const leaves = near ? 4 : 3;
    for (let k = 0; k < leaves; k++) {
      const yaw = sy + k * 2.4 + rand() * 0.4;
      const sheath = curvedPath(origin, dirFrom(yaw, 1.38), H * (0.36 + rand() * 0.08), 0.12, 2);
      const order = ((sIdx * leaves + k) / (shoots * leaves)) * 0.9;
      b.tube(sheath, () => 0.008, 4, leafOrgan(ctx, origin, order));
      b.leaf(sheath[sheath.length - 1]!, dirFrom(yaw, 1.15), leafOrgan(ctx, origin, order), {
        length: H * (0.58 + rand() * 0.12), width: 0.15, profile: LEAF.lance, segs: near ? 7 : 3, arch: 1.1 + rand() * 0.3, curl: 0.07, across: near ? 5 : 3,
        twist: (rand() - 0.5) * 0.4,
      });
    }
  }
}

/** Tapioca: knobbly woody stems that fork near the top, carrying a canopy of drooping, deeply lobed leaves on long red petioles. */
export function tapioca(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const foliage = (stem: THREE.Vector3[], nodes: number, from: number, yaw0: number, orderBase: number) => {
    for (let k = 0; k < nodes; k++) {
      const t = from + (k / nodes) * (1 - from);
      const p = along(stem, t);
      palmateLeaf(ctx, p, dirFrom(yaw0 + k * 2.4 + rand() * 0.3, 0.55), {
        petiole: 0.26, lobes: near ? 7 : 5, lobeL: 0.17, lobeW: 0.058, spread: 3.7, order: Math.min(0.95, orderBase + (k / nodes) * 0.45),
        petioleColor: [0.62, 0.22, 0.2], petioleR: 0.0035, tilt: 0.85, web: 0.12, droop: 0.9, profile: LEAF.oblance,
      });
    }
  };
  const stems = 2 + Math.floor(rand() * 2);
  for (let s = 0; s < stems; s++) {
    const yaw = (s / stems) * Math.PI * 2 + rand();
    const stem = curvedPath(v3(Math.cos(yaw) * 0.03, 0, Math.sin(yaw) * 0.03), v3(Math.cos(yaw) * 0.07, 1, Math.sin(yaw) * 0.07), H * (0.66 + rand() * 0.1), 0.1, near ? 8 : 4);
    // Leaf scars ring the grey-brown stem where lower leaves were shed.
    b.tube(stem, (t) => 0.016 * (1 - 0.35 * t), near ? 6 : 5, stemOrgan(ctx), (t) => (((t * 22) % 1) < 0.18 ? 0.74 : 1));
    foliage(stem, near ? 6 : 3, 0.6, yaw, 0.1);
    // The stem forks into two or three; the forks carry most of the canopy.
    const top = stem[stem.length - 1]!;
    const forks = near ? 3 : 2;
    for (let f = 0; f < forks; f++) {
      const fy = yaw + (f / forks) * Math.PI * 2 + rand() * 0.5;
      const fork = curvedPath(top, dirFrom(fy, 1.0), H * (0.24 + rand() * 0.06), 0.25, near ? 4 : 2);
      b.tube(fork, (t) => 0.01 * (1 - 0.4 * t), 4, stemOrgan(ctx), (t) => (((t * 8) % 1) < 0.18 ? 0.78 : 1));
      foliage(fork, near ? 6 : 3, 0.25, fy, 0.45);
    }
  }
}

/** Banana: tall pseudostem, huge torn arching leaves, a hanging bunch with a purple bell. */
export function banana(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3((rand() - 0.5) * 0.06, 1, (rand() - 0.5) * 0.06), H * 0.62, 0.04, near ? 6 : 3);
  b.tube(stem, (s) => 0.11 * (1 - 0.3 * s), near ? 10 : 6, stemOrgan(ctx), (s) => 0.85 + 0.25 * Math.abs(Math.sin(s * 30)));
  const top = stem[stem.length - 1]!;
  const leaves = near ? 9 : 6;
  for (let k = 0; k < leaves; k++) {
    const yaw = k * 2.4 + rand() * 0.3;
    const f = k / leaves;
    // Petiole + midrib arch; younger leaves (higher order) stand more upright.
    const petiole = curvedPath(top, dirFrom(yaw, 1.25 - (1 - f) * 0.35), 0.35, 0.4, 2);
    const order = f * 0.9;
    b.tube(petiole, () => 0.018, 4, leafOrgan(ctx, top, order));
    b.leaf(petiole[petiole.length - 1]!, tangentAt(petiole, 1), leafOrgan(ctx, top, order), {
      length: 1.6 + rand() * 0.4, width: 0.55, profile: LEAF.oblong, segs: near ? 9 : 4, arch: 1.5 + (1 - f) * 0.6, across: 5, curl: 0.03,
      tear: near ? 0.45 : 0.2, rand,
    });
  }
  // Bunch: a stalk curving out and down, hands of fingers, and the purple male bell at the end.
  const stalk = curvedPath(top, dirFrom(rand() * 6.28, 0.6), 0.9, 2.4, near ? 7 : 4);
  b.tube(stalk, () => 0.018, 4, { part: PART.HEAD, order: 0, color: spec.colors.stem, color2: spec.colors.stem, pivot: top.clone() });
  const hands = near ? 7 : 4;
  for (let h = 0; h < hands; h++) {
    const t = 0.32 + (h / hands) * 0.45;
    const p = along(stalk, t);
    const fingers = near ? 10 : 6;
    for (let k = 0; k < fingers; k++) {
      const yaw = (k / fingers) * Math.PI * 1.6 + h * 0.6;
      const d = dirFrom(yaw, 0.9);
      const o = fruitOrgan(ctx, p, h / hands * 0.5);
      b.tube(curvedPath(p.clone().addScaledVector(d, 0.03), d, 0.15, -0.7, near ? 4 : 2), (s) => 0.017 * Math.sin(Math.PI * Math.min(1, 0.12 + s * 0.88)), near ? 5 : 4, o);
    }
  }
  const bell = stalk[stalk.length - 1]!;
  b.ellipsoid(bell.clone().add(v3(0, -0.08, 0)), v3(0.05, 0.11, 0.05), near ? 8 : 5, near ? 6 : 4, { part: PART.HEAD, order: 0, color: spec.colors.head, color2: spec.colors.headRipe, pivot: bell.clone() });
}
