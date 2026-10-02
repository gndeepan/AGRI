import * as THREE from 'three';
import {
  LEAF, PART, along, curvedPath, dirFrom, hangMorph, leafOrgan, phyllo, stemOrgan, tangentAt, v3, type Ctx, type Organ,
} from './common';

/** Strap leaves alternating up a culm (maize, sorghum, pearl millet). */
function culmLeaves(ctx: Ctx, culm: THREE.Vector3[], count: number, opts: { len: number; width: number; from: number; to: number; arch: number; yaw0: number }) {
  const { b, rand, near } = ctx;
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : i / (count - 1);
    const t = opts.from + (opts.to - opts.from) * f;
    const p = along(culm, t);
    // Distichous: leaves alternate sides, drifting slowly round the stalk.
    const yaw = opts.yaw0 + (i % 2) * Math.PI + i * 0.12 + (rand() - 0.5) * 0.4;
    const len = opts.len * (0.55 + 0.45 * Math.sin(Math.PI * (0.25 + f * 0.7))) * (0.9 + rand() * 0.2);
    b.leaf(p, dirFrom(yaw, 1.05 - f * 0.25), leafOrgan(ctx, p, i / count), {
      length: len, width: opts.width * (0.8 + 0.3 * Math.sin(Math.PI * f)), profile: LEAF.strap,
      segs: near ? 8 : 4, arch: opts.arch * (0.8 + rand() * 0.4), twist: (rand() - 0.5) * 0.9, fold: near ? 0.12 : 0, rand,
    });
  }
}

/** A stalk with visible nodes: slightly darker bands every `internode` metres. */
function culm(ctx: Ctx, base: THREE.Vector3, height: number, radius: number, lean: THREE.Vector3, segs: number, color?: Organ['color']) {
  const path = curvedPath(base, v3(lean.x, 1, lean.z), height, 0.08, segs);
  const nodes = segs;
  ctx.b.tube(path, (s) => radius * (1 - 0.45 * s), ctx.near ? 6 : 4, stemOrgan(ctx, base, color), (s) => {
    const band = Math.abs(((s * nodes) % 1) - 0.5) * 2;
    return 0.82 + 0.18 * Math.min(1, band * 1.6);
  });
  return path;
}

export function maize(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stalk = culm(ctx, v3(0, 0, 0), H * 0.86, 0.016, v3((rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.05), near ? 10 : 5);
  const yaw0 = rand() * Math.PI * 2;
  culmLeaves(ctx, stalk, near ? 13 : 8, { len: 0.85, width: 0.085, from: 0.04, to: 0.88, arch: 1.9, yaw0 });
  // Tassel: a central spike with spreading branches, emerging at flowering.
  const top = stalk[stalk.length - 1]!;
  const tassel: Organ = { part: PART.HEAD, order: 0.1, color: spec.colors.head, color2: spec.colors.headRipe, pivot: top.clone() };
  b.tube(curvedPath(top, v3(0, 1, 0), H * 0.16, 0.1, 3), () => 0.0035, 3, tassel);
  const branches = near ? 9 : 5;
  for (let i = 0; i < branches; i++) {
    const p = top.clone().add(v3(0, 0.02 + i * 0.008, 0));
    b.tube(curvedPath(p, dirFrom(i * 2.4 + rand(), 0.5), 0.16 + rand() * 0.08, 1.2, 3), () => 0.0022, 3, tassel);
  }
  // One or two ears in leaf axils: husk-covered, silks at the tip, turning dry and nodding.
  const ears = rand() > 0.75 ? 2 : 1;
  for (let e = 0; e < ears; e++) {
    const t = 0.5 - e * 0.1;
    const p = along(stalk, t);
    const yaw = yaw0 + Math.PI / 2 + e * Math.PI;
    const dir = dirFrom(yaw, 1.1);
    const pivot = p.clone();
    const center = p.clone().addScaledVector(dir, 0.11);
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir);
    const ear: Organ = {
      part: PART.FRUIT, order: 0.1 + e * 0.3, color: spec.colors.fruit, color2: spec.colors.fruitRipe, pivot,
      morph: hangMorph(pivot, dir, 0.75),
    };
    b.ellipsoid(center, v3(0.032, 0.11, 0.032), near ? 8 : 5, near ? 6 : 4, ear, q);
    const silk: Organ = { part: PART.FLOWER, order: 0.1 + e * 0.3, color: [0.82, 0.62, 0.42], pivot: center.clone(), morph: ear.morph };
    const tip = center.clone().addScaledVector(dir, 0.1);
    for (let k = 0; k < (near ? 5 : 2); k++) b.tube(curvedPath(tip, dir.clone().add(dirFrom(k * 1.3, 0)).normalize(), 0.06, 1.2, 2), () => 0.0015, 3, silk);
  }
}

