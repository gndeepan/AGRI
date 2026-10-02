import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hillsAround, insideField } from '../fieldShape';
import { mulberry32 } from '../prng';
import { sceneTime, useSceneSettings } from '../quality';
import { useField } from '../scene/FieldContext';
import type { CropVisual } from './cropGrowth';
import type { CropSpec } from './specs';
import { UplandCrop, type UplandLod } from './UplandCrop';
import { UplandGround } from './UplandGround';

export interface UplandSceneProps {
  spec: CropSpec;
  visual: CropVisual;
  windStrength: number;
  windDirection: THREE.Vector2;
  /** Rain / dew wetness on leaves. */
  leafWet: number;
  /** Rain wetness of the soil surface (lingers after rain). */
  groundWet: number;
  irrigationMethod?: string;
  /** 0..1 daytime fair-weather activity (birds hide in rain and at night). */
  activity: number;
}

/** Everything specific to non-paddy crops; loaded lazily so the paddy scene stays lean. */
export default function UplandScene({ spec, visual, windStrength, windDirection, leafWet, groundWet, irrigationMethod, activity }: UplandSceneProps) {
  const { shape } = useField();
  const [patch, setPatch] = useState<{ center: [number, number]; r: number }>(() => ({ center: shape.center, r: 10 }));
  const onPatch = useCallback((c: [number, number], lod: UplandLod) => {
    setPatch((p) => (p.center[0] === c[0] && p.center[1] === c[1] && p.r === lod.r1 ? p : { center: c, r: lod.r1 }));
  }, []);
  // Birds come for ripening grain heads and ripe fruit.
  const ripeTop = visual.presence > 0.5 && visual.ripe > 0.35 && (visual.head > 0.5 || visual.fruit > 0.5);
  const canopyTop = spec.heightM * visual.scale + (spec.ground.kind === 'flat' ? 0 : spec.ground.heightM);
  return (
    <group>
      <UplandGround spec={spec} visual={visual} wetness={groundWet} irrigationMethod={irrigationMethod} patch={patch.center} detailRadius={patch.r} />
      <UplandCrop spec={spec} visual={visual} windStrength={windStrength} windDirection={windDirection} wet={leafWet} onPatch={onPatch} />
      {activity > 0.05 && ripeTop && <PerchedBirds spec={spec} canopyTop={canopyTop} />}
    </group>
  );
}

type BirdKind = CropSpec['birds'];

/** Rose-ringed parakeet (green, red beak, long tail) or common myna (brown, yellow beak and eye patch). */
function useBirdParts(kind: BirdKind) {
  return useMemo(() => {
    const body = new THREE.SphereGeometry(0.045, 10, 8);
    body.scale(1, 0.9, kind === 'parakeet' ? 1.5 : 1.6);
    body.translate(0, 0.05, 0);
    const head = new THREE.SphereGeometry(kind === 'parakeet' ? 0.032 : 0.03, 8, 6);
    head.translate(0, 0.095, 0.05);
    const tail = new THREE.ConeGeometry(0.018, kind === 'parakeet' ? 0.2 : 0.07, 4);
    tail.rotateX(-Math.PI / 2 - 0.5);
    tail.translate(0, kind === 'parakeet' ? 0.0 : 0.04, kind === 'parakeet' ? -0.13 : -0.08);
    const beak = new THREE.ConeGeometry(0.011, 0.03, 5);
    beak.rotateX(Math.PI / 2 + (kind === 'parakeet' ? 0.6 : 0.1));
    beak.translate(0, 0.088, 0.085);
    const merge = (list: THREE.BufferGeometry[]) => {
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      parts.forEach((g) => g.deleteAttribute('uv'));
      const m = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
      list.forEach((g) => g.dispose());
      return m;
    };
    return { plumage: merge([body, head, tail]), beak };
  }, [kind]);
}

function PerchedBirds({ spec, canopyTop }: { spec: CropSpec; canopyTop: number }) {
  const kind = spec.birds;
  const { quality, reducedMotion } = useSceneSettings();
  const { shape, focus } = useField();
  const count = quality === 'high' ? 6 : 3;
  const parts = useBirdParts(kind);
  const mats = useMemo(() => ({
    plumage: new THREE.MeshStandardMaterial({ color: kind === 'parakeet' ? '#4caf3c' : '#5a3a28', roughness: 0.7 }),
    beak: new THREE.MeshStandardMaterial({ color: kind === 'parakeet' ? '#c8221c' : '#f0c020', roughness: 0.5 }),
  }), [kind]);
  useEffect(() => () => {
    parts.plumage.dispose(); parts.beak.dispose(); mats.plumage.dispose(); mats.beak.dispose();
  }, [parts, mats]);
  const birds = useMemo(() => {
    const rand = mulberry32(kind === 'parakeet' ? 909 : 707);
    return Array.from({ length: count }, () => ({ ang: rand() * Math.PI * 2, r: 2 + rand() * 7, yaw: rand() * Math.PI * 2, phase: rand() * 20 }));
  }, [count, kind]);
  const refs = useRef<Array<THREE.Group | null>>([]);
  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    birds.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      let x = focus.x + Math.cos(b.ang) * b.r;
      let z = focus.y + Math.sin(b.ang) * b.r;
      // Parakeets perch on a real plant's head; mynas forage on the ground between rows.
      const hill = hillsAround(shape, [x, z], 0, Math.max(spec.rowM, spec.plantM), 1, spec.rowM, spec.plantM)[0];
      if (hill) {
        x = hill.x + (kind === 'myna' ? Math.cos(shape.rowAngle + Math.PI / 2) * spec.rowM * 0.5 : 0);
        z = hill.z + (kind === 'myna' ? Math.sin(shape.rowAngle + Math.PI / 2) * spec.rowM * 0.5 : 0);
      }
      g.visible = !!hill && insideField(shape, x, z);
      const hop = kind === 'myna' && !reducedMotion ? Math.max(0, Math.sin(t * 1.3 + b.phase)) ** 8 * 0.12 : 0;
      g.position.set(x, kind === 'parakeet' ? canopyTop * 0.97 : hop, z);
      g.rotation.y = b.yaw + (reducedMotion ? 0 : Math.sin(t * 0.4 + b.phase) * 0.6);
      g.rotation.x = reducedMotion ? 0 : Math.max(0, Math.sin(t * 0.9 + b.phase) - 0.8) * 2.5;
    });
  });
  return (
    <group>
      {birds.map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <mesh geometry={parts.plumage} material={mats.plumage} castShadow />
          <mesh geometry={parts.beak} material={mats.beak} />
        </group>
      ))}
    </group>
  );
}
