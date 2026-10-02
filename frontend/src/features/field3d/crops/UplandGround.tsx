import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FieldShape } from '../fieldShape';
import { mulberry32 } from '../prng';
import { useSceneSettings } from '../quality';
import { createCanopyGeometry, createCanopyMaterial } from '../scene/canopyMaterial';
import { createFlatPolygon, useField } from '../scene/FieldContext';
import { BundGrass, Bunds, buildBundGeometry, layoutPlots, plotShape } from '../scene/Ground';
import { createSoilTexture } from '../scene/textures';
import { canopyRadius, type CropVisual } from './cropGrowth';
import { rowSegments, type RowSegment } from './rows';
import type { CropSpec } from './specs';

/** Dry / wet albedo per soil family (TN red soils, black cotton soils, alluvial brown). */
const SOILS: Record<CropSpec['soil'], { dry: string; wet: string }> = {
  red: { dry: '#a35d3c', wet: '#5a2c1c' },
  black: { dry: '#5b5148', wet: '#29231f' },
  brown: { dry: '#8f7150', wet: '#4a3624' },
};

interface SoilUniforms {
  uWet: THREE.IUniform<number>;
  uRowDir: THREE.IUniform<THREE.Vector2>;
  uOrigin: THREE.IUniform<THREE.Vector2>;
  uRow: THREE.IUniform<number>;
  /** 0 flat, 1 ridges-and-furrows, 2 raised beds. */
  uForm: THREE.IUniform<number>;
  uMulch: THREE.IUniform<number>;
  uIrrigated: THREE.IUniform<number>;
  uDry: THREE.IUniform<THREE.Color>;
  uWetColor: THREE.IUniform<THREE.Color>;
}

/**
 * Tilled soil over the whole polygon: the furrow pattern, clods and wetness are drawn
 * in the shader, so even a 10 ha field reads as ridged without millions of triangles.
 * Real 3D ridges are added near the camera by <Ridges />.
 */
