import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useSceneSettings } from '../quality';
import { useField } from './FieldContext';
import { BUND_H } from './Ground';
import { scarecrowGeometry } from './scarecrow';
import { buildColored, type ColoredPart } from './wildlife/geo';
import { createOrganicMaterial } from './wildlife/organicMaterial';

/** A 1.7 m farmer in a veshti with a towel turban — the human scale reference. */
function farmerGeometry(): THREE.BufferGeometry {
  const t = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  const parts: ColoredPart[] = [
    [t(new THREE.CylinderGeometry(0.17, 0.24, 0.62, 16), 0, 0.55, 0), '#efe9d8', 'cloth'], // veshti
    [t(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 10), 0.08, 0.12, 0), '#6b4a33'],
    [t(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 10), -0.08, 0.12, 0), '#6b4a33'],
    [t(new THREE.CylinderGeometry(0.16, 0.18, 0.52, 16), 0, 1.12, 0), '#3f6f8f', 'cloth'], // shirt
    [t(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 10).rotateZ(0.18), 0.22, 1.1, 0), '#6b4a33'],
    [t(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 10).rotateZ(-0.18), -0.22, 1.1, 0), '#6b4a33'],
    [t(new THREE.SphereGeometry(0.11, 18, 14), 0, 1.5, 0), '#6b4a33'],
    [t(new THREE.TorusGeometry(0.1, 0.035, 10, 20).rotateX(Math.PI / 2), 0, 1.58, 0), '#f2efe6', 'cloth'], // turban
  ];
  return buildColored(parts, 'skin');
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
  const mat = useMemo(() => createOrganicMaterial({ side: THREE.DoubleSide }), []);
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

  // Dev-only: __bhoomiFrameScarecrow(dist, height, azimuthDeg) puts the camera on the scarecrow.
  const camera = useThree((st) => st.camera);
  const controls = useThree((st) => st.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bhoomiFrameScarecrow = (dist = 2.6, height = 1.3, az = 0) => {
      if (!controls) return;
      const a = spots.farmerYaw + Math.PI - 0.35 + (az * Math.PI) / 180;
      const [x, , z] = spots.scarecrow;
      camera.position.set(x + Math.sin(a) * dist, height, z + Math.cos(a) * dist);
      controls.target.set(x, 1.2, z);
      controls.update();
    };
    return () => { delete w.__bhoomiFrameScarecrow; };
  }, [camera, controls, spots]);

  return (
    <group>
      {quality === 'low' && <mesh geometry={geos.farmer} material={mat} position={spots.farmer} rotation-y={spots.farmerYaw} castShadow />}
      {/* Turned to face the viewer on the bund (the farmer faces into the field). */}
      <mesh geometry={geos.scarecrow} material={mat} position={spots.scarecrow} rotation-y={spots.farmerYaw + Math.PI - 0.35} castShadow />
    </group>
  );
}
