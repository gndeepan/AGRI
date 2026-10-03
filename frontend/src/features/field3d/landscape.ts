import { signedDistanceToEdge, type FieldShape } from './fieldShape';
import { mulberry32 } from './prng';

/**
 * Deterministic layout of everything around the farmer's field: a village edge, a road with
 * electricity poles, irrigation canals, a distant temple tower, a tank bund and trees. It is a
 * pure function of the field polygon, so the same land always gets the same surroundings.
 * Scene axes: +x east, -z north, metres.
 */
export type Pt = [number, number];

export interface House {
  x: number;
  z: number;
  /** Rotation about +y (radians). */
  yaw: number;
  w: number;
  d: number;
  wallH: number;
  roofH: number;
  roof: 'tile' | 'thatch';
  wall: string;
  /** A small porch (thinnai) along the front. */
  porch: boolean;
}

export interface TreeSpot {
  kind: 'coconut' | 'palmyra' | 'neem' | 'banyan';
  x: number;
  z: number;
  scale: number;
  yaw: number;
}

export interface Segment {
  a: Pt;
  b: Pt;
}

export interface LandscapePlan {
  seed: number;
  village: { center: Pt; radius: number; laneYaw: number };
  houses: House[];
  road: Segment & { width: number };
  poles: Pt[];
  canals: Segment[];
  gopuram: { x: number; z: number; yaw: number; height: number; width: number } | null;
  tank: { center: Pt; yaw: number; length: number; width: number; height: number } | null;
  trees: TreeSpot[];
}

/** Stable seed from the polygon's own coordinates (centimetre precision). */
export function hashShape(shape: FieldShape): number {
  let h = 2166136261;
  for (const [x, z] of shape.ring) {
    h = Math.imul(h ^ Math.round(x * 100), 16777619);
    h = Math.imul(h ^ Math.round(z * 100), 16777619);
  }
  return h >>> 0;
}

const WALLS = ['#efe6d2', '#e7c98f', '#d9b6a0', '#bcd3d6', '#e8d9c0', '#f1efe6', '#d8c69a'];

