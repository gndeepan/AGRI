import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../../prng';
import { sceneTime, useSceneSettings } from '../../quality';
import { useField } from '../FieldContext';
import { applyRig, BirdRig } from './BirdRig';
import { drongoPose, mynaPose, parakeetParams, parakeetPose, type BirdPose } from './birdBehavior';
import { buildPathRing, samplePath } from './farmerPath';
import { buildColored } from './geo';
import { createOrganicMaterial } from './organicMaterial';
import { useDevFrame } from './useDevFrame';

function useSlots(n: number) {
  return useMemo(() => Array.from({ length: n }, () => ({ current: null as BirdPose | null })), [n]);
}

/** Indian mynas strutting along the bund edge with a head-bob, pecking and hopping. */
export function Mynas({ count, seed }: { count: number; seed: number }) {
  const { shape } = useField();
  const { reducedMotion } = useSceneSettings();
  const ring = useMemo(() => buildPathRing(shape, 1.3), [shape]);
  const rnd = useMemo(() => { const r = mulberry32(seed * 17 + 3); return Array.from({ length: count }, () => ({ s0: r() * ring.length, speed: 0.7 + r() * 0.6, ph: r() * 10 })); }, [count, seed, ring]);
  const slots = useSlots(count);
  const groups = useRef<Array<THREE.Group | null>>([]);
  useDevFrame('__bhoomiFrameMyna', groups);
  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    rnd.forEach((p, i) => {
      slots[i]!.current = mynaPose((s) => samplePath(ring, s), p, t + p.ph);
      applyRig(groups.current[i] ?? null);
    });
  });
  return <group>{slots.map((slot, i) => <group key={i} ref={(el) => { groups.current[i] = el; }}><BirdRig species="myna" poseRef={slot} /></group>)}</group>;
}

/** Rose-ringed parakeets: fast loops over the field; they settle on grain heads as the crop ripens. */
export function Parakeets({ count, seed, canopyHeight, ripeness }: { count: number; seed: number; canopyHeight: number; ripeness: number }) {
  const { shape } = useField();
  const { reducedMotion } = useSceneSettings();
  const params = useMemo(() => Array.from({ length: count }, (_, i) => parakeetParams(seed * 7 + i, shape.center[0], shape.center[1], Math.min(shape.lengthM, shape.widthM) * 0.35, canopyHeight)), [count, seed, shape, canopyHeight]);
  const slots = useSlots(count);
  const groups = useRef<Array<THREE.Group | null>>([]);
  useDevFrame('__bhoomiFrameParakeet', groups);
  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    params.forEach((p, i) => {
      slots[i]!.current = parakeetPose(shape, p, ripeness, t + i * 2.3);
      if (import.meta.env.DEV) (window as unknown as { __bhoomiParakeets?: Array<BirdPose | null> }).__bhoomiParakeets = slots.map((sl) => sl.current);
      applyRig(groups.current[i] ?? null);
    });
  });
  return <group>{slots.map((slot, i) => <group key={i} ref={(el) => { groups.current[i] = el; }}><BirdRig species="parakeet" poseRef={slot} /></group>)}</group>;
}

/** A black drongo on a fence post at the bund corner, scanning and darting out after insects. */
export function Drongo({ seed }: { seed: number }) {
  const { shape } = useField();
  const { reducedMotion } = useSceneSettings();
  const post = useMemo(() => {
    const ring = buildPathRing(shape, 1.6);
    const q = samplePath(ring, ring.length * (0.15 + ((seed * 0.37) % 0.6)));
    return { x: q.x, z: q.z, top: 1.45, yaw: Math.atan2(q.inward[0], q.inward[1]) };
  }, [shape, seed]);
  // A weathered wooden post, slightly irregular.
  const geo = useMemo(() => buildColored([[new THREE.CylinderGeometry(0.035, 0.045, 1.45, 9, 4).translate(0, 0.725, 0), '#6a5236']], 'wood'), []);
  const mat = useMemo(() => createOrganicMaterial(), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const slot = useSlots(1)[0]!;
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    slot.current = drongoPose(post, seed, sceneTime(clock.elapsedTime, reducedMotion));
    applyRig(group.current);
  });
  return (
    <group>
      <mesh geometry={geo} material={mat} position={[post.x, 0, post.z]} castShadow />
      <group ref={group}><BirdRig species="drongo" poseRef={slot} /></group>
    </group>
  );
}
