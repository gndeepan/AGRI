import * as THREE from 'three';

/** Uniforms shared by every swaying plant material (rice, panicles, bund grass, canopy). */
export interface WindUniforms {
  uTime: THREE.IUniform<number>;
  uWind: THREE.IUniform<number>;
  uWindDir: THREE.IUniform<THREE.Vector2>;
}

export function createWindUniforms(): WindUniforms {
  return {
    uTime: { value: 0 },
    uWind: { value: 0.2 },
    uWindDir: { value: new THREE.Vector2(1, 0) },
  };
}

/** GLSL for the travelling gust field, shared by plants and the far canopy so they move together. */
export const GUST_GLSL = /* glsl */ `
float gustAt(vec2 xz) {
  float travel = dot(xz, uWindDir);
  float across = dot(xz, vec2(-uWindDir.y, uWindDir.x));
  float w1 = sin(uTime * 1.6 - travel * 0.38 + sin(across * 0.07) * 2.0);
  float w2 = sin(uTime * 0.7 - travel * 0.11 + across * 0.03);
  return clamp(0.5 + 0.35 * w1 + 0.3 * w2, 0.0, 1.2);
}
`;

const SWAY_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform vec2 uPatchCenter;
uniform float uFadeStart;
uniform float uFadeEnd;
attribute vec4 aRand;
attribute float aBlade;
attribute float aT;
varying float vT;
varying float vRnd;
varying float vBlade;
${GUST_GLSL}

vec3 windSway(vec3 p, float weight, vec3 origin) {
  float gust = gustAt(origin.xz);
  float flutter = sin(uTime * 7.0 + aRand.z * 40.0 + p.y * 9.0) * 0.035;
  float amount = (uWind * (0.25 + 0.85 * gust) + 0.02 + flutter * uWind) * weight;
  vec3 localDir = transpose(mat3(instanceMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y);
  localDir = normalize(localDir + vec3(1e-5));
  p.xz += localDir.xz * amount * 0.55;
  p.y -= amount * amount * 0.22;
  return p;
}

/** 1 inside the patch, dissolving to 0 at its rim so the far canopy can take over. */
float patchKeep(vec3 origin) {
  float d = distance(origin.xz, uPatchCenter);
  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, d);
  return step(aRand.z, fade);
}
`;

const BLADE_VERTEX = /* glsl */ `
vec3 transformed = vec3(position);
vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
float visible = step(aBlade, uTillers + aRand.w * 0.12 - 0.001) * step(0.01, uPresence) * patchKeep(origin);
float h = mix(uHeight, 0.14, uStubble) * aRand.x;
transformed.y *= h * mix(1.0, 0.85, uStubble);
// Clumps spread as they tiller; seedlings are a tight tuft.
transformed.xz *= mix(0.45, 1.0, clamp(h * 1.2, 0.0, 1.0)) * (0.75 + 0.45 * uTillers);
transformed *= visible;
transformed = windSway(transformed, aT * aT * h * (1.0 - uStubble * 0.9), origin);
vT = aT;
vRnd = aRand.y;
vBlade = aBlade;
`;

const PANICLE_VERTEX = /* glsl */ `
vec3 transformed = vec3(position);
vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
float visible = step(aBlade, 0.3 + uEmerge * 0.7 + aRand.w * 0.1) * step(0.02, uEmerge) * step(0.01, uPresence) * patchKeep(origin);
// Bend each panicle about its own base: filled grain makes the tip hang over.
vec2 pBase = aPan.xy;
float pLen = max(aPan.z, 0.01);
vec3 local = transformed - vec3(pBase.x, 0.0, pBase.y);
vec2 outDir = normalize(pBase + vec2(1e-4, 0.0));
float theta = (uDroop * 1.75 + 0.08) * clamp(local.y / pLen, 0.0, 1.2) * (0.85 + 0.3 * aRand.y);
float c = cos(theta);
float s = sin(theta);
float r = dot(local.xz, outDir);
vec2 perp = local.xz - outDir * r;
float r2 = r * c + local.y * s;
float y2 = -r * s + local.y * c;
transformed = vec3(outDir.x * r2 + perp.x + pBase.x, y2, outDir.y * r2 + perp.y + pBase.y);
transformed *= mix(0.45, 1.0, uEmerge);
float h = uHeight * aRand.x;
transformed.y += h * 0.84 - (1.0 - uEmerge) * 0.12;
transformed *= visible;
transformed = windSway(transformed, h * (0.85 + 0.15 * aT), origin);
vT = aT;
vRnd = aRand.y;
vBlade = aBlade;
`;

/** Softer, more upward normals: thin blades otherwise flicker between lit and black. */
const SOFT_NORMAL = /* glsl */ `
vec3 objectNormal = normalize(mix(vec3(normal), vec3(0.0, 1.0, 0.0), 0.35));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

