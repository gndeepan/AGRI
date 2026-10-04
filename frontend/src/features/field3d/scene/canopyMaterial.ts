import * as THREE from 'three';
import type { FieldShape } from '../fieldShape';
import { HILL_SPACING_M, ROW_SPACING_M } from '../fieldShape';
import { createFlatPolygon } from './FieldContext';
import { GUST_GLSL, type WindUniforms } from './plantMaterials';

/**
 * The far-field crop: a surface at canopy height whose fragment shader draws the
 * transplanting grid of hills (sparse seedlings early, a closed canopy later), colour
 * variation, panicles, and travelling wind waves. Far fields have 10⁵–10⁶ hills, so
 * past the detailed patch this is what makes the whole drawn polygon read as planted.
 */
export interface CanopyUniforms {
  uCanopyH: THREE.IUniform<number>;
  uClumpR: THREE.IUniform<number>;
  uPresence: THREE.IUniform<number>;
  uBaseColor: THREE.IUniform<THREE.Color>;
  uTipColor: THREE.IUniform<THREE.Color>;
  uPanicleColor: THREE.IUniform<THREE.Color>;
  uPanicleCover: THREE.IUniform<number>;
  uSenescence: THREE.IUniform<number>;
  uWet: THREE.IUniform<number>;
  uWaterVis: THREE.IUniform<number>;
  /** Ground colour between plants (upland soil); used when uUnderSet is 1, else paddy mud/water. */
  uUnder: THREE.IUniform<THREE.Color>;
  uUnderSet: THREE.IUniform<number>;
  /** Upland: share of the ground hidden by leaves, from the crop model (the clump radius overstates it). */
  uGroundCover: THREE.IUniform<number>;
  uRowDir: THREE.IUniform<THREE.Vector2>;
  uOrigin: THREE.IUniform<THREE.Vector2>;
  uSpacing: THREE.IUniform<THREE.Vector2>;
  uPatchCenter: THREE.IUniform<THREE.Vector2>;
  uFadeStart: THREE.IUniform<number>;
  uFadeEnd: THREE.IUniform<number>;
}

const NOISE_GLSL = /* glsl */ `
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float cNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1, 0)), u.x), mix(cHash(i + vec2(0, 1)), cHash(i + vec2(1, 1)), u.x), u.y);
}
`;

const DECL = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform float uCanopyH;
uniform float uClumpR;
uniform float uPresence;
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uPanicleColor;
uniform float uPanicleCover;
uniform float uSenescence;
uniform float uWet;
uniform float uWaterVis;
uniform vec3 uUnder;
uniform float uUnderSet;
uniform float uGroundCover;
uniform vec2 uRowDir;
uniform vec2 uOrigin;
uniform vec2 uSpacing;
uniform vec2 uPatchCenter;
uniform float uFadeStart;
uniform float uFadeEnd;
varying vec2 vXZ;
varying vec2 vSkirt;
varying vec2 vVar;
${GUST_GLSL}
`;

const VERTEX = /* glsl */ `
vec3 transformed = vec3(position);
float hVar = aVar.y;
transformed.y = mix(uCanopyH * hVar, aSkirt.y * uCanopyH * hVar, aSkirt.x);
vSkirt = aSkirt;
vVar = aVar;
vXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
`;

const COLOR = /* glsl */ `
vec2 rowV = vec2(-uRowDir.y, uRowDir.x);
vec2 rel = vXZ - uOrigin;
vec2 grid = vec2(dot(rel, uRowDir), dot(rel, rowV));
vec2 cell = grid / uSpacing;
vec2 cid = floor(cell + 0.5);
vec2 off = (cell - cid) * uSpacing;
float hr = cHash(cid);
float rad = uClumpR * (0.75 + 0.5 * hr);
float px = max(length(fwidth(grid)), 1e-4);
float spot = 1.0 - smoothstep(rad - px, rad + px, length(off));
float coverFrac = clamp(3.14159 * rad * rad / (uSpacing.x * uSpacing.y), 0.0, 1.0);
float rawCover = coverFrac;
float far = smoothstep(0.35 * uSpacing.y, 1.6 * uSpacing.y, px);
// Plants stand upright: looking across the field at a low angle, their sides hide the water
// between rows, so apparent cover rises with canopy height and grazing view angle.
vec3 toEye = normalize(cameraPosition - vec3(vXZ.x, uCanopyH, vXZ.y));
float grazing = 1.0 - abs(toEye.y);
float sideCover = clamp((uCanopyH / uSpacing.y) * grazing * grazing * 1.6, 0.0, 1.0);
coverFrac = coverFrac + (1.0 - coverFrac) * sideCover;
// Coverage is drawn with real transparency over the field's own ground (tilled soil, paddy water), never
// as a screen-space dither or cut-out: a pattern tied to the screen crawls across the field whenever the
// camera moves, and a painted ground reads as a "ring" against the real ground near the camera.
// Everything here is fixed to the field (world space), so it stays still as the camera moves.
float flatView = smoothstep(0.35, 0.6, grazing) * step(vSkirt.x, 0.5);
float offRow = (fract(grid.y / uSpacing.y + 0.5) - 0.5) * uSpacing.y;
float pxRow = max(fwidth(grid.y), 1e-4);
// Cover as seen from above (view-independent), and as seen across the field (plants hide the ground
// behind them at low angles; this changes smoothly with the view, never by popping).
float baseCover = uUnderSet > 0.5 ? uGroundCover : rawCover;
float seenCover = uUnderSet > 0.5
  ? clamp(uGroundCover + (1.0 - uGroundCover) * sideCover * 0.25, 0.0, 0.95)
  : max(max(clamp(2.0 * rad / uSpacing.y, 0.0, 1.0) * 0.9, coverFrac), sideCover);