/** Distance from a point to a segment. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
}

export function planLandscape(shape: FieldShape): LandscapePlan {
  const seed = hashShape(shape);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const [cx, cz] = shape.center;
  const R = shape.radius;
  const farFromField = (x: number, z: number, margin: number) => signedDistanceToEdge(shape, x, z) > margin;

  // --- village: one settlement 170–260 m from the field, houses on both sides of a lane ---
  const va = rand() * Math.PI * 2;
  const vd = R + 170 + rand() * 90;
  const vc: Pt = [cx + Math.cos(va) * vd, cz + Math.sin(va) * vd];
  const laneYaw = va + Math.PI / 2;
  const tx = Math.cos(laneYaw);
  const tz = Math.sin(laneYaw);
  const nx = -tz;
  const nz = tx;
  const houses: House[] = [];
  const nHouses = 14 + Math.floor(rand() * 8);
  for (let i = 0; i < nHouses; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const along = (Math.floor(i / 2) - nHouses / 4) * (8 + rand() * 3) + (rand() - 0.5) * 2;
    const off = side * (6.5 + rand() * 3.5);
    const x = vc[0] + tx * along + nx * off;
    const z = vc[1] + tz * along + nz * off;
    const thatch = rand() < 0.3;
    houses.push({
      x, z,
      // Faces the lane.
      yaw: Math.atan2(nx * -side, nz * -side) + (rand() - 0.5) * 0.12,
      w: 5 + rand() * 2.2,
      d: 3.8 + rand() * 1.4,
      wallH: 2.3 + rand() * 0.5,
      roofH: 1.2 + rand() * 0.5,
      roof: thatch ? 'thatch' : 'tile',
      wall: WALLS[Math.floor(rand() * WALLS.length)]!,
      porch: rand() < 0.55,
    });
  }
  const villageRadius = 12 + (nHouses / 2) * 5.5;

  // --- road with a line of electricity poles, passing the field at a distance ---
  const ra = va + Math.PI * (0.55 + rand() * 0.5);
  const rd = R + 70 + rand() * 30;
  const rc: Pt = [cx + Math.cos(ra) * rd, cz + Math.sin(ra) * rd];
  const rdir = ra + Math.PI / 2;
  const half = 420;
  const road = {
    a: [rc[0] - Math.cos(rdir) * half, rc[1] - Math.sin(rdir) * half] as Pt,
    b: [rc[0] + Math.cos(rdir) * half, rc[1] + Math.sin(rdir) * half] as Pt,
    width: 4.2,
  };
  const poles: Pt[] = [];
  const spacing = 42;
  const sideOff = road.width / 2 + 1.4;
  for (let s = -half + 20; s <= half - 20; s += spacing) {
    poles.push([rc[0] + Math.cos(rdir) * s + Math.cos(ra) * sideOff, rc[1] + Math.sin(rdir) * s + Math.sin(ra) * sideOff]);
  }

  // --- irrigation canals: raised water strips along some gaps between plots ---
  const ux = Math.cos(shape.rowAngle);
  const uz = Math.sin(shape.rowAngle);
  const cu = Math.min(120, Math.max(18, shape.lengthM * 0.9));
  const cv = Math.min(90, Math.max(14, shape.widthM * 0.9));
  const canals: Segment[] = [];
  const reach = Math.min(520, R * 1.6 + 160);
  for (const dir of ['u', 'v'] as const) {
    const step = dir === 'u' ? cv : cu;
    for (let k = 1; k <= 3; k++) {
      for (const sign of [-1, 1]) {
        if (rand() < 0.45) continue;
        const off = sign * (k + 0.5) * step;
        const s0 = -reach * (0.3 + rand() * 0.7);
        const s1 = reach * (0.3 + rand() * 0.7);
        const pa: Pt = dir === 'u'
          ? [cx + ux * s0 - uz * off, cz + uz * s0 + ux * off]
          : [cx + ux * off - uz * s0, cz + uz * off + ux * s0];
        const pb: Pt = dir === 'u'
          ? [cx + ux * s1 - uz * off, cz + uz * s1 + ux * off]
          : [cx + ux * off - uz * s1, cz + uz * off + ux * s1];
        // Keep canals clear of the farmer's own field and out of the village.
        let ok = true;
        for (let i = 0; i <= 24 && ok; i++) {
          const p: Pt = [pa[0] + (pb[0] - pa[0]) * (i / 24), pa[1] + (pb[1] - pa[1]) * (i / 24)];
          if (!farFromField(p[0], p[1], 4) || Math.hypot(p[0] - vc[0], p[1] - vc[1]) < villageRadius + 6) ok = false;
        }
        if (ok) canals.push({ a: pa, b: pb });
      }
    }
  }

  // --- landmarks ---
  const ga = va + Math.PI * (0.25 + rand() * 0.5) * (rand() < 0.5 ? 1 : -1);
  const gd = R + 520 + rand() * 160;
  const gopuram = { x: cx + Math.cos(ga) * gd, z: cz + Math.sin(ga) * gd, yaw: ga + Math.PI / 2, height: 24 + rand() * 8, width: 11 + rand() * 3 };
  const ta = ga + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.5);
  const td = R + 300 + rand() * 120;
  const tank = {
    center: [cx + Math.cos(ta) * td, cz + Math.sin(ta) * td] as Pt,
    yaw: ta + Math.PI / 2,
    length: 150 + rand() * 80,
    width: 14,
    height: 3.6,
  };

  // --- trees: groves by the village and tank, palmyras along bunds, a few banyans ---
  const trees: TreeSpot[] = [];
  const blocked = (x: number, z: number) =>
    !farFromField(x, z, 7)
    || distToSegment([x, z], road.a, road.b) < road.width / 2 + 2
    || houses.some((h) => Math.hypot(h.x - x, h.z - z) < 5);
  const add = (kind: TreeSpot['kind'], x: number, z: number, s0: number, s1: number) => {
    if (blocked(x, z)) return;
    trees.push({ kind, x, z, scale: s0 + rand() * (s1 - s0), yaw: rand() * Math.PI * 2 });
  };
  // Coconut and neem around the homesteads.
  for (let i = 0; i < 38; i++) {
    const a = rand() * Math.PI * 2;
    const d = villageRadius * (0.5 + rand() * 0.9);
    add(rand() < 0.62 ? 'coconut' : 'neem', vc[0] + Math.cos(a) * d, vc[1] + Math.sin(a) * d, 0.85, 1.3);
  }
  // Banyan by the lane (village meeting tree).
  for (let i = 0; i < 2; i++) add('banyan', vc[0] + tx * (rand() * 30 - 15) + nx * (14 + rand() * 6), vc[1] + tz * (rand() * 30 - 15) + nz * (14 + rand() * 6), 1.1, 1.5);
  // Trees on the tank bund.
  for (let i = 0; i < 16; i++) {
    const s = (i / 15 - 0.5) * tank.length;
    const bx = tank.center[0] + Math.cos(tank.yaw) * s + (rand() - 0.5) * 3;
    const bz = tank.center[1] + Math.sin(tank.yaw) * s + (rand() - 0.5) * 3;
    add(rand() < 0.55 ? 'palmyra' : 'neem', bx, bz, 0.9, 1.3);
  }
  // Palmyras and coconuts scattered along bunds and road edges.
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2;
    const d = R + 28 + rand() * (260 + R * 0.5);
    const kind = rand();
    add(kind < 0.4 ? 'palmyra' : kind < 0.75 ? 'coconut' : 'neem', cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.8, 1.3);
  }

  return { seed, village: { center: vc, radius: villageRadius, laneYaw }, houses, road, poles, canals, gopuram, tank, trees };
}

/** True when a plot of half-size `r` centred at (x, z) would sit on the village, road or tank. */
export function blocksPlot(plan: LandscapePlan, x: number, z: number, r: number): boolean {
  if (Math.hypot(x - plan.village.center[0], z - plan.village.center[1]) < plan.village.radius + r * 0.7) return true;
  if (distToSegment([x, z], plan.road.a, plan.road.b) < plan.road.width / 2 + 3 + r * 0.7) return true;
  if (plan.tank) {
    const t = plan.tank;
    const dx = x - t.center[0];
    const dz = z - t.center[1];
    const along = dx * Math.cos(t.yaw) + dz * Math.sin(t.yaw);
    const across = -dx * Math.sin(t.yaw) + dz * Math.cos(t.yaw);
    if (Math.abs(along) < t.length / 2 + r * 0.7 && Math.abs(across) < 34 + r * 0.7) return true;
  }
  return false;
}
