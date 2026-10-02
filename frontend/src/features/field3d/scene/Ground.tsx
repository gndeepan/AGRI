import { MeshReflectorMaterial } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { signedDistanceToEdge, type FieldShape } from '../fieldShape';
import type { GrowthParams } from '../growth';
import { mulberry32 } from '../prng';
import { useSceneSettings } from '../quality';
import { createCanopyGeometry, createCanopyMaterial } from './canopyMaterial';
import { createFlatPolygon, useField } from './FieldContext';
import { createBladeMaterials } from './plantMaterials';
import { createClumpGeometry } from './riceGeometry';
import { createMudTextures, createRippleNormal, createSoilTexture, type MudTextures } from './textures';

interface GroundProps {
  waterLevel: number;
  soilWetness: number;
  /** Rain / dew wetness on top of the stage's soil state. */
  surfaceWet: number;
  growth: GrowthParams;
  windStrength: number;
}

export const BUND_H = 0.3;
const BUND_OUTER = 0.75;
const DRY_MUD = new THREE.Color('#8b6d4b');
const WET_MUD = new THREE.Color('#3a2a1c');
const WATER_DEPTH_M = 0.07;

/** Mud material with puddles that fill and glisten as the surface gets wet. */
function createMudMaterial(tex: MudTextures) {
  const uniforms = { uWet: { value: 0.5 }, uDetail: { value: tex.detail } };
  const material = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), color: WET_MUD, roughness: 0.85,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;\nuniform sampler2D uDetail;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 bhDetail = texture2D(uDetail, vMapUv);
        float bhPuddle = smoothstep(0.3, 0.75, bhDetail.r) * smoothstep(0.35, 0.9, uWet);
        diffuseColor.rgb *= mix(1.0, 0.7, uWet) * mix(1.0, 0.78, bhPuddle);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor * (0.7 + 0.45 * bhDetail.g), 0.08, max(bhPuddle, uWet * 0.45));`);
  };
  material.customProgramCacheKey = () => 'bhoomi-mud';
  return { material, uniforms };
}

/** THREE.Shape in the x/-z plane: used for meshes rotated -90° about X (the reflector needs that). */
function shapeXY(shape: FieldShape): THREE.Shape {
  const s = new THREE.Shape(shape.ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  s.holes = shape.holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return s;
}

export function Ground({ waterLevel, soilWetness, surfaceWet, growth, windStrength }: GroundProps) {
  const { quality } = useSceneSettings();
  const high = quality === 'high';
  const { shape, waterY } = useField();

  const mudTex = useMemo(() => createMudTextures(high ? 512 : 256), [high]);
  const mud = useMemo(() => createMudMaterial(mudTex), [mudTex]);
  const ripple = useMemo(() => {
    const t = createRippleNormal(high ? 256 : 128);
    t.repeat.set(0.35, 0.35);
    return t;
  }, [high]);
  useEffect(() => () => {
    mudTex.map.dispose(); mudTex.normalMap.dispose(); mudTex.detail.dispose(); mud.material.dispose(); ripple.dispose();
  }, [mudTex, mud, ripple]);

  const fieldGeo = useMemo(() => createFlatPolygon(shape, 0.25), [shape]);
  const waterGeo = useMemo(() => new THREE.ShapeGeometry(shapeXY(shape)), [shape]);
  useEffect(() => () => { fieldGeo.dispose(); waterGeo.dispose(); }, [fieldGeo, waterGeo]);

  const water = useRef<THREE.Mesh>(null);
  const smoothed = useRef({ water: waterLevel, wet: soilWetness });

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    const k = 1 - Math.exp(-4 * step);
    const s = smoothed.current;
    s.water += (waterLevel - s.water) * k;
    s.wet += (Math.max(soilWetness, surfaceWet) - s.wet) * k;
    mud.material.color.copy(DRY_MUD).lerp(WET_MUD, s.wet);
    mud.uniforms.uWet.value = s.wet;
    waterY.value = s.water > 0.02 ? 0.01 + s.water * WATER_DEPTH_M : 0;
    if (water.current) {
      water.current.visible = s.water > 0.02;
      water.current.position.y = waterY.value;
      const mat = water.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.55 + s.water * 0.35;
    }
    ripple.offset.x += step * 0.012 * (0.3 + windStrength);
    ripple.offset.y += step * 0.007 * (0.3 + windStrength);
  });

  return (
    <group>
      <mesh geometry={fieldGeo} material={mud.material} receiveShadow position-y={0.001} />

      <mesh ref={water} geometry={waterGeo} rotation-x={-Math.PI / 2} position-y={0.04} renderOrder={1}>
        {high ? (
          <MeshReflectorMaterial
            mirror={0.4}
            blur={[260, 80]}
            resolution={1024}
            mixBlur={0.9}
            mixStrength={0.7}
            mixContrast={1}
            depthScale={0.6}
            minDepthThreshold={0.6}
            maxDepthThreshold={1.2}
            color="#4a4434"
            roughness={0.12}
            metalness={0.1}
            normalMap={ripple}
            normalScale={[0.18, 0.18]}
            distortionMap={ripple}
            distortion={0.12}
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        ) : (
          <meshStandardMaterial
            color="#4d4737"
            roughness={0.12}
            metalness={0.2}
            normalMap={ripple}
            normalScale={[0.2, 0.2]}
            envMapIntensity={1.4}
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        )}
      </mesh>

      <Bunds />
      <BundGrass />
      <Surroundings mudMaterial={mud.material} growth={growth} />
    </group>
  );
}

/** Earthen bunds (varappu) raised along every edge of the drawn field. */
export function Bunds() {
  const { shape } = useField();
  const { quality } = useSceneSettings();
  const soil = useMemo(() => {
    const t = createSoilTexture(quality === 'high' ? 256 : 128);
    t.map.repeat.set(1, 1);
    return t;
  }, [quality]);
  const geometry = useMemo(() => buildBundGeometry(shape), [shape]);
  useEffect(() => () => { geometry.dispose(); soil.map.dispose(); soil.normalMap.dispose(); }, [geometry, soil]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial map={soil.map} normalMap={soil.normalMap} vertexColors roughness={0.95} />
    </mesh>
  );
}

/** Outward unit normal of an edge (pointing away from the field). */
function outwardNormal(shape: FieldShape, ax: number, az: number, bx: number, bz: number): [number, number] {
  const len = Math.hypot(bx - ax, bz - az) || 1;
  let nx = (bz - az) / len;
  let nz = -(bx - ax) / len;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  if (signedDistanceToEdge(shape, mx + nx * 0.3, mz + nz * 0.3) < 0) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

export function buildBundGeometry(shape: FieldShape): THREE.BufferGeometry {
  // Cross-section: offset outward from the field edge (m) and height (m).
  const profile: Array<[number, number]> = [[-0.02, -0.02], [0.16, BUND_H], [BUND_OUTER - 0.2, BUND_H + 0.02], [BUND_OUTER, -0.02]];
  const grass = new THREE.Color('#6f7a3c');
  const earth = new THREE.Color('#9a7b55');
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const rand = mulberry32(5);
  for (const ring of [shape.ring, ...shape.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const [ax0, az0] = ring[i]!;
      const [bx0, bz0] = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(bx0 - ax0, bz0 - az0) || 1;
      const tx = (bx0 - ax0) / len;
      const tz = (bz0 - az0) / len;
      const [nx, nz] = outwardNormal(shape, ax0, az0, bx0, bz0);
      // Extend past the corners so neighbouring bunds overlap without gaps.
      const ext = BUND_OUTER * 0.6;
      const ax = ax0 - tx * ext;
      const az = az0 - tz * ext;
      const segs = Math.max(1, Math.ceil((len + ext * 2) / 2));
      const base = positions.length / 3;
      for (let s = 0; s <= segs; s++) {
        const f = s / segs;
        const px = ax + tx * (len + ext * 2) * f;
        const pz = az + tz * (len + ext * 2) * f;
        const wobble = (rand() - 0.5) * 0.05;
        profile.forEach(([o, y], k) => {
          positions.push(px + nx * o, y + (y > 0 ? wobble : 0), pz + nz * o);
          uvs.push(f * (len + ext * 2) * 0.5, k / 3);
          const c = y > 0.1 ? grass.clone().lerp(earth, rand() * 0.4) : earth;
          colors.push(c.r, c.g, c.b);
        });
        if (s < segs) {
          const r0 = base + s * 4;
          const r1 = r0 + 4;
          for (let k = 0; k < 3; k++) index.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Wild grass on the bunds, swaying with the same wind as the crop. */
export function BundGrass() {
  const { quality } = useSceneSettings();
  const { shape, wind } = useField();
  const perM = quality === 'high' ? 34 : 10;
  const count = Math.min(quality === 'high' ? 16000 : 3500, Math.round(shape.perimeterM * perM));
  const mesh = useMemo(() => {
    const geo = createClumpGeometry({ blades: 6, segments: 3, folded: false, seed: 21 });
    const rand = mulberry32(99);
    const randoms = new Float32Array(Math.max(1, count) * 4);
    const { material, depth, uniforms } = createBladeMaterials(wind);
    uniforms.uHeight.value = 0.3;
    uniforms.uTillers.value = 1;
    uniforms.uTranslucency.value = 0.4;
    uniforms.uBaseColor.value.set('#56702c');
    uniforms.uTipColor.value.set('#a7b45c');
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(randoms, 4));
    const im = new THREE.InstancedMesh(geo, material, Math.max(1, count));
    im.customDepthMaterial = depth;
    const edges = shape.ring.map((p, i) => {
      const q = shape.ring[(i + 1) % shape.ring.length]!;
      return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]), n: outwardNormal(shape, p[0], p[1], q[0], q[1]) };
    });
    const total = edges.reduce((a, e) => a + e.len, 0);
    const m = new THREE.Matrix4();
    const sv = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      let t = rand() * total;
      const e = edges.find((ed) => (t -= ed.len) < 0) ?? edges[0]!;
      const f = rand();
      const o = 0.12 + rand() * (BUND_OUTER - 0.2);
      const x = e.p[0] + (e.q[0] - e.p[0]) * f + e.n[0] * o;
      const z = e.p[1] + (e.q[1] - e.p[1]) * f + e.n[1] * o;
      const s = 0.5 + rand() * 0.9;
      m.makeRotationY(rand() * Math.PI * 2).scale(sv.set(s, 1, s)).setPosition(x, BUND_H - 0.02, z);
      im.setMatrixAt(i, m);
      randoms.set([0.5 + rand() * 1.2, rand(), 0, rand()], i * 4);
    }
    im.count = count;
    im.frustumCulled = false;
    im.castShadow = quality === 'high';
    return im;
  }, [count, wind, shape, quality]);

  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.customDepthMaterial?.dispose();
  }, [mesh]);

  return <primitive object={mesh} />;
}

export interface Plot {
  ring: Array<[number, number]>;
  variant: 'same' | 'younger' | 'flooded' | 'fallow' | 'stubble';
}

/** Neighbouring paddies laid out on the same orientation as the farmer's field. */
export function layoutPlots(shape: FieldShape): Plot[] {
  const rand = mulberry32(17);
  const ux = Math.cos(shape.rowAngle);
  const uz = Math.sin(shape.rowAngle);
  const cu = Math.min(120, Math.max(18, shape.lengthM * 0.9));
  const cv = Math.min(90, Math.max(14, shape.widthM * 0.9));
  const reach = shape.radius * 1.6 + 140;
  const ni = Math.min(6, Math.ceil(reach / cu));
  const nj = Math.min(6, Math.ceil(reach / cv));
  const variants: Plot['variant'][] = ['same', 'same', 'same', 'younger', 'younger', 'flooded', 'fallow', 'stubble'];
  const plots: Plot[] = [];
  for (let j = -nj; j <= nj; j++) {
    for (let i = -ni; i <= ni; i++) {
      const cx = shape.center[0] + i * cu * ux - j * cv * uz + (rand() - 0.5) * 3;
      const cz = shape.center[1] + i * cu * uz + j * cv * ux + (rand() - 0.5) * 3;
      const hu = cu / 2 - 0.9;
      const hv = cv / 2 - 0.9;
      const corner = (a: number, b: number): [number, number] => [cx + a * ux - b * uz, cz + a * uz + b * ux];
      const ring = [corner(-hu, -hv), corner(hu, -hv), corner(hu, hv), corner(-hu, hv)];
      let clear = true;
      for (let a = -2; a <= 2 && clear; a++) {
        for (let b = -2; b <= 2 && clear; b++) {
          const [px, pz] = corner((a / 2) * hu, (b / 2) * hv);
          if (signedDistanceToEdge(shape, px, pz) < 2.5) clear = false;
        }
      }
      // The farmer's field can be smaller than a plot: never cover any of its vertices.
      if (clear) {
        for (const [fx, fz] of shape.ring) {
          const du = (fx - cx) * ux + (fz - cz) * uz;
          const dv = -(fx - cx) * uz + (fz - cz) * ux;
          if (Math.abs(du) < hu + 2 && Math.abs(dv) < hv + 2) { clear = false; break; }
        }
      }
      if (clear) plots.push({ ring, variant: variants[Math.floor(rand() * variants.length)] ?? 'same' });
    }
  }
  return plots;
}

export function plotShape(ring: Array<[number, number]>): FieldShape {
  return {
    ring, holes: [], areaM2: 0, perimeterM: 0, rowAngle: 0, lengthM: 0, widthM: 0, center: [0, 0], radius: 0, synthetic: true,
  };
}

function Surroundings({ mudMaterial, growth }: { mudMaterial: THREE.Material; growth: GrowthParams }) {
  const { shape, wind } = useField();
  const plots = useMemo(() => layoutPlots(shape), [shape]);
  const worldR = Math.max(900, shape.radius * 10);

  const geos = useMemo(() => {
    const by = (v: Plot['variant'][]) => plots.filter((p) => v.includes(p.variant));
    const merge = (list: THREE.BufferGeometry[]) => {
      if (list.length === 0) return null;
      const m = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      return m;
    };
    return {
      mud: merge(plots.map((p) => createFlatPolygon(plotShape(p.ring), 0.25))),
      same: merge(by(['same']).map((p) => createCanopyGeometry(plotShape(p.ring)))),
      younger: merge(by(['younger', 'flooded']).map((p) => createCanopyGeometry(plotShape(p.ring)))),
      stubble: merge(by(['stubble']).map((p) => createCanopyGeometry(plotShape(p.ring)))),
      water: merge(by(['flooded', 'younger']).map((p) => createFlatPolygon(plotShape(p.ring)))),
      bunds: merge(plots.map((p) => buildBundGeometry(plotShape(p.ring)))),
    };
  }, [plots]);

  const mats = useMemo(() => ({
    same: createCanopyMaterial(wind),
    younger: createCanopyMaterial(wind),
    stubble: createCanopyMaterial(wind),
  }), [wind]);

  useEffect(() => () => {
    Object.values(geos).forEach((g) => g?.dispose());
  }, [geos]);
  useEffect(() => () => { Object.values(mats).forEach((m) => m.material.dispose()); }, [mats]);

  useEffect(() => {
    // Stubble plots: short straw-coloured hills.
    const s = mats.stubble.uniforms;
    s.uCanopyH.value = 0.12; s.uClumpR.value = 0.06; s.uBaseColor.value.set('#a08a55'); s.uTipColor.value.set('#c2a76a');
    for (const m of Object.values(mats)) {
      m.uniforms.uRowDir.value.set(Math.cos(shape.rowAngle), Math.sin(shape.rowAngle));
      m.uniforms.uOrigin.value.set(shape.center[0], shape.center[1]);
    }
  }, [mats, shape]);

  useFrame(() => {
    // Neighbours were planted around the same time: same stage, with a little spread.
    const a = mats.same.uniforms;
    a.uCanopyH.value = Math.max(0.02, growth.heightM * 0.78);
    a.uClumpR.value = (0.022 + 0.095 * (growth.tillers / 12)) * Math.min(1, 0.45 + growth.heightM * 0.9);
    a.uPresence.value = growth.presence;
    a.uBaseColor.value.setRGB(...growth.leafColor, THREE.SRGBColorSpace).multiplyScalar(0.92);
    a.uTipColor.value.setRGB(...growth.leafTipColor, THREE.SRGBColorSpace);
    a.uPanicleColor.value.setRGB(...growth.panicleColor, THREE.SRGBColorSpace);
    a.uPanicleCover.value = growth.panicleEmergence * (0.3 + 0.5 * growth.panicleDroop);
    a.uSenescence.value = growth.senescence;
    const y = mats.younger.uniforms;
    y.uCanopyH.value = Math.max(0.12, growth.heightM * 0.55);
    y.uClumpR.value = Math.max(0.025, a.uClumpR.value * 0.6);
    y.uBaseColor.value.setRGB(0.36, 0.64, 0.2, THREE.SRGBColorSpace);
    y.uTipColor.value.setRGB(0.5, 0.74, 0.3, THREE.SRGBColorSpace);
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[shape.center[0], -0.06, shape.center[1]]} receiveShadow>
        <circleGeometry args={[worldR, 64]} />
        <meshStandardMaterial color="#6f6a3e" roughness={1} />
      </mesh>
      {geos.mud && <mesh geometry={geos.mud} material={mudMaterial} position-y={-0.01} receiveShadow />}
      {geos.water && (
        <mesh geometry={geos.water} position-y={0.03}>
          <meshStandardMaterial color="#6d7a6c" roughness={0.08} metalness={0.15} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      )}
      {geos.same && <mesh geometry={geos.same} material={mats.same.material} />}
      {geos.younger && <mesh geometry={geos.younger} material={mats.younger.material} />}
      {geos.stubble && <mesh geometry={geos.stubble} material={mats.stubble.material} />}
      {geos.bunds && (
        <mesh geometry={geos.bunds} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}
