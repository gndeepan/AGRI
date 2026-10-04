import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { HILL_SPACING_M, hillsAround, nearestPointInside, ROW_SPACING_M, type Hill } from '../fieldShape';
import { MAX_TILLERS, type GrowthParams } from '../growth';
import { damp, sceneTime, useSceneSettings } from '../quality';
import { CANOPY_RENDER_ORDER, createCanopyGeometry, createCanopyMaterial } from './canopyMaterial';
import { lodFor, useField } from './FieldContext';
import { createBladeMaterials, createPanicleMaterials, setSrgb } from './plantMaterials';
import { createClumpGeometry, createPanicleGeometry } from './riceGeometry';
import { createLeafTexture } from './textures';

interface CropProps {
  growth: GrowthParams;
  windStrength: number;
  windDirection: THREE.Vector2;
  /** 0..1 surface wetness (rain, dew). */
  wet: number;
  /** 0..1 how much anthesis (open florets) to show. */
  anthesis: number;
}

const frac = (v: number) => v - Math.floor(v);

/** An InstancedMesh with a fixed capacity whose instances are rewritten when the patch moves. */
function makeInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, depth: THREE.Material, capacity: number, tier = 0) {
  const geo = geometry.clone();
  geo.setAttribute('aTier', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count).fill(tier), 1));
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

function fill(target: { mesh: THREE.InstancedMesh; rand: THREE.InstancedBufferAttribute }, hills: Hill[]) {
  const n = Math.min(hills.length, target.mesh.instanceMatrix.count);
  const arr = target.rand.array as Float32Array;
  for (let i = 0; i < n; i++) {
    const h = hills[i]!;
    q.setFromAxisAngle(up, h.r3 * Math.PI * 2 + h.r1 * 3);
    const s = 0.88 + h.r4 * 0.24;
    m4.compose(pos.set(h.x, 0, h.z), q, scl.set(s, 1, s));
    target.mesh.setMatrixAt(i, m4);
    arr[i * 4] = 0.84 + 0.3 * frac(h.r1 * 7.13 + h.r2);
    arr[i * 4 + 1] = frac(h.r2 * 5.71 + h.r4);
    arr[i * 4 + 2] = h.r3;
    arr[i * 4 + 3] = h.r4;
  }
  target.mesh.count = n;
  target.mesh.instanceMatrix.needsUpdate = true;
  target.rand.needsUpdate = true;
}