const FRAG_DECL = /* glsl */ `
varying float vT;
varying float vRnd;
varying float vBlade;
uniform float uWet;
uniform float uTranslucency;
`;

const BLADE_FRAGMENT = /* glsl */ `
vec3 leaf = mix(uBaseColor, uTipColor, smoothstep(0.35, 1.0, vT));
leaf *= 0.84 + 0.28 * vRnd;
// Senescence: the oldest (outer) leaves die first, browning from the tip down.
float sen = uSenescence * 1.15;
float dead = smoothstep(1.0 - sen, 1.0 - sen + 0.25, vBlade + vRnd * 0.15) * smoothstep(0.0, 0.45, vT + sen * 0.5);
leaf = mix(leaf, vec3(0.74, 0.6, 0.32) * (0.8 + 0.35 * vRnd), dead * step(0.01, uSenescence));
// Leaf sheaths low in the clump sit in shadow and are paler.
leaf *= mix(0.45, 1.0, smoothstep(0.0, 0.5, vT));
diffuseColor.rgb *= leaf * mix(1.0, 0.8, uWet);
`;

const PANICLE_FRAGMENT = /* glsl */ `
vec3 grain = uPanicleColor * (0.82 + 0.32 * vRnd) * mix(0.78, 1.06, vT);
// Anthesis: tiny cream anthers on a share of spikelets.
grain = mix(grain, vec3(0.95, 0.93, 0.78), uAnthesis * step(0.62, fract(vRnd * 37.0 + vT * 11.0)) * 0.7);
diffuseColor.rgb *= grain * mix(1.0, 0.82, uWet);
`;

const WET_ROUGHNESS = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.22, uWet);
`;

/** Light coming through a thin leaf when the sun is behind it — rice glows in backlight. */
const TRANSLUCENCY = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  vec3 toCam = normalize(vViewPosition);
  float back = pow(clamp(dot(-toCam, directionalLights[0].direction), 0.0, 1.0), 3.0);
  outgoingLight += diffuseColor.rgb * directionalLights[0].color * back * uTranslucency;
}
#endif
#include <opaque_fragment>
`;

export interface PatchUniforms {
  uPatchCenter: THREE.IUniform<THREE.Vector2>;
  uFadeStart: THREE.IUniform<number>;
  uFadeEnd: THREE.IUniform<number>;
}

export interface BladeUniforms extends PatchUniforms {
  uHeight: THREE.IUniform<number>;
  uTillers: THREE.IUniform<number>;
  uPresence: THREE.IUniform<number>;
  uStubble: THREE.IUniform<number>;
  uSenescence: THREE.IUniform<number>;
  uWet: THREE.IUniform<number>;
  uTranslucency: THREE.IUniform<number>;
  uBaseColor: THREE.IUniform<THREE.Color>;
  uTipColor: THREE.IUniform<THREE.Color>;
}

export interface PanicleUniforms extends PatchUniforms {
  uHeight: THREE.IUniform<number>;
  uEmerge: THREE.IUniform<number>;
  uDroop: THREE.IUniform<number>;
  uPresence: THREE.IUniform<number>;
  uAnthesis: THREE.IUniform<number>;
  uWet: THREE.IUniform<number>;
  uTranslucency: THREE.IUniform<number>;
  uPanicleColor: THREE.IUniform<THREE.Color>;
}