// Up close: foliage in bands along the crop rows, broken into plant-sized clumps, with antialiased
// edges. Pattern scales are fixed in metres.
vec2 mp = vec2(grid.x / (uSpacing.x * 1.5), grid.y / (uSpacing.y * 0.5));
float nm = cNoise(mp) * 0.45 + cNoise(mp * 2.3 + 5.3) * 0.35 + cNoise(mp * 5.1 + 1.7) * 0.2;
nm = clamp((nm - 0.5) * 2.4 + 0.5, 0.0, 1.0);
float band = 1.0 - abs(offRow) / (0.5 * uSpacing.y);       // 1 on the row, 0 midway between rows
float pattern = band * 0.75 + nm * 0.25;
float pw = max(fwidth(pattern), 1e-3);
float nearMask = smoothstep(1.0 - baseCover - pw, 1.0 - baseCover + pw, pattern);
// Looking down on young paddy hills up close: the individual hills.
if (uUnderSet < 0.5) nearMask = mix(nearMask, spot, 1.0 - flatView);
// As rows shrink towards a pixel the pattern would shimmer: fade it into its average cover.
float resolve = 1.0 - smoothstep(0.12, 0.45, pxRow / uSpacing.y);
float alpha = mix(seenCover, nearMask, resolve);
float fadeA = uPresence * smoothstep(uFadeStart, uFadeEnd, distance(vXZ, uPatchCenter));
if (vSkirt.x > 0.5) alpha = coverFrac * (0.6 + 0.4 * cNoise(vec2(dot(vXZ, rowV) * 9.0, vSkirt.y * 3.0)));
alpha *= fadeA;
if (alpha < 0.004) discard;

