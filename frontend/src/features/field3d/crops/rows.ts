import type { FieldShape } from '../fieldShape';

export interface RowSegment {
  /** Row index across the field (0 at the field centre). */
  j: number;
  ax: number; az: number; bx: number; bz: number;
}

/**
 * Crop rows clipped to the drawn polygon, within `radius` of `focus` (both in scene
 * metres). Rows run along the field's longest edge, `spacing` apart, offset so a row
 * passes through the field centre — the same frame `hillsAround` plants on.
 */
export function rowSegments(
  shape: FieldShape, spacing: number, focus: [number, number], radius: number, inset = 0.25, maxRows = 4000,
): RowSegment[] {
  const ux = Math.cos(shape.rowAngle);
  const uz = Math.sin(shape.rowAngle);
  const toUV = (x: number, z: number): [number, number] => {
    const dx = x - shape.center[0];
    const dz = z - shape.center[1];
    return [dx * ux + dz * uz, -dx * uz + dz * ux];
  };
  const toXZ = (u: number, v: number): [number, number] => [shape.center[0] + u * ux - v * uz, shape.center[1] + u * uz + v * ux];
  const rings = [shape.ring, ...shape.holes].map((r) => r.map(([x, z]) => toUV(x, z)));
  const [fu, fv] = toUV(focus[0], focus[1]);
  const j0 = Math.ceil((fv - radius) / spacing);
  const j1 = Math.floor((fv + radius) / spacing);
  const out: RowSegment[] = [];
  for (let j = j0; j <= j1 && out.length < maxRows; j++) {
    const v = j * spacing;
    // Intersections of the line v = const with every polygon edge (even–odd).
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [au, av] = ring[i]!;
        const [bu, bv] = ring[(i + 1) % ring.length]!;
        if ((av > v) !== (bv > v)) xs.push(au + ((v - av) * (bu - au)) / (bv - av));
      }
    }
    xs.sort((a, b) => a - b);
    const half = Math.sqrt(Math.max(0, radius * radius - (v - fv) * (v - fv)));
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const lo = Math.max(xs[k]! + inset, fu - half);
      const hi = Math.min(xs[k + 1]! - inset, fu + half);
      if (hi - lo < 0.2) continue;
      const [ax, az] = toXZ(lo, v);
      const [bx, bz] = toXZ(hi, v);
      out.push({ j, ax, az, bx, bz });
    }
  }
  return out;
}

/** How far the detailed plant patch reaches for a crop, so its plant count stays within budget. */
export function lodRadii(rowM: number, plantM: number, budgetNear: number, budgetMid: number, cap: { r0: number; r1: number }) {
  const perPlant = rowM * plantM;
  const r0 = Math.min(cap.r0 * Math.max(1, Math.sqrt(perPlant / 0.03)), Math.sqrt((budgetNear * perPlant) / Math.PI));
  const r1 = Math.min(cap.r1 * Math.max(1, Math.sqrt(perPlant / 0.03)), Math.sqrt((budgetNear * perPlant + budgetMid * perPlant) / Math.PI));
  return { r0: Math.max(1.5, r0), r1: Math.max(r0 + 1, r1) };
}
