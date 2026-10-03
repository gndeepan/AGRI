import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { birdGeos, type Species } from './birdSpecs';
import type { BirdPose } from './birdBehavior';

/** Shared materials, one pair for every bird in the scene. */
const makeMats = () => ({
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
  wing: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
});

export interface BirdHandle {
  apply: (pose: BirdPose) => void;
}

/**
 * One articulated bird: body, S-neck with head and bill, two wings, two legs and a tail.
 * `poseRef.current` is written each frame by the owner; the rig only maps a pose onto its joints.
 */
export function BirdRig({ species, scale = 1, poseRef }: { species: Species; scale?: number; poseRef: React.MutableRefObject<BirdPose | null> }) {
  const geos = useMemo(() => birdGeos(species), [species]);
  const mats = useMemo(makeMats, []);
  useEffect(() => () => {
    Object.values(geos).forEach((g) => { if (g instanceof THREE.BufferGeometry) g.dispose(); });
    Object.values(mats).forEach((m) => m.dispose());
  }, [geos, mats]);

  const root = useRef<THREE.Group>(null);
  const neck = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Group>(null);
  const wingR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);

  // Imperative pose update, called by the owner's useFrame through the ref's `current` pose.
  useEffect(() => {
    const handle = root.current as (THREE.Group & { __apply?: () => void }) | null;
    if (!handle) return;
    handle.__apply = () => {
      const p = poseRef.current;
      if (!p) return;
      handle.position.set(p.x, p.y + geos.hipY * scale * (p.legsTucked ? 0.55 : 1), p.z);
      handle.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
      const n = neck.current;
      if (n) {
        n.rotation.x = p.neckDrop - 0.35 * (1 - Math.min(1, p.neck));
        n.scale.set(1, 0.55 + 0.6 * Math.min(1.1, p.neck), 0.6 + 0.7 * Math.min(1.1, p.neck));
      }
      const f = Math.sin(p.flap) * p.flapAmp;
      const spread = p.flapAmp > 0.02 ? 0 : -1.25; // folded against the body when not flying
      if (wingL.current) wingL.current.rotation.z = spread * -1 + f * 0.9;
      if (wingR.current) wingR.current.rotation.z = -(spread * -1 + f * 0.9);
      const g = Math.sin(p.gait) * 0.5 * p.gaitAmp;
      if (legL.current) legL.current.rotation.x = p.legsTucked ? 1.3 : g;
      if (legR.current) legR.current.rotation.x = p.legsTucked ? 1.3 : -g;
      if (tail.current) tail.current.rotation.x = 0.1 + (p.flapAmp > 0.5 ? 0.1 : 0) + Math.sin(p.flap * 0.2) * 0.02;
    };
  }, [geos, poseRef, scale]);

  const w = geos.wingPivot;
  return (
    <group ref={root} scale={scale} userData={{ isBird: true }}>
      <mesh geometry={geos.body} material={mats.body} castShadow />
      <group ref={neck} position={geos.neckPivot}>
        <mesh geometry={geos.neck} material={mats.body} castShadow />
      </group>
      <group ref={wingL} position={[w[0], w[1], w[2]]}>
        <mesh geometry={geos.wing} material={mats.wing} />
      </group>
      <group ref={wingR} position={[-w[0], w[1], w[2]]} scale={[-1, 1, 1]}>
        <mesh geometry={geos.wing} material={mats.wing} />
      </group>
      <group ref={legL} position={geos.legPivot}>
        <mesh geometry={geos.leg} material={mats.body} />
      </group>
      <group ref={legR} position={[-geos.legPivot[0], geos.legPivot[1], geos.legPivot[2]]}>
        <mesh geometry={geos.leg} material={mats.body} />
      </group>
      <group ref={tail} position={geos.tailPivot}>
        <mesh geometry={geos.tail} material={mats.body} />
      </group>
    </group>
  );
}

/** Calls the rig's pose-application hook (set up in BirdRig) on a Group ref's first child. */
export function applyRig(group: THREE.Object3D | null) {
  const rig = group?.children[0] as (THREE.Group & { __apply?: () => void }) | undefined;
  rig?.__apply?.();
}
