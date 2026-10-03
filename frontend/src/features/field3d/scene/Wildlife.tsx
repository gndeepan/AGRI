import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../prng';
import { sceneTime, useSceneSettings } from '../quality';
import { useField } from './FieldContext';
import { butterflyWingTexture } from './wildlife/insectTextures';

interface WildlifeProps {
  /** 0..1 — how active daytime wildlife is (daylight × fair weather). */
  activity: number;
  canopyHeight: number;
  /** 0..1 open flowers in the crop: brings extra butterflies (non-paddy crops). */
  butterflies?: number;
}

/** Ambient, purely decorative wildlife. Hidden in rain and at night. */
export function Wildlife({ activity, canopyHeight, butterflies = 0 }: WildlifeProps) {
  const { quality } = useSceneSettings();
  if (activity < 0.05) return null;
  const high = quality === 'high';
  return (
    <group>
      <Flyers kind="dragonfly" count={high ? 5 : 2} canopyHeight={canopyHeight} seed={1} />
      <Flyers kind="butterfly" count={(high ? 4 : 1) + Math.round(butterflies * (high ? 6 : 2))} canopyHeight={canopyHeight} seed={2} />
      <BirdFlock count={high ? 14 : 7} />
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
  // Butterflies get a procedural wing pattern (crow / lime / grass-yellow by seed); dragonfly wings stay glassy.
  const wingTex = useMemo(() => (kind === 'butterfly' ? butterflyWingTexture(seed % 3 === 0 ? 'crow' : seed % 3 === 1 ? 'lime' : 'grass') : null), [kind, seed]);
  const wingMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: kind === 'dragonfly' ? '#cfe6ff' : '#ffffff',
      map: wingTex,
      alphaTest: wingTex ? 0.4 : 0,
      transparent: kind === 'dragonfly',
      opacity: kind === 'dragonfly' ? 0.45 : 1,
      side: THREE.DoubleSide,
      roughness: 0.3,
    }),
    [kind, wingTex],
  );
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: kind === 'dragonfly' ? '#2a6f8f' : '#3a2a1a' }), [kind]);
  useEffect(() => () => { wing.dispose(); wingMat.dispose(); bodyMat.dispose(); wingTex?.dispose(); }, [wing, wingMat, bodyMat, wingTex]);

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
