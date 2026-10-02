import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../prng';
import { insideField } from '../fieldShape';
import { sceneTime, useSceneSettings } from '../quality';
import { useField } from './FieldContext';

interface WildlifeProps {
  /** 0..1 — how active daytime wildlife is (daylight × fair weather). */
  activity: number;
  canopyHeight: number;
  /** Egrets wade in standing water or short crop; they leave tall canopy alone. */
  wading: boolean;
  /** 0..1 open flowers in the crop: brings extra butterflies (non-paddy crops). */
  butterflies?: number;
}

/** Ambient, purely decorative wildlife. Hidden in rain and at night. */
export function Wildlife({ activity, canopyHeight, wading, butterflies = 0 }: WildlifeProps) {
  const { quality } = useSceneSettings();
  if (activity < 0.05) return null;
  const high = quality === 'high';
  return (
    <group>
      <Flyers kind="dragonfly" count={high ? 5 : 2} canopyHeight={canopyHeight} seed={1} />
      <Flyers kind="butterfly" count={(high ? 4 : 1) + Math.round(butterflies * (high ? 6 : 2))} canopyHeight={canopyHeight} seed={2} />
      <BirdFlock count={high ? 14 : 7} />
      {wading && canopyHeight < 0.6 && <Egrets count={high ? 5 : 3} canopyHeight={canopyHeight} />}
    </group>
  );
}

function wingGeometry(kind: 'dragonfly' | 'butterfly'): THREE.BufferGeometry {
  if (kind === 'dragonfly') {
    const g = new THREE.PlaneGeometry(0.14, 0.03);
    g.translate(0.07, 0, 0);
    return g;
  }
  const g = new THREE.CircleGeometry(0.045, 8);
  g.scale(1, 1.3, 1);
  g.translate(0.045, 0, 0);
  return g;
}

function Flyers({ kind, count, canopyHeight, seed }: { kind: 'dragonfly' | 'butterfly'; count: number; canopyHeight: number; seed: number }) {
  const { reducedMotion } = useSceneSettings();
  const { focus } = useField();
  const refs = useRef<Array<THREE.Group | null>>([]);
  const params = useMemo(() => {
    const rand = mulberry32(seed * 101);
    return Array.from({ length: count }, () => ({
      cx: (rand() - 0.5) * 16,
      cz: (rand() - 0.5) * 10,
      rx: 1.5 + rand() * 3,
      rz: 1 + rand() * 2.5,
      speed: 0.25 + rand() * 0.35,
      phase: rand() * Math.PI * 2,
    }));
  }, [count, seed]);

  const wing = useMemo(() => wingGeometry(kind), [kind]);
  const wingMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: kind === 'dragonfly' ? '#cfe6ff' : '#f2a33a',
      transparent: true,
      opacity: kind === 'dragonfly' ? 0.45 : 0.95,
      side: THREE.DoubleSide,
      roughness: 0.3,
    }),
    [kind],
  );
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: kind === 'dragonfly' ? '#2a6f8f' : '#3a2a1a' }), [kind]);
  useEffect(() => () => { wing.dispose(); wingMat.dispose(); bodyMat.dispose(); }, [wing, wingMat, bodyMat]);

  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    params.forEach((p, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = t * p.speed + p.phase;
      // Lissajous-like loops just above the canopy; dragonflies dart, butterflies bob.
      const dart = kind === 'dragonfly' ? Math.sin(a * 3.1) * 0.6 : 0;
      g.position.set(
        focus.x + p.cx * 0.5 + Math.sin(a) * p.rx + dart,
        canopyHeight + 0.35 + Math.sin(a * 2.3) * (kind === 'butterfly' ? 0.25 : 0.1),
        focus.y + p.cz * 0.5 + Math.sin(a * 1.7) * p.rz,
      );
      g.rotation.y = -a + Math.PI / 2;
      const flap = Math.sin(t * (kind === 'dragonfly' ? 60 : 14) + p.phase) * (kind === 'dragonfly' ? 0.25 : 0.9);
      const left = g.children[1];
      const right = g.children[2];
      if (left) left.rotation.x = flap;
      if (right) right.rotation.x = -flap;
    });
  });

  return (
    <group>
      {params.map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <mesh material={bodyMat} rotation-z={Math.PI / 2}>
            <capsuleGeometry args={[0.008, kind === 'dragonfly' ? 0.1 : 0.03, 2, 4]} />
          </mesh>
          <mesh geometry={wing} material={wingMat} rotation-y={Math.PI / 2} />
          <mesh geometry={wing} material={wingMat} rotation-y={-Math.PI / 2} />
        </group>
      ))}
    </group>
  );
}

