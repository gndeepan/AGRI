import { useFrame } from '@react-three/fiber';
import { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { hillsAround, insideField } from '../fieldShape';
import { mulberry32 } from '../prng';
import { sceneTime, useSceneSettings } from '../quality';
import { useField } from '../scene/FieldContext';
import type { BirdPose } from '../scene/wildlife/birdBehavior';
import { applyRig, BirdRig } from '../scene/wildlife/BirdRig';
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

/** Standing at the rig's origin, wings folded, legs down; the owning group places and turns the bird. */
function perchPose(): BirdPose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, neck: 0.6, neckDrop: 0, flap: 0, flapAmp: 0, gait: 0, gaitAmp: 0, legsTucked: false, state: 'perch' };
}

function PerchedBirds({ spec, canopyTop }: { spec: CropSpec; canopyTop: number }) {
  const kind = spec.birds;
  const { quality, reducedMotion } = useSceneSettings();
  const { shape, focus } = useField();
  const count = quality === 'high' ? 6 : 3;
  // One fixed pose per bird (perched, wings folded); the group moves and turns it.
  const poses = useMemo(() => Array.from({ length: count }, () => ({ current: perchPose() })), [count]);
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
      // Pecking and looking around: neck drops briefly, head turns with the body.
      const pose = poses[i]!.current;
      pose.neckDrop = reducedMotion ? 0 : Math.max(0, Math.sin(t * 1.7 + b.phase * 3) - 0.6) * 1.6;
      applyRig(g);
    });
  });
  return (
    <group>
      {birds.map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <BirdRig species={kind} poseRef={poses[i]!} />
        </group>
      ))}
    </group>
  );
}
