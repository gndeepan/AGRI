import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../../prng';
import { sceneTime, useSceneSettings } from '../../quality';
import { useField } from '../FieldContext';
import { at, buildColored, ellipsoid } from './geo';

/** Honeybees working the flowers: hover over one bloom, then dart to the next, wings a blur. */
export function Bees({ count, canopyHeight }: { count: number; canopyHeight: number }) {
  const { focus } = useField();
  const { reducedMotion } = useSceneSettings();
  const geos = useMemo(() => ({
    body: buildColored([
      [ellipsoid(0.007, 0.007, 0.011, 6, 5), '#d9a21b'],
      [at(ellipsoid(0.0072, 0.0072, 0.003, 6, 4), 0, 0, -0.002), '#1c1408'],
      [at(ellipsoid(0.0072, 0.0072, 0.003, 6, 4), 0, 0, -0.008), '#1c1408'],
      [at(ellipsoid(0.005, 0.005, 0.005, 5, 4), 0, 0.001, 0.012), '#2a1d10'],
    ]),
    wing: (() => { const g = new THREE.PlaneGeometry(0.012, 0.007); g.translate(0.007, 0, 0); return g; })(),
  }), []);
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    wing: new THREE.MeshStandardMaterial({ color: '#e6f2ff', transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  }), []);
  useEffect(() => () => { geos.body.dispose(); geos.wing.dispose(); mats.body.dispose(); mats.wing.dispose(); }, [geos, mats]);
  const rnd = useMemo(() => { const r = mulberry32(88); return Array.from({ length: count }, () => ({ ox: (r() - 0.5) * 8, oz: (r() - 0.5) * 6, ph: r() * 20, period: 3 + r() * 2 })); }, [count]);
  const refs = useRef<Array<THREE.Group | null>>([]);
  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    rnd.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      // Each hop picks a new "flower" deterministically from the hop index; hover with a tiny figure-eight, dart between.
      const k = Math.floor((t + b.ph) / b.period);
      const u = ((t + b.ph) / b.period) % 1;
      const r1 = mulberry32(k * 7919 + i * 31)();
      const r2 = mulberry32(k * 104729 + i * 17)();
      const r3 = mulberry32((k + 1) * 7919 + i * 31)();
      const r4 = mulberry32((k + 1) * 104729 + i * 17)();
      const hop = Math.min(1, Math.max(0, (u - 0.8) / 0.2));
      const e = hop * hop * (3 - 2 * hop);
      const fx = (a: number) => focus.x + b.ox + (a - 0.5) * 6;
      const fz = (a: number) => focus.y + b.oz + (a - 0.5) * 5;
      const x = fx(r1) + (fx(r3) - fx(r1)) * e + Math.sin(t * 5 + i) * 0.015;
      const z = fz(r2) + (fz(r4) - fz(r2)) * e + Math.cos(t * 4.3 + i) * 0.015;
      g.position.set(x, canopyHeight + 0.18 + Math.sin(t * 6.1 + i) * 0.012 + e * 0.1, z);
      g.rotation.y = Math.atan2(fx(r3) - fx(r1), fz(r4) - fz(r2));
      const f = Math.sin(t * 190 + i) * 0.9;
      (g.children[1] as THREE.Object3D).rotation.z = f;
      (g.children[2] as THREE.Object3D).rotation.z = -f;
    });
  });
  return (
    <group>
      {rnd.map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <mesh geometry={geos.body} material={mats.body} />
          <mesh geometry={geos.wing} material={mats.wing} position={[0, 0.006, 0]} rotation-y={Math.PI / 2} />
          <mesh geometry={geos.wing} material={mats.wing} position={[0, 0.006, 0]} rotation-y={-Math.PI / 2} />
        </group>
      ))}
    </group>
  );
}
