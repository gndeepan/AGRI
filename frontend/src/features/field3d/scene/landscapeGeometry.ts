import * as THREE from 'three';
import type { House, LandscapePlan, Segment } from '../landscape';
import { mulberry32 } from '../prng';
import { box, colored, gableRoof, mergeColored, place, ribbon } from './meshUtil';

/** One house: whitewashed walls, gable roof (tile or thatch), door, window and an optional porch. */
function houseParts(h: House, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const roofColor = h.roof === 'tile' ? '#9c4e32' : '#b39a58';
  parts.push(colored(box(h.w, h.wallH, h.d), h.wall, 0.08, seed));
  parts.push(place(gableRoof(h.w + 0.9, h.d + 0.9, h.roofH, roofColor, h.wall, 0.22, seed), 0, h.wallH, 0));
  // Plinth the colour of red oxide, as on village houses.
  parts.push(colored(box(h.w + 0.1, 0.45, h.d + 0.1), '#8a4b3a', 0.1, seed + 2));
  // Door and a barred window on the front (+z) face.
  parts.push(place(colored(box(0.95, 1.85, 0.08), '#4a3424', 0.1, seed), -h.w * 0.18, 0, h.d / 2 + 0.03));
  parts.push(place(colored(box(0.7, 0.6, 0.08), '#35454a', 0.1, seed), h.w * 0.26, 1.15, h.d / 2 + 0.03));
  if (h.porch) {
    // Thinnai: a raised verandah with two pillars.
    parts.push(place(colored(box(h.w * 0.8, 0.5, 1.3), '#b8a78a', 0.12, seed), 0, 0, h.d / 2 + 0.65));
    for (const sx of [-1, 1]) {
      parts.push(place(colored(box(0.14, 2.0, 0.14), '#d8cfba', 0.1, seed), sx * h.w * 0.36, 0.5, h.d / 2 + 1.2));
    }
    parts.push(place(colored(box(h.w * 0.86, 0.1, 1.5), roofColor, 0.2, seed), 0, 2.5, h.d / 2 + 0.75));
  }
  return parts.map((p) => place(p, h.x, 0, h.z, h.yaw));
}

/** All village houses as one merged, vertex-coloured geometry (one draw call). */
export function buildHouses(houses: House[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  houses.forEach((h, i) => parts.push(...houseParts(h, 11 + i * 7)));
  return mergeColored(parts);
}

/** Electricity poles (concrete, with a cross-arm and insulators), merged. */
export function buildPoles(poles: Array<[number, number]>, roadAngle: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of poles) {
    const pole = new THREE.CylinderGeometry(0.09, 0.14, 9, 6);
    pole.translate(0, 4.5, 0);
    parts.push(place(colored(pole, '#8b877e', 0.1, 5), x, 0, z));
    parts.push(place(colored(box(0.1, 0.1, 1.9), '#6d675c', 0.1, 6), x, 8.6, z, roadAngle));
    for (const s of [-0.8, 0, 0.8]) {
      const ins = new THREE.CylinderGeometry(0.04, 0.05, 0.2, 5);
      parts.push(place(colored(ins, '#d9d2c2', 0, 7), x + Math.cos(roadAngle) * 0 + Math.sin(roadAngle) * s, 8.75, z + Math.cos(roadAngle) * s));
    }
  }
  return mergeColored(parts);
}

