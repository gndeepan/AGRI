import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useSceneSettings } from '../quality';
import { useField } from './FieldContext';
import { BUND_H } from './Ground';

/** Merge primitives into one vertex-coloured geometry. */
function build(parts: Array<[THREE.BufferGeometry, string]>): THREE.BufferGeometry {
  const list = parts.map(([g, hex]) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    const c = new THREE.Color(hex);
    const count = n.getAttribute('position').count;
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) col.set([c.r, c.g, c.b], i * 3);
    n.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return n;
  });
  const merged = mergeGeometries(list, false) ?? new THREE.BufferGeometry();
  parts.forEach(([g]) => g.dispose());
  list.forEach((g) => g.dispose());
  merged.computeVertexNormals();
  return merged;
}

/** A 1.7 m farmer in a veshti with a towel turban — the human scale reference. */
function farmerGeometry(): THREE.BufferGeometry {
  const t = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  return build([
    [t(new THREE.CylinderGeometry(0.17, 0.24, 0.62, 10), 0, 0.55, 0), '#efe9d8'], // veshti
    [t(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 6), 0.08, 0.12, 0), '#6b4a33'],
    [t(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 6), -0.08, 0.12, 0), '#6b4a33'],
    [t(new THREE.CylinderGeometry(0.16, 0.18, 0.52, 10), 0, 1.12, 0), '#3f6f8f'], // shirt
    [t(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 6).rotateZ(0.18), 0.22, 1.1, 0), '#6b4a33'],
    [t(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 6).rotateZ(-0.18), -0.22, 1.1, 0), '#6b4a33'],
    [t(new THREE.SphereGeometry(0.11, 12, 10), 0, 1.5, 0), '#6b4a33'],
    [t(new THREE.TorusGeometry(0.1, 0.035, 6, 12).rotateX(Math.PI / 2), 0, 1.58, 0), '#f2efe6'], // turban
  ]);
}

/** Traditional scarecrow (sōlakkāṭṭu bommai): pole, cross-arm, straw body, clay-pot head. */
function scarecrowGeometry(): THREE.BufferGeometry {
  const t = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  return build([
    [t(new THREE.CylinderGeometry(0.03, 0.035, 1.7, 6), 0, 0.85, 0), '#6a5236'],
    [t(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6).rotateZ(Math.PI / 2), 0, 1.25, 0), '#6a5236'],
    [t(new THREE.CylinderGeometry(0.16, 0.22, 0.6, 8), 0, 1.0, 0), '#b8975a'],
    [t(new THREE.CylinderGeometry(0.06, 0.04, 0.45, 6).rotateZ(Math.PI / 2), 0.36, 1.25, 0), '#a23b2a'],
    [t(new THREE.CylinderGeometry(0.06, 0.04, 0.45, 6).rotateZ(-Math.PI / 2), -0.36, 1.25, 0), '#a23b2a'],
    [t(new THREE.SphereGeometry(0.15, 12, 10), 0, 1.55, 0), '#c9b28a'], // white-washed pot
    [t(new THREE.SphereGeometry(0.025, 6, 6), 0.05, 1.58, 0.13), '#111111'],
    [t(new THREE.SphereGeometry(0.025, 6, 6), -0.05, 1.58, 0.13), '#111111'],
  ]);
}

/** Point on the field's bund nearest to `near`, plus the outward normal there. */
export function bundSpot(ring: Array<[number, number]>, near: [number, number]) {
  let best = { x: ring[0]![0], z: ring[0]![1], nx: 0, nz: 1, d: Infinity };
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const t = Math.max(0.15, Math.min(0.85, ((near[0] - ax) * dx + (near[1] - az) * dz) / (len * len)));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(near[0] - px, near[1] - pz);
    // Outer rings wind with negative (x, z) area, so (-dz, dx) points out of the field.
    if (d < best.d) best = { x: px, z: pz, nx: -dz / len, nz: dx / len, d };
  }
  return best;
}

export function ScaleFigures({ viewFrom }: { viewFrom: [number, number] }) {
  const { shape } = useField();
  // The animated farmer (wildlife/Farmer) replaces this static one on the high tier.
  const { quality } = useSceneSettings();
  const geos = useMemo(() => ({ farmer: farmerGeometry(), scarecrow: scarecrowGeometry() }), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), []);
  useEffect(() => () => { geos.farmer.dispose(); geos.scarecrow.dispose(); mat.dispose(); }, [geos, mat]);

  const spots = useMemo(() => {
    const s = bundSpot(shape.ring, viewFrom);
    const tx = -s.nz;
    const tz = s.nx;
    const inward = (d: number): [number, number] => [s.x - s.nx * d, s.z - s.nz * d];
    // Farmer on the bund a few metres along; scarecrow standing in the field.
    const sc = inward(Math.min(6, shape.widthM * 0.2));
    return {
      farmer: [s.x + tx * 3 + s.nx * 0.35, BUND_H, s.z + tz * 3 + s.nz * 0.35] as const,
      farmerYaw: Math.atan2(-s.nx, -s.nz),
      scarecrow: [sc[0] - tx * 2, 0, sc[1] - tz * 2] as const,
    };
  }, [shape, viewFrom]);

  return (
    <group>
      {quality === 'low' && <mesh geometry={geos.farmer} material={mat} position={spots.farmer} rotation-y={spots.farmerYaw} castShadow />}
      <mesh geometry={geos.scarecrow} material={mat} position={spots.scarecrow} rotation-y={spots.farmerYaw + 0.4} castShadow />
    </group>
  );
}
