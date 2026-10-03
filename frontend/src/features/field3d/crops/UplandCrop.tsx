import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { hillsAround, nearestPointInside, type Hill } from '../fieldShape';
import { damp, sceneTime, useSceneSettings, type ResolvedQuality } from '../quality';
import { createCanopyGeometry, createCanopyMaterial } from '../scene/canopyMaterial';
import { useField } from '../scene/FieldContext';
import { setSrgb } from '../scene/plantMaterials';
import { shedsLeaves, type CropVisual } from './cropGrowth';
import { createCropMaterials } from './material';
import { buildPlant } from './plants';
import type { CropSpec } from './specs';
import { applyCanopy } from './UplandGround';

/** Vertex budgets per tier: detailed plants near the camera, simpler ones further out. */
const BUDGET: Record<ResolvedQuality, { near: number; mid: number; maxNear: number; maxMid: number }> = {
  high: { near: 2_400_000, mid: 3_000_000, maxNear: 5000, maxMid: 26000 },
  low: { near: 600_000, mid: 800_000, maxNear: 1400, maxMid: 8000 },
};

export interface UplandLod {
  r0: number;
  r1: number;
  near: number;
  mid: number;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, depth: THREE.Material, capacity: number) {
  const geo = geometry.clone();
  const rand = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 4), 4);
  rand.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aRand', rand);
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, capacity));
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.customDepthMaterial = depth;
  mesh.frustumCulled = false;
  mesh.count = 0;
  return { mesh, rand };
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

function fill(target: ReturnType<typeof instanced>, hills: Hill[], baseY: number, facing: number | null) {
  const n = Math.min(hills.length, target.mesh.instanceMatrix.count);
  const arr = target.rand.array as Float32Array;
  for (let i = 0; i < n; i++) {
    const h = hills[i]!;
    // Sunflowers all face east; everything else is randomly turned.
    const yaw = facing ?? h.r3 * Math.PI * 2 + h.r1 * 3;
    q.setFromAxisAngle(up, yaw + (facing != null ? (h.r3 - 0.5) * 0.5 : 0));
    m4.compose(pos.set(h.x, baseY, h.z), q, scl.set(1, 1, 1));
    target.mesh.setMatrixAt(i, m4);
    arr[i * 4] = 0.86 + 0.26 * ((h.r1 * 7.13 + h.r2) % 1);
    arr[i * 4 + 1] = (h.r2 * 5.71 + h.r4) % 1;
    arr[i * 4 + 2] = h.r3;
    arr[i * 4 + 3] = h.r4;
  }
  target.mesh.count = n;
  target.mesh.instanceMatrix.needsUpdate = true;
  target.rand.needsUpdate = true;
}

/** Splits hills between geometry variants by a stable per-hill random. */
function split(hills: Hill[], parts: number): Hill[][] {
  const out: Hill[][] = Array.from({ length: parts }, () => []);
  for (const h of hills) out[Math.min(parts - 1, Math.floor(((h.r1 * 13.7) % 1) * parts))]!.push(h);
  return out;
}

interface UplandCropProps {
  spec: CropSpec;
  visual: CropVisual;
  windStrength: number;
  windDirection: THREE.Vector2;
  wet: number;
  onPatch: (patch: [number, number], lod: UplandLod) => void;
}

