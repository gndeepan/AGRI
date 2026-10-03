import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { sceneTime, useSceneSettings } from '../../quality';
import { useField } from '../FieldContext';
import { applyRig, BirdRig } from './BirdRig';
import { egretPose, waderParams, type BirdPose } from './birdBehavior';

/** Cattle egrets foraging in the paddy: wading, stalking, striking, resting, and the odd take-off and glide. */
export function Egrets({ count, seed }: { count: number; seed: number }) {
  const { shape, focus, waterY } = useField();
  const { reducedMotion } = useSceneSettings();
  const params = useMemo(
    () => Array.from({ length: count }, (_, i) => {
      // Spread the birds over the field so a flock covers it rather than clumping.
      const a = (i / count) * Math.PI * 2 + seed;
      const r = Math.min(shape.lengthM, shape.widthM) * 0.28;
      return waderParams(seed * 31 + i, shape.center[0] + Math.cos(a) * r, shape.center[1] + Math.sin(a) * r, Math.min(7, r * 0.7));
    }),
    [count, seed, shape],
  );
  const poses = useRef<Array<{ current: BirdPose | null }>>([]);
  const groups = useRef<Array<THREE.Group | null>>([]);
  const camera = useThree((st) => st.camera);
  const controls = useThree((st) => st.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  // Dev-only: __bhoomiFrameEgret(index, dist, height, azimuthDeg) puts the camera beside one bird.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bhoomiFrameEgret = (i = 0, dist = 1.6, height = 0.5, az = 40) => {
      const g = groups.current[i];
      if (!g || !controls) return;
      const a = g.children[0]!.rotation.y + (az * Math.PI) / 180;
      const pos = g.children[0]!.position;
      camera.position.set(pos.x + Math.sin(a) * dist, pos.y + height, pos.z + Math.cos(a) * dist);
      controls.target.set(pos.x, pos.y + 0.2, pos.z);
      controls.update();
    };
    return () => { delete w.__bhoomiFrameEgret; };
  }, [camera, controls]);
  const slots = useMemo(() => params.map(() => ({ current: null as BirdPose | null })), [params]);
  poses.current = slots;

  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion) + 40;
    params.forEach((p, i) => {
      const slot = slots[i]!;
      const pin = import.meta.env.DEV ? (window as unknown as { __bhoomiEgretT?: number }).__bhoomiEgretT : undefined;
      slot.current = egretPose(shape, p, Math.max(waterY.value - 0.02, 0), typeof pin === 'number' ? pin + i * 3 : t + i * 3);
      // Birds far from the focus patch are cheap to skip rendering of: the mesh is tiny and beyond ~60 m.
      const g = groups.current[i];
      if (g) g.visible = Math.hypot(slot.current.x - focus.x, slot.current.z - focus.y) < 90;
      applyRig(g);
    });
  });

  return (
    <group>
      {slots.map((slot, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el; }}>
          <BirdRig species="egret" poseRef={slot} />
        </group>
      ))}
    </group>
  );
}
