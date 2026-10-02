import * as THREE from 'three';
import {
  LEAF, PART, along, curvedPath, dirFrom, flower, hangMorph, leafOrgan, palmateLeaf, pinnateLeaf, stemOrgan, tangentAt, v3, type Ctx, type Organ,
} from './common';

const fruitOrgan = (ctx: Ctx, pivot: THREE.Vector3, order: number, morph?: Organ['morph']): Organ => ({
  part: PART.FRUIT, order, color: ctx.spec.colors.fruit, color2: ctx.spec.colors.fruitRipe, pivot: pivot.clone(), morph,
});

/** Sesame: one erect stem, opposite lance leaves, tubular white-pink flowers then upright capsules. */
export function sesame(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3((rand() - 0.5) * 0.05, 1, (rand() - 0.5) * 0.05), H, 0.06, near ? 8 : 4);
  b.tube(stem, (s) => 0.007 * (1 - 0.5 * s), 4, stemOrgan(ctx));
  const nodes = near ? 9 : 5;
  for (let k = 0; k < nodes; k++) {
    const t = 0.08 + (k / nodes) * 0.88;
    const p = along(stem, t);
    for (const side of [0, Math.PI]) {
      const yaw = k * 1.57 + side;
      b.leaf(p, dirFrom(yaw, 0.35), leafOrgan(ctx, p, t * 0.92), { length: 0.11 * (1.1 - t * 0.5), width: 0.035, profile: LEAF.lance, segs: near ? 4 : 2, arch: 0.6, across: near ? 5 : 3, curl: 0.05 });
      if (t > 0.45) {
        const fp = p.clone().addScaledVector(dirFrom(yaw + 0.8, 0.6), 0.02);
        flower(ctx, fp, dirFrom(yaw + 0.8, -0.2), 0.012, (t - 0.45) * 1.6, spec.colors.flower, 5);
        const capsule = fruitOrgan(ctx, fp, (t - 0.45) * 1.6);
        b.ellipsoid(fp.clone().add(v3(0, 0.02, 0)), v3(0.007, 0.022, 0.007), near ? 6 : 4, 3, capsule);
      }
    }
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

/** Castor: thick reddish stem, big palmate leaves, red spiny capsule spikes on top. */
export function castor(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3(0, 1, 0), H * 0.85, 0.1, near ? 7 : 4);
  b.tube(stem, (s) => 0.02 * (1 - 0.5 * s), near ? 6 : 4, stemOrgan(ctx));
  const nodes = near ? 8 : 5;
  for (let k = 0; k < nodes; k++) {
    const t = 0.12 + (k / nodes) * 0.82;
    const p = along(stem, t);
    palmateLeaf(ctx, p, dirFrom(k * 2.4 + rand() * 0.3, 0.75), {
      petiole: 0.28 * (1.1 - t * 0.4), lobes: near ? 7 : 5, lobeL: 0.2 * (1.15 - t * 0.4), lobeW: 0.07, spread: 4.6, order: t * 0.9,
      petioleColor: spec.colors.stem,
    });
  }
  // Two or three racemes of spiny capsules.
  const top = stem[stem.length - 1]!;
  for (let r = 0; r < 3; r++) {
    const axis = curvedPath(top, dirFrom(r * 2.1 + rand(), r === 0 ? 1.45 : 1.0), 0.28, 0.1, 3);
    b.tube(axis, () => 0.005, 3, stemOrgan(ctx));
    const caps = near ? 9 : 4;
    for (let k = 0; k < caps; k++) {
      const p = along(axis, 0.2 + (k / caps) * 0.78);
      const o = fruitOrgan(ctx, p, r * 0.25 + rand() * 0.2);
      b.ellipsoid(p.clone().addScaledVector(dirFrom(k * 2.4, 0), 0.018), v3(0.014, 0.014, 0.014), near ? 6 : 4, near ? 4 : 3, o);
    }
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

/** Brinjal: bushy, large soft leaves, purple flowers, long glossy fruits hanging. */
export function brinjal(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const branches = near ? 4 : 3;
  for (let s = 0; s < branches; s++) {
    const yaw = (s / branches) * Math.PI * 2 + rand();
    const stem = curvedPath(v3(0, 0, 0), dirFrom(yaw, 1.15), H * (0.8 + rand() * 0.15), 0.2, near ? 5 : 3);
    b.tube(stem, (t) => 0.009 * (1 - 0.5 * t), 4, stemOrgan(ctx));
    const nodes = near ? 5 : 3;
    for (let k = 0; k < nodes; k++) {
      const t = 0.15 + (k / nodes) * 0.85;
      const p = along(stem, t);
      b.leaf(p, dirFrom(yaw + k * 2.2, 0.35), leafOrgan(ctx, p, t * 0.9), { length: 0.17, width: 0.11, profile: LEAF.ovate, segs: near ? 5 : 3, arch: 0.8, curl: 0.08, across: near ? 5 : 3 });
      if (k >= 1) {
        const q = p.clone().addScaledVector(dirFrom(yaw + k * 2.2 + 1.4, 0), 0.03);
        const order = Math.min(0.9, t * 0.8);
        flower(ctx, q, v3(0, -0.6, 1), 0.016, order, spec.colors.flower, 5);
        const dir = dirFrom(yaw + k * 2.2 + 1.4, -1.25);
        // Long purple fruit with a green calyx cap.
        const o = fruitOrgan(ctx, q, order);
        const center = q.clone().addScaledVector(dir, 0.08);
        b.ellipsoid(center, v3(0.025, 0.08, 0.025), near ? 9 : 5, near ? 6 : 3, o, new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir));
        b.ellipsoid(q.clone().addScaledVector(dir, 0.012), v3(0.02, 0.012, 0.02), 5, 3, { ...o, color: [0.36, 0.48, 0.26], color2: [0.36, 0.48, 0.26] });
      }
    }
  }
}

/** Chilli: compact bush, small glossy leaves, white flowers, slender pods hanging green → red. */
export function chilli(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3(0, 1, 0), H * 0.4, 0.05, 3);
  b.tube(stem, () => 0.007, 4, stemOrgan(ctx));
  const fork = stem[stem.length - 1]!;
  const branches = near ? 5 : 3;
  for (let s = 0; s < branches; s++) {
    const yaw = (s / branches) * Math.PI * 2 + rand();
    const path = curvedPath(fork, dirFrom(yaw, 0.9), H * 0.55, 0.3, near ? 4 : 2);
    b.tube(path, () => 0.004, 3, stemOrgan(ctx));
    const nodes = near ? 5 : 3;
    for (let k = 0; k < nodes; k++) {
      const t = 0.15 + (k / nodes) * 0.85;
      const p = along(path, t);
      const order = Math.min(0.9, 0.3 + t * 0.6);
      // Chilli is a dense bush: two leaves per node.
      for (const off of [0, 2.6]) {
        b.leaf(p, dirFrom(yaw + k * 2.4 + off, 0.3), leafOrgan(ctx, p, order), { length: 0.085, width: 0.036, profile: LEAF.lance, segs: near ? 4 : 2, arch: 0.5, across: near ? 5 : 3, curl: 0.05 });
      }
      flower(ctx, p.clone().add(v3(0, 0.005, 0)), v3(0, -1, 0.3), 0.008, order, spec.colors.flower, 5);
      const dir = dirFrom(yaw + k * 2.4 + 0.8, -1.35);
      b.tube(curvedPath(p, dir, 0.065, 0.35, near ? 4 : 2), (u) => 0.006 * (1 - 0.8 * u), near ? 5 : 3, fruitOrgan(ctx, p, order));
    }
  }
}