function createSoilMaterial(spec: CropSpec, map: THREE.Texture, normalMap: THREE.Texture) {
  const soil = SOILS[spec.soil];
  const uniforms: SoilUniforms = {
    uWet: { value: 0 },
    uRowDir: { value: new THREE.Vector2(1, 0) },
    uOrigin: { value: new THREE.Vector2() },
    uRow: { value: spec.rowM },
    uForm: { value: spec.ground.kind === 'flat' ? 0 : spec.ground.kind === 'ridges' ? 1 : 2 },
    uMulch: { value: 0 },
    uIrrigated: { value: 0 },
    uDry: { value: new THREE.Color(soil.dry) },
    uWetColor: { value: new THREE.Color(soil.wet) },
  };
  const material = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const decl = `uniform float uWet; uniform vec2 uRowDir; uniform vec2 uOrigin; uniform float uRow; uniform float uForm;
      uniform float uMulch; uniform float uIrrigated; uniform vec3 uDry; uniform vec3 uWetColor; varying vec2 vSoilXZ;`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vSoilXZ;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvSoilXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${decl}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 sRel = vSoilXZ - uOrigin;
        float sAcross = dot(sRel, vec2(-uRowDir.y, uRowDir.x));
        // Distance from the nearest plant row (0) to the furrow between rows (1).
        float period = uForm > 1.5 ? uRow * 2.0 : uRow;
        float sPhase = abs(fract(sAcross / period + 0.5) - 0.5) * 2.0;
        float furrow = uForm > 0.5 ? smoothstep(uForm > 1.5 ? 0.75 : 0.45, 1.0, sPhase) : 0.0;
        // Water collects in furrow bottoms first; irrigated fields stay damp there.
        float sWet = clamp(max(uWet * (0.7 + 0.5 * furrow), uIrrigated * furrow * 0.65), 0.0, 1.0);
        vec3 soilCol = mix(uDry, uWetColor, sWet) * (0.9 + 0.2 * diffuseColor.r);
        soilCol *= 1.0 - furrow * 0.18;
        // Black plastic mulch on bed tops with drip.
        float onBed = uForm > 1.5 ? 1.0 - smoothstep(0.6, 0.72, sPhase) : 0.0;
        float mulch = uMulch * onBed;
        soilCol = mix(soilCol, vec3(0.035, 0.035, 0.04), mulch);
        diffuseColor.rgb = soilCol;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.45, sWet * 0.8);
        roughnessFactor = mix(roughnessFactor, 0.35, mulch);
        // Standing water in furrows after heavy rain.
        roughnessFactor = mix(roughnessFactor, 0.06, smoothstep(0.75, 1.0, uWet) * furrow);`);
  };
  material.customProgramCacheKey = () => 'bhoomi-upland-soil';
  return { material, uniforms };
}

/** Real ridge geometry along the rows near the camera (beyond it, the shader stripes take over). */
function buildRidges(rows: RowSegment[], spec: CropSpec, lift: number): THREE.BufferGeometry | null {
  if (spec.ground.kind === 'flat' || rows.length === 0) return null;
  const beds = spec.ground.kind === 'beds';
  const h = spec.ground.heightM;
  const w = beds ? spec.rowM * 1.4 : spec.rowM * 0.62;
  // Ridge cross-section (offset across, height); beds are flat-topped.
  const profile: Array<[number, number]> = beds
    ? [[-w / 2 - 0.05, 0], [-w / 2 + 0.06, h], [w / 2 - 0.06, h], [w / 2 + 0.05, 0]]
    : [[-w / 2, 0], [-w * 0.18, h * 0.92], [0, h], [w * 0.18, h * 0.92], [w / 2, 0]];
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const rand = mulberry32(31);
  for (const r of rows) {
    // Beds carry two plant rows: one bed per pair of rows.
    if (beds && r.j % 2 !== 0) continue;
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    const tx = (r.bx - r.ax) / len;
    const tz = (r.bz - r.az) / len;
    const nx = -tz;
    const nz = tx;
    const off = beds ? spec.rowM / 2 : 0;
    const segs = Math.max(1, Math.ceil(len / 1.5));
    const base = positions.length / 3;
    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      const cx = r.ax + (r.bx - r.ax) * f + nx * off;
      const cz = r.az + (r.bz - r.az) * f + nz * off;
      const wob = (rand() - 0.5) * h * 0.18;
      profile.forEach(([o, y], k) => {
        positions.push(cx + nx * o, lift + (y > 0 ? y + wob : 0), cz + nz * o);
        uvs.push(f * len * 0.6, k / (profile.length - 1));
      });
      if (s < segs) {
        const p0 = base + s * profile.length;
        const p1 = p0 + profile.length;
        for (let k = 0; k + 1 < profile.length; k++) index.push(p0 + k, p0 + k + 1, p1 + k, p0 + k + 1, p1 + k + 1, p1 + k);
      }
    }
  }
  if (index.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Black drip laterals along each plant row (or bed centre) near the camera. */
function buildDripLines(rows: RowSegment[], spec: CropSpec, y: number): THREE.BufferGeometry | null {
  const beds = spec.ground.kind === 'beds';
  const parts: THREE.BufferGeometry[] = [];
  for (const r of rows) {
    if (beds && r.j % 2 !== 0) continue;
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    const off = beds ? spec.rowM / 2 : 0.04;
    const nx = -(r.bz - r.az) / len;
    const nz = (r.bx - r.ax) / len;
    const g = new THREE.CylinderGeometry(0.008, 0.008, len, 5, 1, true);
    g.rotateZ(Math.PI / 2);
    g.rotateY(-Math.atan2(r.bz - r.az, r.bx - r.ax));
    g.translate((r.ax + r.bx) / 2 + nx * off, y, (r.az + r.bz) / 2 + nz * off);
    g.deleteAttribute('uv');
    parts.push(g);
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}

interface UplandGroundProps {
  spec: CropSpec;
  visual: CropVisual;
  wetness: number;
  irrigationMethod?: string;
  /** Centre and radius of the detailed patch (3D ridges and drip lines live there). */
  patch: [number, number];
  detailRadius: number;
}

export function UplandGround({ spec, visual, wetness, irrigationMethod, patch, detailRadius }: UplandGroundProps) {
  const { quality } = useSceneSettings();
  const high = quality === 'high';
  const { shape, waterY } = useField();
  const tex = useMemo(() => {
    const t = createSoilTexture(high ? 512 : 256, 77);
    t.map.repeat.set(1, 1);
    return t;
  }, [high]);
  const soil = useMemo(() => createSoilMaterial(spec, tex.map, tex.normalMap), [spec, tex]);
  const fieldGeo = useMemo(() => createFlatPolygon(shape, 0.5), [shape]);
  useEffect(() => () => { tex.map.dispose(); tex.normalMap.dispose(); soil.material.dispose(); }, [tex, soil]);
  useEffect(() => () => fieldGeo.dispose(), [fieldGeo]);

  const drip = irrigationMethod === 'drip';
  useEffect(() => {
    const u = soil.uniforms;
    u.uRowDir.value.set(Math.cos(shape.rowAngle), Math.sin(shape.rowAngle));
    u.uOrigin.value.set(shape.center[0], shape.center[1]);
    u.uMulch.value = drip && spec.mulchWithDrip ? 1 : 0;
    // Furrow irrigation keeps furrow bottoms damp; drip and rainfed fields don't.
    u.uIrrigated.value = irrigationMethod === 'flood' || irrigationMethod === 'awd' ? 1 : 0;
    waterY.value = 0;
  }, [soil, shape, drip, spec, irrigationMethod, waterY]);

  // Ridges and drip lines are rebuilt only when the detailed patch moves.
  const rows = useMemo(
    () => rowSegments(shape, spec.rowM, patch, detailRadius * 1.3, 0.3, high ? 1500 : 500),
    [shape, spec.rowM, patch, detailRadius, high],
  );
  const ridges = useMemo(() => buildRidges(rows, spec, 0.002), [rows, spec]);
  const dripGeo = useMemo(
    () => (drip ? buildDripLines(rows, spec, spec.ground.kind === 'flat' ? 0.01 : spec.ground.heightM + 0.01) : null),
    [drip, rows, spec],
  );
  useEffect(() => () => { ridges?.dispose(); dripGeo?.dispose(); }, [ridges, dripGeo]);

  const smoothed = useRef(wetness);
  useFrame((_, dt) => {
    smoothed.current += (wetness - smoothed.current) * (1 - Math.exp(-4 * Math.min(dt, 0.1)));
    soil.uniforms.uWet.value = smoothed.current;
  });

  return (
    <group>
      <mesh geometry={fieldGeo} material={soil.material} receiveShadow position-y={0.001} />
      {ridges && <mesh geometry={ridges} material={soil.material} receiveShadow castShadow={high} />}
      {dripGeo && (
        <mesh geometry={dripGeo} receiveShadow>
          <meshStandardMaterial color="#121212" roughness={0.4} />
        </mesh>
      )}
      <Bunds />
      <BundGrass />
      <UplandSurroundings spec={spec} visual={visual} soilMaterial={soil.material} />
    </group>
  );
}

/** Neighbouring plots on the same orientation: most grow the same crop, some are ploughed or fallow. */
function UplandSurroundings({ spec, visual, soilMaterial }: { spec: CropSpec; visual: CropVisual; soilMaterial: THREE.Material }) {
  const { shape, wind } = useField();
  const plots = useMemo(() => layoutPlots(shape), [shape]);
  const worldR = Math.max(900, shape.radius * 10);
  const geos = useMemo(() => {
    const merge = (list: THREE.BufferGeometry[]) => {
      if (list.length === 0) return null;
      const m = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      return m;
    };
    const cropped = plots.filter((p) => p.variant !== 'fallow' && p.variant !== 'stubble');
    const younger = cropped.filter((p) => p.variant === 'younger' || p.variant === 'flooded');
    const same = cropped.filter((p) => p.variant === 'same');
    return {
      soil: merge(plots.map((p) => createFlatPolygon(plotShape(p.ring), 0.5))),
      same: merge(same.map((p) => createCanopyGeometry(plotShape(p.ring)))),
      younger: merge(younger.map((p) => createCanopyGeometry(plotShape(p.ring)))),
      bunds: merge(plots.map((p) => buildBundGeometry(plotShape(p.ring)))),
    };
  }, [plots]);
  const mats = useMemo(() => ({ same: createCanopyMaterial(wind), younger: createCanopyMaterial(wind) }), [wind]);
  useEffect(() => () => { Object.values(geos).forEach((g) => g?.dispose()); }, [geos]);
  useEffect(() => () => { mats.same.material.dispose(); mats.younger.material.dispose(); }, [mats]);
  useEffect(() => {
    for (const m of Object.values(mats)) {
      m.uniforms.uRowDir.value.set(Math.cos(shape.rowAngle), Math.sin(shape.rowAngle));
      m.uniforms.uOrigin.value.set(shape.center[0], shape.center[1]);
      m.uniforms.uSpacing.value.set(spec.plantM, spec.rowM);
      m.uniforms.uWaterVis.value = 0;
    }
  }, [mats, shape, spec]);
  useFrame(() => {
    applyCanopy(mats.same.uniforms, spec, visual, 0.95, 1);
    applyCanopy(mats.younger.uniforms, spec, { ...visual, scale: visual.scale * 0.6, bloomCover: 0 }, 0.6, 0.9);
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[shape.center[0], -0.06, shape.center[1]]} receiveShadow>
        <circleGeometry args={[worldR, 64]} />
        <meshStandardMaterial color="#7a6d45" roughness={1} />
      </mesh>
      {geos.soil && <mesh geometry={geos.soil} material={soilMaterial} position-y={-0.01} receiveShadow />}
      {geos.same && <mesh geometry={geos.same} material={mats.same.material} />}
      {geos.younger && <mesh geometry={geos.younger} material={mats.younger.material} />}
      {geos.bunds && (
        <mesh geometry={geos.bunds} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

type CanopyU = ReturnType<typeof createCanopyMaterial>['uniforms'];

/** Drives a far-canopy material from the crop's visual state. */
export function applyCanopy(u: CanopyU, spec: CropSpec, v: CropVisual, heightShare: number, brightness: number) {
  u.uCanopyH.value = Math.max(0.02, spec.heightM * v.scale * 0.72 * heightShare);
  u.uClumpR.value = canopyRadius(spec, v);
  u.uPresence.value = v.presence * Math.min(1, v.leaves * 3);
  u.uBaseColor.value.setRGB(v.leafColor[0], v.leafColor[1], v.leafColor[2], THREE.SRGBColorSpace).multiplyScalar(brightness * 1.25);
  u.uTipColor.value.copy(u.uBaseColor.value).multiplyScalar(1.15);
  u.uPanicleColor.value.setRGB(v.bloomColor[0], v.bloomColor[1], v.bloomColor[2], THREE.SRGBColorSpace).multiplyScalar(1.6);
  u.uPanicleCover.value = v.bloomCover;
  u.uSenescence.value = v.senescence * 0.6;
}

export type { FieldShape };