float n1 = cNoise(vXZ * 0.45);
float n2 = cNoise(vXZ * 0.06 + 17.0);
float n3 = cNoise(vXZ * 3.1 + 5.0);
vec3 leaf = mix(uBaseColor, uTipColor, 0.25 + 0.5 * n3);
leaf *= 0.76 + 0.32 * n1 + 0.45 * (n2 - 0.5);
// Per-plot variation: different sowing dates and fertility make neighbours differ in vigour and age.
leaf *= 0.84 + 0.32 * vVar.x;
leaf = mix(leaf, leaf * vec3(1.14, 1.05, 0.6), smoothstep(0.62, 1.0, vVar.x) * 0.55);
leaf = mix(leaf, leaf * vec3(0.82, 1.06, 0.7), smoothstep(0.38, 0.0, vVar.x) * 0.5);
// Looking into gaps between hills shows shaded lower leaves.
leaf *= mix(0.72, 1.0, smoothstep(0.0, rad * 0.9, rad - length(off)) * (1.0 - far) + far);
float sen = uSenescence * smoothstep(0.35, 0.9, n3 + 0.2 * n1);
leaf = mix(leaf, vec3(0.74, 0.6, 0.32), sen * 0.6);
float pan = uPanicleCover * smoothstep(0.25, 0.75, n3 * 0.7 + n1 * 0.3 + 0.15);
leaf = mix(leaf, uPanicleColor * (0.85 + 0.3 * n3), pan);
// Wind waves: gusts flatten leaves and show their paler undersides, travelling across the field.
float g = gustAt(vXZ);
leaf *= 1.0 + (g - 0.5) * 0.28 * uWind;
leaf *= mix(1.0, 0.82, uWet);
// Transplanted rows read as faint stripes across the field.
float stripe = abs(fract(grid.y / uSpacing.y) - 0.5) * 2.0;
leaf *= 1.0 - 0.18 * smoothstep(0.55, 1.0, stripe) * (1.0 - rawCover) * smoothstep(0.0, 0.3, far);
// Self-shading inside the canopy: a vegetation surface is darker than a single lit leaf.
// Clumps shade each other: deep gaps between leaves, lit tips. Averaged over a pixel this is dark.
// This colour is foliage only (the gaps are the real ground, through transparency): lit like the
// detailed plants, a little darker where a dense canopy shades itself.
leaf *= mix(0.82, 0.58, smoothstep(0.6, 1.0, seenCover)) * (0.7 + 0.6 * cNoise(vXZ * 7.0 + 3.0));
// Paddy: thin rice blades over dark water read darker than a broad-leaved crop; match the real hills.
if (uUnderSet < 0.5) leaf *= 0.74;
if (vSkirt.x > 0.5) leaf *= mix(0.45, 0.95, vSkirt.y);
diffuseColor.rgb = leaf;
diffuseColor.a = alpha;
`;

const NORMAL = /* glsl */ `
#include <normal_fragment_begin>
if (vSkirt.x < 0.5) {
  float e = 0.05;
  float h0 = cNoise(vXZ * 2.2);
  float hx = cNoise((vXZ + vec2(e, 0.0)) * 2.2);
  float hz = cNoise((vXZ + vec2(0.0, e)) * 2.2);
  vec3 wn = normalize(vec3(-(hx - h0) * 0.9, 1.0, -(hz - h0) * 0.9));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;

/** Canopy surfaces draw after the paddy water surface (renderOrder 1), which they sit above. */
export const CANOPY_RENDER_ORDER = 2;

export function createCanopyMaterial(wind: WindUniforms) {
  const uniforms: CanopyUniforms = {
    uCanopyH: { value: 0.5 },
    uClumpR: { value: 0.05 },
    uPresence: { value: 1 },
    uBaseColor: { value: new THREE.Color(0.2, 0.45, 0.12) },
    uTipColor: { value: new THREE.Color(0.3, 0.6, 0.2) },
    uPanicleColor: { value: new THREE.Color(0.8, 0.7, 0.3) },
    uPanicleCover: { value: 0 },
    uSenescence: { value: 0 },
    uWet: { value: 0 },
    uWaterVis: { value: 0 },
    uUnder: { value: new THREE.Color(0.2, 0.17, 0.12) },
    uUnderSet: { value: 0 },
    uGroundCover: { value: 1 },
    uRowDir: { value: new THREE.Vector2(1, 0) },
    uOrigin: { value: new THREE.Vector2() },
    uSpacing: { value: new THREE.Vector2(HILL_SPACING_M, ROW_SPACING_M) },
    uPatchCenter: { value: new THREE.Vector2(1e6, 1e6) },
    uFadeStart: { value: 0 },
    uFadeEnd: { value: 0.001 },
  };
  // Transparent over the ground (meshes using it draw after the paddy water: renderOrder CANOPY_RENDER_ORDER).
  const material = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, side: THREE.DoubleSide, transparent: true, depthWrite: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wind, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aSkirt;\nattribute vec2 aVar;\n${DECL}`)
      .replace('#include <begin_vertex>', VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
      .replace('#include <normal_fragment_begin>', NORMAL);
  };
  material.customProgramCacheKey = () => 'bhoomi-canopy';
  return { material, uniforms };
}

/** Canopy top over the polygon plus an outward-facing skirt along the edge. */
export function createCanopyGeometry(shape: FieldShape, tint = 0.5, heightVar = 1): THREE.BufferGeometry {
  const top = createFlatPolygon(shape);
  const topCount = top.getAttribute('position').count;
  const positions: number[] = Array.from(top.getAttribute('position').array as Float32Array);
  const normals: number[] = Array.from(top.getAttribute('normal').array as Float32Array);
  const skirt: number[] = new Array(topCount * 2).fill(0).map((_, i) => (i % 2 === 0 ? 0 : 1));
  const index: number[] = Array.from(top.getIndex()!.array as ArrayLike<number>);
  top.dispose();

  // The planted area is inset a little from the bund, so the skirt sits just inside the edge.
  for (const ring of [shape.ring, ...shape.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!;
      const [bx, bz] = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (bz - az) / len;
      const nz = -(bx - ax) / len;
      const base = positions.length / 3;
      for (const [x, z, y] of [[ax, az, 0], [bx, bz, 0], [bx, bz, 1], [ax, az, 1]] as const) {
        positions.push(x, 0, z);
        normals.push(nx, 0, nz);
        skirt.push(1, y);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('aSkirt', new THREE.Float32BufferAttribute(skirt, 2));
  const vertexCount = positions.length / 3;
  const variation = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount; i++) variation.set([tint, heightVar], i * 2);
  geo.setAttribute('aVar', new THREE.BufferAttribute(variation, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 2;
  return geo;
}