/** Bhendi: tall single stem, lobed leaves, hibiscus-like yellow flowers and upright pods. */
export function bhendi(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stem = curvedPath(v3(0, 0, 0), v3((rand() - 0.5) * 0.05, 1, 0), H * 0.92, 0.05, near ? 7 : 4);
  b.tube(stem, (s) => 0.011 * (1 - 0.5 * s), 5, stemOrgan(ctx));
  const nodes = near ? 10 : 5;
  for (let k = 0; k < nodes; k++) {
    const t = 0.08 + (k / nodes) * 0.88;
    const p = along(stem, t);
    const yaw = k * 2.4;
    palmateLeaf(ctx, p, dirFrom(yaw, 0.7), { petiole: 0.12 * (1.1 - t * 0.5), lobes: 5, lobeL: 0.11 * (1.1 - t * 0.4), lobeW: 0.05, spread: 2.6, order: t * 0.9, profile: LEAF.lance });
    if (t > 0.35) {
      const q = p.clone().addScaledVector(dirFrom(yaw + 1.2, 0), 0.025);
      const order = (t - 0.35) * 1.4;
      flower(ctx, q.clone().add(v3(0, 0.03, 0)), dirFrom(yaw + 1.2, 0.8), 0.035, order, spec.colors.flower, 5);
      // Ridged pod pointing up.
      b.tube(curvedPath(q, v3(0.15, 1, 0), 0.12, 0.05, 3), (u) => 0.008 * (1 - 0.75 * u), 5, fruitOrgan(ctx, q, order));
    }
  }
}