/** A distant flock of egrets/birds drifting across the sky as simple flapping chevrons. */
function BirdFlock({ count }: { count: number }) {
  const { reducedMotion } = useSceneSettings();
  const { shape } = useField();
  const { mesh, offsets } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -0.6, 0.15, -0.25, -0.1, 0, 0.05,
      0, 0, 0, 0.1, 0, 0.05, 0.6, 0.15, -0.25,
    ], 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: '#f4f1ea', side: THREE.DoubleSide, fog: true });
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.frustumCulled = false;
    const rand = mulberry32(404);
    const offs = Array.from({ length: count }, (_, i) => ({
      x: (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 1.6 + rand() * 0.5,
      y: rand() * 1.2,
      z: Math.ceil(i / 2) * 1.4 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
    }));
    return { mesh: im, offsets: offs };
  }, [count]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }, [mesh]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion) + 20;
    // Loop across the sky every ~90 s.
    const span = 360;
    const lead = ((t * 4) % span) - span / 2;
    offsets.forEach((o, i) => {
      const flap = 0.6 + Math.sin(t * 5 + o.phase) * 0.45;
      v.set(shape.center[0] + lead + o.x, 32 + o.y + Math.sin(t * 0.3 + i) * 0.5, shape.center[1] - 120 - shape.radius + o.z);
      s.set(1.4, flap * 1.4, 1.4);
      m.compose(v, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

/** Cattle egret built from a few primitives, merged per material. ~0.5 m tall. */
function useEgretParts() {
  return useMemo(() => {
    const body = new THREE.SphereGeometry(0.09, 10, 8);
    body.scale(1, 0.85, 1.7);
    body.translate(0, 0.3, 0);
    const neck = new THREE.CylinderGeometry(0.022, 0.03, 0.2, 6);
    neck.rotateX(-0.5);
    neck.translate(0, 0.42, 0.11);
    const head = new THREE.SphereGeometry(0.038, 8, 6);
    head.translate(0, 0.52, 0.17);
    const tail = new THREE.ConeGeometry(0.05, 0.14, 6);
    tail.rotateX(Math.PI / 2 + 0.4);
    tail.translate(0, 0.29, -0.17);
    const white = mergeAll([body, neck, head, tail]);
    const beak = new THREE.ConeGeometry(0.012, 0.08, 5);
    beak.rotateX(Math.PI / 2);
    beak.translate(0, 0.515, 0.23);
    const legL = new THREE.CylinderGeometry(0.006, 0.006, 0.26, 4);
    legL.translate(0.03, 0.13, 0);
    const legR = legL.clone();
    legR.translate(-0.06, 0, 0);
    const dark = mergeAll([legL, legR]);
    return { white, beak, dark };
  }, []);
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  parts.forEach((g) => { g.deleteAttribute('uv'); });
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  list.forEach((g) => g.dispose());
  return merged;
}

function Egrets({ count, canopyHeight }: { count: number; canopyHeight: number }) {
  const { reducedMotion } = useSceneSettings();
  const { shape, focus, waterY } = useField();
  const parts = useEgretParts();
  const mats = useMemo(() => ({
    white: new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.75 }),
    beak: new THREE.MeshStandardMaterial({ color: '#e0a23a', roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#3b3a30', roughness: 0.8 }),
  }), []);
  useEffect(() => () => {
    Object.values(parts).forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => m.dispose());
  }, [parts, mats]);
  const birds = useMemo(() => {
    const rand = mulberry32(2718);
    return Array.from({ length: count }, () => ({ ang: rand() * Math.PI * 2, r: 3 + rand() * 7, yaw: rand() * Math.PI * 2, phase: rand() * 10 }));
  }, [count]);
  const refs = useRef<Array<THREE.Group | null>>([]);
  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    birds.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const x = focus.x + Math.cos(b.ang) * b.r;
      const z = focus.y + Math.sin(b.ang) * b.r;
      g.visible = insideField(shape, x, z);
      // Slow wading steps and the occasional peck at the water.
      const walk = reducedMotion ? 0 : t * 0.05;
      g.position.set(x + Math.cos(b.yaw) * walk % 1.5, Math.max(waterY.value - 0.04, 0) + canopyHeight * 0.1, z + Math.sin(b.yaw) * walk % 1.5);
      g.rotation.y = b.yaw;
      const peck = reducedMotion ? 0 : Math.max(0, Math.sin(t * 0.8 + b.phase) - 0.85) * 4;
      g.rotation.x = peck * 0.6;
    });
  });
  return (
    <group>
      {birds.map((_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <mesh geometry={parts.white} material={mats.white} castShadow />
          <mesh geometry={parts.beak} material={mats.beak} />
          <mesh geometry={parts.dark} material={mats.dark} />
        </group>
      ))}
    </group>
  );
}