function headedCereal(ctx: Ctx, kind: 'sorghum' | 'pearl_millet') {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  // Pearl millet tillers freely; sorghum is usually a single culm.
  const culms = kind === 'pearl_millet' ? 2 + Math.floor(rand() * 2) : 1;
  for (let c = 0; c < culms; c++) {
    const lean = c === 0 ? v3((rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06) : dirFrom(rand() * 6.28, 0).multiplyScalar(0.12);
    const h = H * (c === 0 ? 0.82 : 0.68 + rand() * 0.1);
    const stalk = culm(ctx, v3((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.03), h, c === 0 ? 0.013 : 0.01, lean, near ? 9 : 5);
    culmLeaves(ctx, stalk, near ? (c === 0 ? 10 : 6) : 5, { len: kind === 'sorghum' ? 0.75 : 0.65, width: kind === 'sorghum' ? 0.07 : 0.045, from: 0.05, to: 0.82, arch: 1.7, yaw0: rand() * 6.28 });
    const top = stalk[stalk.length - 1]!;
    const dir = tangentAt(stalk, 1);
    const head: Organ = {
      part: PART.HEAD, order: c * 0.25, color: spec.colors.head, color2: spec.colors.headRipe, pivot: top.clone(),
      morph: hangMorph(top, dirFrom(rand() * 6.28, 0), kind === 'sorghum' ? 0.35 : 0.25),
    };
    // Peduncle then the head.
    const ped = curvedPath(top, dir, 0.1, 0, 2);
    b.tube(ped, () => 0.005, 3, { ...head, part: PART.HEAD, color: spec.colors.stem, color2: spec.colors.stemRipe });
    const base = ped[ped.length - 1]!;
    if (kind === 'sorghum') {
      // Compact oval head: a core packed with grain clusters on short branches.
      const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir);
      b.ellipsoid(base.clone().addScaledVector(dir, 0.09), v3(0.028, 0.09, 0.028), near ? 8 : 5, near ? 6 : 4, head, q);
      const side = dir.clone().cross(v3(0, 1, 0));
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const fwd = dir.clone().cross(side).normalize();
      const grains = near ? 84 : 12;
      for (let k = 0; k < grains; k++) {
        const t = 0.06 + (k / grains) * 0.88;
        const yaw = k * 2.39996 + rand() * 0.4;
        const r = (0.03 + rand() * 0.007) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.9)), 0.6);
        const p = base.clone().addScaledVector(dir, 0.18 * t).addScaledVector(side, Math.cos(yaw) * r).addScaledVector(fwd, Math.sin(yaw) * r);
        // Many small, smooth grains read as a packed cluster; few large ones read as faceted blobs.
        const g = near ? 0.0072 + rand() * 0.0028 : 0.0105 + rand() * 0.004;
        b.ellipsoid(p, v3(g, g * 1.2, g), near ? 7 : 4, near ? 5 : 3, head);
      }
    } else {
      // Pearl millet: a cylindrical "candle" spike.
      const spike = curvedPath(base, dir, 0.26 + rand() * 0.06, 0.05, near ? 6 : 3);
      b.tube(spike, (s) => 0.0165 * (s < 0.1 ? 0.6 + s * 4 : s > 0.9 ? Math.max(0.15, 1 - (s - 0.9) * 8.5) : 1), near ? 8 : 5, head, (s) => 0.9 + 0.1 * Math.abs(Math.sin(s * 60)));
    }
  }
}

export const sorghum = (ctx: Ctx) => headedCereal(ctx, 'sorghum');
export const pearlMillet = (ctx: Ctx) => headedCereal(ctx, 'pearl_millet');

export function sugarcane(ctx: Ctx) {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const stalks = near ? 6 : 4;
  for (let s = 0; s < stalks; s++) {
    const yaw = (s / stalks) * Math.PI * 2 + rand() * 0.6;
    const base = v3(Math.cos(yaw) * 0.08, 0, Math.sin(yaw) * 0.04);
    const lean = dirFrom(yaw, 0).multiplyScalar(0.06 + rand() * 0.06);
    const h = H * (0.8 + rand() * 0.15);
    const segs = near ? 14 : 6;
    // Segmented cane: nodes every ~15 cm, waxy band below each node.
    const path = curvedPath(base, v3(lean.x, 1, lean.z), h, 0.12 * (rand() - 0.3), segs);
    const nodes = Math.round(h / 0.15);
    b.tube(path, () => 0.016, near ? 6 : 4, stemOrgan(ctx, base), (t) => {
      const f = (t * nodes) % 1;
      return f < 0.08 ? 0.68 : f > 0.9 ? 1.08 : 0.92;
    });
    // Green crown at the top; dry "trash" leaves lower down die first (low order).
    const leaves = near ? 11 : 6;
    for (let i = 0; i < leaves; i++) {
      const f = i / (leaves - 1);
      const t = 0.45 + 0.55 * f;
      const p = along(path, t);
      const ly = yaw + i * 2.2 + rand() * 0.5;
      b.leaf(p, dirFrom(ly, 1.15 - (1 - f) * 0.5), leafOrgan(ctx, p, f * 0.9), {
        length: 1.1 + rand() * 0.4, width: 0.05, profile: LEAF.strap, segs: near ? 9 : 4, arch: 2.2, twist: (rand() - 0.5) * 1.2, fold: near ? 0.15 : 0, rand,
      });
    }
  }
}