/** Small onion: a clump of bulbs with tubular leaves that fall over and dry at maturity. */
export function onion(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const bulbs = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < bulbs; i++) {
    const yaw = (i / bulbs) * Math.PI * 2 + rand() * 0.5;
    // Aggregatum bulbs sit half out of the soil, pinkish-red and glossy.
    const c = v3(Math.cos(yaw) * 0.022, 0.016, Math.sin(yaw) * 0.022);
    b.ellipsoid(c, v3(0.02, 0.024, 0.02), near ? 8 : 5, near ? 6 : 3, fruitOrgan(ctx, c, rand() * 0.4));
    const leaves = near ? 3 : 2;
    for (let k = 0; k < leaves; k++) {
      const base = c.clone().add(v3(0, 0.015, 0));
      const dir = dirFrom(yaw + (k - 1) * 0.5, 1.35 - k * 0.15);
      const fall = hangMorph(base, dirFrom(yaw, 0), 1.25);
      const organ = leafOrgan(ctx, base, (i + k) / (bulbs * leaves) * 0.6, fall);
      b.tube(curvedPath(base, dir, H * (0.75 + rand() * 0.25), 0.4, near ? 6 : 3), (s) => 0.0045 * (1 - 0.75 * s), near ? 5 : 3, organ);
    }
  }
}

/** Turmeric: tufts of large lance leaves on long sheathing petioles; they yellow and dry at harvest. */
export function turmeric(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const leaves = near ? 8 : 5;
  for (let k = 0; k < leaves; k++) {
    const yaw = k * 2.4 + rand() * 0.4;
    const sheath = curvedPath(v3(0, 0, 0), dirFrom(yaw, 1.4), H * 0.38, 0.15, 2);
    const order = (k / leaves) * 0.9;
    b.tube(sheath, () => 0.008, 4, leafOrgan(ctx, v3(0, 0, 0), order));
    b.leaf(sheath[sheath.length - 1]!, dirFrom(yaw, 1.0), leafOrgan(ctx, v3(0, 0, 0), order), {
      length: H * 0.55, width: 0.12, profile: LEAF.lance, segs: near ? 6 : 3, arch: 1.4, curl: 0.06, across: near ? 5 : 3, twist: (rand() - 0.5) * 0.4,
    });
  }
}

/** Tapioca: two or three knobbly woody stems with deeply lobed palmate leaves on red petioles. */
export function tapioca(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stems = 2 + Math.floor(rand() * 2);
  for (let s = 0; s < stems; s++) {
    const yaw = (s / stems) * Math.PI * 2 + rand();
    const stem = curvedPath(v3(0, 0, 0), v3(Math.cos(yaw) * 0.12, 1, Math.sin(yaw) * 0.12), H * (0.75 + rand() * 0.15), 0.12, near ? 9 : 4);
    b.tube(stem, (t) => 0.012 * (1 - 0.4 * t), 5, stemOrgan(ctx), (t) => (((t * 18) % 1) < 0.15 ? 0.78 : 1));
    // Leaves only on the upper part; lower ones have been shed leaving scars.
    const nodes = near ? 12 : 6;
    for (let k = 0; k < nodes; k++) {
      const t = 0.35 + (k / nodes) * 0.65;
      const p = along(stem, t);
      palmateLeaf(ctx, p, dirFrom(yaw + k * 2.4, 0.45), {
        petiole: 0.24, lobes: near ? 7 : 5, lobeL: 0.18, lobeW: 0.048, spread: 4.4, order: (t - 0.35) * 1.4, petioleColor: [0.62, 0.22, 0.2],
      });
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