/** The farmer's crop: detailed hills near the camera, a canopy surface for the rest of the field. */
export function Crop({ growth, windStrength, windDirection, wet, anthesis }: CropProps) {
  const { quality, reducedMotion } = useSceneSettings();
  const high = quality === 'high';
  const { shape, wind, focus, waterY } = useField();
  const lod = useMemo(() => lodFor(quality), [quality]);

  const [patch, setPatch] = useState<[number, number]>(() => nearestPointInside(shape, shape.center[0], shape.center[1]));
  useEffect(() => setPatch(nearestPointInside(shape, shape.center[0], shape.center[1])), [shape]);
  // The far tier follows the camera more coarsely (it is large and costly to rebuild).
  const [farPatch, setFarPatch] = useState<[number, number]>(() => nearestPointInside(shape, shape.center[0], shape.center[1]));
  useEffect(() => setFarPatch(nearestPointInside(shape, shape.center[0], shape.center[1])), [shape]);
  // Radius the far budget covers at the transplanting density, plus the detailed rings it surrounds.
  const rFar = useMemo(() => Math.sqrt((lod.budget2 * ROW_SPACING_M * HILL_SPACING_M) / Math.PI + lod.r1 * lod.r1), [lod]);

  const leafTex = useMemo(() => createLeafTexture(), []);
  const blades = useMemo(() => createBladeMaterials(wind, leafTex), [wind, leafTex]);
  const panicles = useMemo(() => createPanicleMaterials(wind), [wind]);
  const canopy = useMemo(() => createCanopyMaterial(wind), [wind]);
  const canopyGeo = useMemo(() => createCanopyGeometry(shape), [shape]);

  const meshes = useMemo(() => {
    const clump0 = createClumpGeometry({ blades: high ? MAX_TILLERS : 8, segments: high ? 7 : 5, folded: high, seed: 7 });
    const clump1 = createClumpGeometry({ blades: high ? 7 : 5, segments: high ? 4 : 3, folded: false, seed: 8 });
    const panD = createPanicleGeometry({ panicles: 4, branches: 6, grainsPerBranch: 4, seed: 11 });
    const panS = createPanicleGeometry({ panicles: 3, branches: 0, grainsPerBranch: high ? 8 : 6, seed: 12 });
    const clump2 = createClumpGeometry({ blades: 4, segments: 2, folded: false, seed: 9 });
    const panF = createPanicleGeometry({ panicles: 1, branches: 0, grainsPerBranch: 3, seed: 13 });
    const out = {
      blade0: makeInstanced(clump0, blades.material, blades.depth, lod.budget0),
      blade1: makeInstanced(clump1, blades.material, blades.depth, lod.budget1),
      panD: makeInstanced(panD, panicles.material, panicles.depth, lod.panicleR > 0 ? lod.budget0 : 1),
      panS: makeInstanced(panS, panicles.material, panicles.depth, lod.budget0 + lod.budget1),
      blade2: makeInstanced(clump2, blades.material, blades.depth, lod.budget2, 1),
      panF: makeInstanced(panF, panicles.material, panicles.depth, lod.budget2, 1),
    };
    [clump0, clump1, panD, panS, clump2, panF].forEach((g) => g.dispose());
    out.blade0.mesh.castShadow = high;
    out.blade0.mesh.receiveShadow = high;
    out.blade1.mesh.receiveShadow = high;
    out.panD.mesh.castShadow = high;
    return out;
  }, [high, lod, blades, panicles]);

  // Rebuild the instance lists only when the patch moves.
  useEffect(() => {
    const h0 = hillsAround(shape, patch, 0, lod.r0, lod.budget0);
    const h1 = hillsAround(shape, patch, lod.r0, lod.r1, lod.budget1);
    fill(meshes.blade0, h0);
    fill(meshes.blade1, h1);
    const detailed = lod.panicleR > 0 ? h0.filter((h) => h.d < lod.panicleR) : [];
    const simple = (lod.panicleR > 0 ? h0.filter((h) => h.d >= lod.panicleR) : h0).concat(h1);
    fill(meshes.panD, detailed);
    fill(meshes.panS, simple);
    focus.set(patch[0], patch[1]);
    // Far-tier hills inside the detailed rings are drawn by those rings (same hills, same places).
    for (const u of [blades.uniforms, panicles.uniforms]) u.uInner.value.set(patch[0], patch[1], lod.r1);
  }, [shape, patch, lod, meshes, blades, panicles, focus]);

  useEffect(() => {
    const far = hillsAround(shape, farPatch, 0, rFar, lod.budget2);
    fill(meshes.blade2, far);
    fill(meshes.panF, far);
    for (const u of [blades.uniforms, panicles.uniforms, canopy.uniforms]) {
      u.uPatchCenter.value.set(farPatch[0], farPatch[1]);
      // A wide, gradual cross-fade (half the radius) so real plants thin out into the canopy surface
    // with no visible edge.
      u.uFadeStart.value = rFar * 0.5;
      u.uFadeEnd.value = rFar * 0.98;
    }
  }, [shape, farPatch, rFar, lod, meshes, blades, panicles, canopy]);

  useEffect(() => {
    canopy.uniforms.uRowDir.value.set(Math.cos(shape.rowAngle), Math.sin(shape.rowAngle));
    canopy.uniforms.uOrigin.value.set(shape.center[0], shape.center[1]);
  }, [shape, canopy]);

  useEffect(() => () => {
    for (const m of Object.values(meshes)) m.mesh.geometry.dispose();
  }, [meshes]);
  useEffect(() => () => {
    blades.material.dispose(); blades.depth.dispose(); panicles.material.dispose(); panicles.depth.dispose();
    canopy.material.dispose(); leafTex.dispose();
  }, [blades, panicles, canopy, leafTex]);
  useEffect(() => () => canopyGeo.dispose(), [canopyGeo]);

  const lastCheck = useRef(0);
  useFrame((state, dt) => {
    const step = Math.min(dt, 0.1);
    const k = reducedMotion ? 1 : 1 - Math.exp(-6 * step);
    // Seedlings and short tillers cast almost no visible shadow: skip re-drawing them into the
    // shadow map (the near clumps alone are ~0.9 M triangles) until the canopy is worth shadowing.
    meshes.blade0.mesh.castShadow = high && growth.heightM * growth.presence > 0.4;
    meshes.panD.mesh.castShadow = high && growth.panicleEmergence > 0.15;
    wind.uTime.value = sceneTime(state.clock.elapsedTime, reducedMotion);
    wind.uWind.value = reducedMotion ? windStrength : damp(wind.uWind.value, windStrength, 1.5, step);
    wind.uWindDir.value.lerp(windDirection, reducedMotion ? 1 : 0.05).normalize();

    // Keep the detailed patch on the camera's side of the field.
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
      // Keep the detailed rings well inside the far tier (they must not reach its fade).
      if (Math.hypot(want[0] - farPatch[0], want[1] - farPatch[1]) > rFar * 0.25) setFarPatch(want);
    }

    const b = blades.uniforms;
    b.uHeight.value += (growth.heightM - b.uHeight.value) * k;
    b.uTillers.value += (growth.tillers / MAX_TILLERS - b.uTillers.value) * k;
    b.uPresence.value += (growth.presence - b.uPresence.value) * k;
    b.uStubble.value += (growth.stubble - b.uStubble.value) * k;
    b.uSenescence.value += (growth.senescence - b.uSenescence.value) * k;
    b.uWet.value += (wet - b.uWet.value) * k;
    lerpColor(b.uBaseColor.value, growth.leafColor, k);
    lerpColor(b.uTipColor.value, growth.leafTipColor, k);

    const p = panicles.uniforms;
    p.uHeight.value = b.uHeight.value;
    p.uPresence.value = b.uPresence.value;
    p.uWet.value = b.uWet.value;
    p.uEmerge.value += (growth.panicleEmergence - p.uEmerge.value) * k;
    p.uDroop.value += (growth.panicleDroop - p.uDroop.value) * k;
    p.uAnthesis.value += (anthesis - p.uAnthesis.value) * k;
    lerpColor(p.uPanicleColor.value, growth.panicleColor, k);
    const showPanicles = p.uEmerge.value > 0.02 && p.uPresence.value > 0.01;
    meshes.panD.mesh.visible = showPanicles;
    meshes.panS.mesh.visible = showPanicles;
    meshes.panF.mesh.visible = showPanicles;

    const c = canopy.uniforms;
    const h = b.uHeight.value * (1 - 0.15 * b.uStubble.value);
    c.uCanopyH.value = Math.max(0.02, h * 0.8);
    c.uClumpR.value = (0.022 + 0.095 * b.uTillers.value) * Math.min(1, 0.45 + h * 0.9);
    c.uPresence.value = b.uPresence.value;
    c.uSenescence.value = b.uSenescence.value;
    c.uWet.value = b.uWet.value;
    c.uWaterVis.value = waterY.value > 0 ? 1 : 0;
    c.uPanicleCover.value = p.uEmerge.value * (0.3 + 0.5 * p.uDroop.value);
    c.uBaseColor.value.copy(b.uBaseColor.value);
    c.uTipColor.value.copy(b.uTipColor.value);
    c.uPanicleColor.value.copy(p.uPanicleColor.value);
  });

  return (
    <group>
      <primitive object={meshes.blade0.mesh} />
      <primitive object={meshes.blade1.mesh} />
      <primitive object={meshes.panD.mesh} />
      <primitive object={meshes.panS.mesh} />
      <primitive object={meshes.blade2.mesh} />
      <primitive object={meshes.panF.mesh} />
      <mesh geometry={canopyGeo} material={canopy.material} receiveShadow={high} renderOrder={CANOPY_RENDER_ORDER} />
    </group>
  );
}

const scratch = new THREE.Color();
function lerpColor(target: THREE.Color, rgb: readonly [number, number, number], k: number) {
  setSrgb(scratch, rgb);
  target.lerp(scratch, k);
}