/** Tufted small millets: a dense, fairly erect clump of leafy tillers with a crop-specific head. */
function smallMillet(ctx: Ctx, head: 'finger' | 'foxtail' | 'panicle' | 'raceme') {
  const { b, rand, spec, near } = ctx;
  const H = spec.heightM;
  const tillers = near ? 7 : 4;
  const leafW = head === 'foxtail' ? 0.02 : head === 'panicle' ? 0.012 : 0.015;
  for (let c = 0; c < tillers; c++) {
    const yaw = (c / tillers) * Math.PI * 2 + rand();
    const out = 0.03 + rand() * 0.09;
    const h = H * (0.74 + rand() * 0.2);
    const r0 = 0.012 + rand() * 0.015;
    const stalk = curvedPath(v3(Math.cos(yaw) * r0, 0, Math.sin(yaw) * r0), v3(Math.cos(yaw) * out, 1, Math.sin(yaw) * out), h, 0.1, near ? 6 : 3);
    b.tube(stalk, (s) => 0.0042 * (1 - 0.4 * s), 3, stemOrgan(ctx));
    // Leaves all the way up the culm, the flag leaf just under the head.
    const leaves = near ? 5 : 3;
    for (let i = 0; i < leaves; i++) {
      const f = i / (leaves - 1);
      const p = along(stalk, 0.06 + f * 0.78);
      b.leaf(p, dirFrom(yaw + (i % 2) * Math.PI + (rand() - 0.5) * 0.9, 1.15 - f * 0.15), leafOrgan(ctx, p, f * 0.9), {
        length: (0.3 + rand() * 0.14) * (1 - f * 0.3), width: leafW, profile: LEAF.strap, segs: near ? 6 : 3, arch: 1.5 + rand() * 0.4,
        twist: (rand() - 0.5), fold: near ? 0.1 : 0, rand,
      });
    }
    const top = stalk[stalk.length - 1]!;
    const dir = tangentAt(stalk, 1);
    const organ: Organ = {
      part: PART.HEAD, order: c / tillers * 0.6, color: spec.colors.head, color2: spec.colors.headRipe, pivot: top.clone(),
      morph: hangMorph(top, v3(Math.cos(yaw), 0, Math.sin(yaw)), head === 'foxtail' ? 0.9 : head === 'panicle' ? 0.6 : 0.4),
    };
    if (head === 'finger') {
      // Ragi: 5–7 fingers radiating from the top, curving inward when mature.
      const fingers = near ? 6 : 4;
      for (let k = 0; k < fingers; k++) {
        const d = dirFrom((k / fingers) * Math.PI * 2 + rand() * 0.3, 0.9);
        b.tube(curvedPath(top, d, 0.11 + rand() * 0.03, -0.9, near ? 4 : 2), (s) => 0.009 * (1 - 0.3 * s), 4, organ);
      }
    } else if (head === 'foxtail') {
      // Thinai: a long, dense, bristly spike that arches over like a fox's tail.
      const spike = curvedPath(top, dir, 0.2 + rand() * 0.05, 1.2, near ? 7 : 3);
      b.tube(spike, (s) => 0.0135 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + s * 0.84)), 0.6), near ? 6 : 4, organ, (s) => 0.88 + 0.12 * Math.abs(Math.sin(s * 40)));
    } else if (head === 'panicle') {
      // Samai: an open, drooping panicle of hair-fine branches carrying small grains.
      const axis = curvedPath(top, dir, 0.22, 0.5, near ? 4 : 3);
      b.tube(axis, () => 0.0018, 3, organ);
      const br = near ? 12 : 5;
      for (let k = 0; k < br; k++) {
        const t = 0.08 + (k / br) * 0.9;
        const p = along(axis, t);
        const d = dirFrom(k * 2.4 + rand(), 0.55 - t * 0.5);
        const path = curvedPath(p, d, (0.11 - t * 0.05) * (0.8 + rand() * 0.4), 0.9, near ? 3 : 2);
        b.tube(path, () => 0.0012, 3, organ);
        b.ellipsoid(path[path.length - 1]!, v3(0.0045, 0.0065, 0.0045), 4, 3, organ);
        if (near) b.ellipsoid(along(path, 0.6), v3(0.004, 0.006, 0.004), 4, 3, organ);
      }
    } else {
      // Varagu: two to four one-sided racemes.
      for (let k = 0; k < 3; k++) {
        const d = dirFrom(yaw + (k - 1) * 0.7, 0.9 - k * 0.15);
        b.tube(curvedPath(top.clone().add(v3(0, -k * 0.02, 0)), d, 0.075, 0.4, near ? 3 : 2), () => 0.005, 4, organ);
      }
    }
  }
}

export const fingerMillet = (ctx: Ctx) => smallMillet(ctx, 'finger');
export const foxtailMillet = (ctx: Ctx) => smallMillet(ctx, 'foxtail');
export const littleMillet = (ctx: Ctx) => smallMillet(ctx, 'panicle');
export const kodoMillet = (ctx: Ctx) => smallMillet(ctx, 'raceme');

export { phyllo };