/** Sagging wires between neighbouring poles (three conductors). Returns line-segment positions. */
export function buildWires(poles: Array<[number, number]>, roadAngle: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const sx = Math.sin(roadAngle);
  const sz = Math.cos(roadAngle);
  const steps = 8;
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i]!;
    const b = poles[i + 1]!;
    for (const off of [-0.8, 0, 0.8]) {
      let px = a[0] + sx * off;
      let pz = a[1] + sz * off;
      let py = 8.7;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const nx = a[0] + (b[0] - a[0]) * t + sx * off;
        const nz = a[1] + (b[1] - a[1]) * t + sz * off;
        const ny = 8.7 - 0.9 * 4 * t * (1 - t);
        pos.push(px, py, pz, nx, ny, nz);
        px = nx; pz = nz; py = ny;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Dirt road, flat strip with slightly lighter wheel tracks. */
export function buildRoad(plan: LandscapePlan): THREE.BufferGeometry {
  const { a, b, width } = plan.road;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const lane = (off: number, w: number, y: number, color: string, seed: number) =>
    colored(ribbon(a[0] + nx * off, a[1] + nz * off, b[0] + nx * off, b[1] + nz * off, w, y), color, 0.1, seed);
  return mergeColored([
    lane(0, width, 0.025, '#9b8b6c', 1),
    lane(-width * 0.22, 0.55, 0.03, '#b2a283', 2),
    lane(width * 0.22, 0.55, 0.03, '#b2a283', 3),
    lane(width / 2 + 0.5, 1.2, 0.02, '#6f7a3c', 4), // grass verge
    lane(-width / 2 - 0.5, 1.2, 0.02, '#6f7a3c', 5),
  ]);
}

function segBox(s: Segment, w: number, h: number): THREE.BufferGeometry {
  const dx = s.b[0] - s.a[0];
  const dz = s.b[1] - s.a[1];
  const len = Math.hypot(dx, dz) || 1;
  const g = box(len, h, w);
  // box() runs along x; yaw so that +x maps onto the segment direction.
  return place(g, (s.a[0] + s.b[0]) / 2, 0, (s.a[1] + s.b[1]) / 2, -Math.atan2(dz, dx));
}

/** Irrigation canals: an earthen embankment (merged) and the water strip on top (merged). */
export function buildCanals(canals: Segment[]): { bank: THREE.BufferGeometry; water: THREE.BufferGeometry } {
  const bank: THREE.BufferGeometry[] = [];
  const water: THREE.BufferGeometry[] = [];
  canals.forEach((s, i) => {
    bank.push(colored(segBox(s, 1.5, 0.36), '#86764f', 0.18, 20 + i));
    const dx = s.b[0] - s.a[0];
    const dz = s.b[1] - s.a[1];
    const len = Math.hypot(dx, dz) || 1;
    water.push(ribbon(s.a[0], s.a[1], s.b[0], s.b[1], 0.7, 0.375));
    void len;
  });
  return { bank: mergeColored(bank), water: water.length ? mergeColored(water.map((w) => colored(w, '#ffffff'))) : new THREE.BufferGeometry() };
}

/** Temple gopuram: stepped tiers with cornices, barrel roof and gold kalasams, plus a compound wall. */
export function buildGopuram(g: NonNullable<LandscapePlan['gopuram']>): THREE.BufferGeometry {
  const rand = mulberry32(77);
  const parts: THREE.BufferGeometry[] = [];
  const tiers = 7;
  const bands = ['#d7b88a', '#c4623f', '#e9dcc0', '#b04a36', '#dfc79a'];
  const base = g.height * 0.14;
  parts.push(colored(box(g.width * 1.15, base, g.width * 0.62), '#d9c8a5', 0.05, 1));
  parts.push(place(colored(box(g.width * 0.28, base * 0.7, 0.5), '#2d2118', 0, 2), 0, 0, g.width * 0.32));
  let y = base;
  const tierH = (g.height - base - g.height * 0.1) / tiers;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.115;
    const w = g.width * k;
    const d = g.width * 0.55 * k;
    parts.push(place(colored(box(w, tierH * 0.82, d), bands[i % bands.length]!, 0.1, 3 + i), 0, y, 0));
    parts.push(place(colored(box(w * 1.06, tierH * 0.18, d * 1.1), '#efe6cf', 0.05, 30 + i), 0, y + tierH * 0.82, 0));
    // Little figure niches on the front.
    for (let n = -1; n <= 1; n++) {
      parts.push(place(colored(box(w * 0.12, tierH * 0.5, 0.2), '#7a3b2a', 0.2, 50 + n + i), n * w * 0.28, y + tierH * 0.15, d / 2 + 0.05));
    }
    y += tierH;
  }
  const roof = new THREE.CylinderGeometry(g.width * 0.2, g.width * 0.2, g.width * 0.46, 10, 1, false, 0, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.rotateY(Math.PI / 2);
  parts.push(place(colored(roof, '#b04a36', 0.1, 90), 0, y + g.width * 0.04, 0));
  for (const sx of [-0.12, 0, 0.12]) {
    const kal = new THREE.ConeGeometry(g.width * 0.03, g.width * 0.2, 6);
    parts.push(place(colored(kal, '#d9a82e', 0.1, 95), sx * g.width, y + g.width * 0.2, 0));
  }
  // Compound wall.
  parts.push(place(colored(box(g.width * 3.4, 3.2, 0.7), '#d6c7a7', 0.08, 99), 0, 0, -g.width * 0.5 + rand() * 0.01));
  return mergeColored(parts.map((p) => place(p, g.x, 0, g.z, g.yaw)));
}