type AnyUniforms = Record<string, THREE.IUniform>;

const BLADE_DECL = `uniform float uHeight; uniform float uTillers; uniform float uPresence; uniform float uStubble; uniform float uSenescence; uniform vec3 uBaseColor; uniform vec3 uTipColor;`;
const PANICLE_DECL = `uniform float uHeight; uniform float uEmerge; uniform float uDroop; uniform float uPresence; uniform float uAnthesis; uniform vec3 uPanicleColor; attribute vec4 aPan;`;
// Fragment shaders must not see vertex-only `attribute` declarations.
const PANICLE_FRAG_DECL = `uniform float uHeight; uniform float uEmerge; uniform float uDroop; uniform float uPresence; uniform float uAnthesis; uniform vec3 uPanicleColor;`;

function patch(
  material: THREE.Material,
  variant: string,
  uniforms: AnyUniforms,
  vertexDecl: string,
  vertexBody: string,
  fragment: { decl: string; color: string } | null,
) {
  // One compiled program per variant, shared by every material instance of it.
  const key = `bhoomi-${variant}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexDecl}\n${SWAY_GLSL}`)
      .replace('#include <beginnormal_vertex>', SOFT_NORMAL)
      .replace('#include <begin_vertex>', vertexBody);
    if (fragment) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${fragment.decl}\n${FRAG_DECL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${fragment.color}`)
        .replace('#include <roughnessmap_fragment>', WET_ROUGHNESS)
        .replace('#include <opaque_fragment>', TRANSLUCENCY);
    }
  };
  material.customProgramCacheKey = () => key;
}

function patchUniforms(): PatchUniforms {
  return {
    uPatchCenter: { value: new THREE.Vector2(0, 0) },
    uFadeStart: { value: 1e6 },
    uFadeEnd: { value: 2e6 },
  };
}

export function createBladeMaterials(wind: WindUniforms, map?: THREE.Texture | null) {
  const uniforms: BladeUniforms = {
    ...patchUniforms(),
    uHeight: { value: 0.3 },
    uTillers: { value: 0.3 },
    uPresence: { value: 1 },
    uStubble: { value: 0 },
    uSenescence: { value: 0 },
    uWet: { value: 0 },
    uTranslucency: { value: 0.55 },
    uBaseColor: { value: new THREE.Color(0.3, 0.6, 0.2) },
    uTipColor: { value: new THREE.Color(0.4, 0.7, 0.25) },
  };
  const all = { ...wind, ...uniforms } as unknown as AnyUniforms;
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0, map: map ?? null });
  patch(material, 'blade', all, BLADE_DECL, BLADE_VERTEX, { decl: BLADE_DECL, color: BLADE_FRAGMENT });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  patch(depth, 'blade-depth', all, BLADE_DECL, BLADE_VERTEX, null);
  return { material, depth, uniforms };
}

export function createPanicleMaterials(wind: WindUniforms) {
  const uniforms: PanicleUniforms = {
    ...patchUniforms(),
    uHeight: { value: 1 },
    uEmerge: { value: 0 },
    uDroop: { value: 0 },
    uPresence: { value: 1 },
    uAnthesis: { value: 0 },
    uWet: { value: 0 },
    uTranslucency: { value: 0.25 },
    uPanicleColor: { value: new THREE.Color(0.6, 0.7, 0.3) },
  };
  const all = { ...wind, ...uniforms } as unknown as AnyUniforms;
  const material = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0, side: THREE.DoubleSide });
  patch(material, 'panicle', all, PANICLE_DECL, PANICLE_VERTEX, { decl: PANICLE_FRAG_DECL, color: PANICLE_FRAGMENT });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  patch(depth, 'panicle-depth', all, PANICLE_DECL, PANICLE_VERTEX, null);
  return { material, depth, uniforms };
}

/** Sets a uniform colour from perceptual sRGB components. */
export function setSrgb(color: THREE.Color, rgb: readonly [number, number, number]) {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}