export function UplandCrop({ spec, visual, windStrength, windDirection, wet, onPatch }: UplandCropProps) {
  const { quality, reducedMotion } = useSceneSettings();
  const high = quality === 'high';
  const { shape, wind, focus } = useField();

  const variants = useMemo(() => {
    const near = [0, 1, 2].map((i) => buildPlant(spec, 'near', 1000 + i * 37));
    const mid = [0, 1].map((i) => buildPlant(spec, 'mid', 2000 + i * 53));
    return { near, mid };
  }, [spec]);

  const lod = useMemo<UplandLod>(() => {
    const b = BUDGET[quality];
    const vNear = variants.near.reduce((a, g) => a + g.getAttribute('position').count, 0) / variants.near.length;
    const vMid = variants.mid.reduce((a, g) => a + g.getAttribute('position').count, 0) / variants.mid.length;
    const near = Math.max(30, Math.min(b.maxNear, Math.floor(b.near / vNear)));
    const mid = Math.max(60, Math.min(b.maxMid, Math.floor(b.mid / vMid)));
    const per = spec.rowM * spec.plantM;
    const r0 = Math.max(2, Math.min(60, Math.sqrt((near * per) / Math.PI)));
    const r1 = Math.max(r0 + 2, Math.min(140, Math.sqrt(((near + mid) * per) / Math.PI)));
    return { r0, r1, near, mid };
  }, [quality, variants, spec]);

  const mats = useMemo(() => createCropMaterials(wind), [wind]);
  const canopy = useMemo(() => createCanopyMaterial(wind), [wind]);
  const canopyGeo = useMemo(() => createCanopyGeometry(shape), [shape]);

  const meshes = useMemo(() => {
    const near = variants.near.map((g) => instanced(g, mats.material, mats.depth, lod.near));
    const mid = variants.mid.map((g) => instanced(g, mats.material, mats.depth, lod.mid));
    near.forEach((m) => { m.mesh.castShadow = high; m.mesh.receiveShadow = high; });
    mid.forEach((m) => { m.mesh.receiveShadow = high; });
    return { near, mid };
  }, [variants, mats, lod, high]);

  const [patch, setPatch] = useState<[number, number]>(() => nearestPointInside(shape, shape.center[0], shape.center[1]));
  useEffect(() => setPatch(nearestPointInside(shape, shape.center[0], shape.center[1])), [shape]);

  const baseY = spec.ground.kind === 'flat' ? 0 : spec.ground.heightM;
  useEffect(() => {
    const h0 = hillsAround(shape, patch, 0, lod.r0, lod.near, spec.rowM, spec.plantM);
    const h1 = hillsAround(shape, patch, lod.r0, lod.r1, lod.mid, spec.rowM, spec.plantM);
    const facing = spec.facing === 'east' ? 0 : null;
    split(h0, meshes.near.length).forEach((hs, i) => fill(meshes.near[i]!, hs, baseY, facing));
    split(h1, meshes.mid.length).forEach((hs, i) => fill(meshes.mid[i]!, hs, baseY, facing));
    focus.set(patch[0], patch[1]);
    const u = mats.uniforms;
    u.uPatchCenter.value.set(patch[0], patch[1]);
    u.uFadeStart.value = lod.r1 * 0.6;
    u.uFadeEnd.value = lod.r1 * 0.98;
    canopy.uniforms.uPatchCenter.value.set(patch[0], patch[1]);
    canopy.uniforms.uFadeStart.value = lod.r1 * 0.6;
    canopy.uniforms.uFadeEnd.value = lod.r1 * 0.98;
    onPatch(patch, lod);
  }, [shape, patch, lod, meshes, spec, baseY, focus, mats, canopy, onPatch]);

  useEffect(() => {
    const u = canopy.uniforms;
    u.uRowDir.value.set(Math.cos(shape.rowAngle), Math.sin(shape.rowAngle));
    u.uOrigin.value.set(shape.center[0], shape.center[1]);
    u.uSpacing.value.set(spec.plantM, spec.rowM);
    u.uWaterVis.value = 0;
    mats.uniforms.uStiff.value = spec.stiffness;
    mats.uniforms.uShed.value = shedsLeaves(spec.profile) ? 1 : 0;
    // Cotton bolls burst open into lint, so they swell as they ripen.
    mats.uniforms.uRipeSwell.value = spec.model === 'cotton' ? 0.55 : 0;
    setSrgb(mats.uniforms.uLeafDead.value, spec.colors.leafDead);
    setSrgb(mats.uniforms.uStemRipe.value, spec.colors.stemRipe);
  }, [canopy, shape, spec, mats]);

  useEffect(() => () => {
    [...meshes.near, ...meshes.mid].forEach((m) => m.mesh.geometry.dispose());
  }, [meshes]);
  useEffect(() => () => { [...variants.near, ...variants.mid].forEach((g) => g.dispose()); }, [variants]);
  useEffect(() => () => { mats.material.dispose(); mats.depth.dispose(); canopy.material.dispose(); }, [mats, canopy]);
  useEffect(() => () => canopyGeo.dispose(), [canopyGeo]);

  const lastCheck = useRef(0);
  const leaf = useMemo(() => new THREE.Color(), []);
  useFrame((state, dt) => {
    const step = Math.min(dt, 0.1);
    const k = reducedMotion ? 1 : 1 - Math.exp(-6 * step);
    wind.uTime.value = sceneTime(state.clock.elapsedTime, reducedMotion);
    wind.uWind.value = reducedMotion ? windStrength : damp(wind.uWind.value, windStrength, 1.5, step);
    wind.uWindDir.value.lerp(windDirection, reducedMotion ? 1 : 0.05).normalize();

    if (state.clock.elapsedTime - lastCheck.current > 0.25) {
      lastCheck.current = state.clock.elapsedTime;
      const cam = state.camera.position;
      const controls = state.controls as unknown as { target?: THREE.Vector3 } | null;
      const tx = controls?.target?.x ?? shape.center[0];
      const tz = controls?.target?.z ?? shape.center[1];
      const dx = tx - cam.x;
      const dz = tz - cam.z;
      const dist = Math.hypot(dx, dz) || 1;
      const ahead = Math.min(dist, lod.r1 * 0.45 + Math.max(0, cam.y) * 0.4);
      const want = nearestPointInside(shape, cam.x + (dx / dist) * ahead, cam.z + (dz / dist) * ahead, lod.r0 * 0.4);
      if (Math.hypot(want[0] - patch[0], want[1] - patch[1]) > lod.r1 * 0.2) setPatch(want);
    }

    const u = mats.uniforms;
    const ease = (cur: number, target: number) => cur + (target - cur) * k;
    u.uScale.value = ease(u.uScale.value, visual.scale);
    u.uLeaves.value = ease(u.uLeaves.value, visual.leaves);
    u.uSen.value = ease(u.uSen.value, visual.senescence);
    u.uFlower.value = ease(u.uFlower.value, visual.flower);
    u.uFlowerDrop.value = ease(u.uFlowerDrop.value, visual.flowerDrop);
    u.uFruit.value = ease(u.uFruit.value, visual.fruit);
    u.uFruitSize.value = ease(u.uFruitSize.value, visual.fruitSize);
    u.uRipe.value = ease(u.uRipe.value, visual.ripe);
    u.uHead.value = ease(u.uHead.value, visual.head);
    u.uDroop.value = ease(u.uDroop.value, visual.droop);
    u.uPresence.value = ease(u.uPresence.value, visual.presence);
    u.uWet.value = ease(u.uWet.value, wet);
    setSrgb(leaf, visual.leafColor);
    u.uLeafColor.value.lerp(leaf, k);

    applyCanopy(canopy.uniforms, spec, { ...visual, scale: u.uScale.value, presence: u.uPresence.value }, 1, 1);
    canopy.uniforms.uWet.value = u.uWet.value;
  });

  return (
    <group>
      {meshes.near.map((m, i) => <primitive key={`n${i}`} object={m.mesh} />)}
      {meshes.mid.map((m, i) => <primitive key={`m${i}`} object={m.mesh} />)}
      <mesh geometry={canopyGeo} material={canopy.material} receiveShadow={high} position-y={baseY * 0.5} />
    </group>
  );
}
