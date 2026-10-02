import * as THREE from 'three';
import { GUST_GLSL, type WindUniforms } from '../scene/plantMaterials';

/**
 * One shader for every non-paddy crop. The plant geometry is a mature plant; the
 * vertex shader grows it (scale, leaves unfolding bottom-up, flowers opening, fruits
 * setting and swelling, heads emerging and nodding) from a handful of uniforms, so the
 * same instanced mesh serves the whole season and scrubbing is free.
 */
export interface CropUniforms {
  uScale: THREE.IUniform<number>;
  uLeaves: THREE.IUniform<number>;
  uSen: THREE.IUniform<number>;
  uShed: THREE.IUniform<number>;
  uFlower: THREE.IUniform<number>;
  uFlowerDrop: THREE.IUniform<number>;
  uFruit: THREE.IUniform<number>;
  uFruitSize: THREE.IUniform<number>;
  uRipe: THREE.IUniform<number>;
  uRipeSwell: THREE.IUniform<number>;
  uHead: THREE.IUniform<number>;
  uDroop: THREE.IUniform<number>;
  uPresence: THREE.IUniform<number>;
  uStiff: THREE.IUniform<number>;
  uWet: THREE.IUniform<number>;
  uTranslucency: THREE.IUniform<number>;
  uLeafColor: THREE.IUniform<THREE.Color>;
  uLeafDead: THREE.IUniform<THREE.Color>;
  uStemRipe: THREE.IUniform<THREE.Color>;
  uPatchCenter: THREE.IUniform<THREE.Vector2>;
  uFadeStart: THREE.IUniform<number>;
  uFadeEnd: THREE.IUniform<number>;
}

const DECL = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform float uScale;
uniform float uLeaves;
uniform float uSen;
uniform float uShed;
uniform float uFlower;
uniform float uFlowerDrop;
uniform float uFruit;
uniform float uFruitSize;
uniform float uRipe;
uniform float uRipeSwell;
uniform float uHead;
uniform float uDroop;
uniform float uPresence;
uniform float uStiff;
uniform vec2 uPatchCenter;
uniform float uFadeStart;
uniform float uFadeEnd;
attribute vec4 aRand;
attribute vec3 aColor2;
attribute float aPart;
attribute float aOrder;
attribute float aT;
attribute vec3 aPivot;
attribute vec3 aMorph;
varying float vPart;
varying float vOrder;
varying float vT;
varying float vRnd;
varying vec3 vColor2;
${GUST_GLSL}
`;

const VERTEX = /* glsl */ `
vec3 transformed = vec3(position);
vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
// Per-plant stagger: not every plant is at exactly the same point of development.
float lag = (aRand.w - 0.5) * 0.12;
float grow = 1.0;
if (aPart < 0.5) {
  grow = 1.0;
} else if (aPart < 1.5) {
  grow = clamp((uLeaves + lag - aOrder) * 9.0, 0.0, 1.0);
  grow *= 1.0 - uShed * clamp((uSen + lag - 0.3 - aOrder) * 9.0, 0.0, 1.0);
} else if (aPart < 2.5) {
  grow = clamp((uFlower + lag - aOrder) * 8.0, 0.0, 1.0) * (1.0 - clamp((uFlowerDrop + lag - aOrder) * 8.0, 0.0, 1.0));
} else if (aPart < 3.5) {
  float ripe = smoothstep(aOrder * 0.5, aOrder * 0.5 + 0.35, uRipe + lag);
  grow = clamp((uFruit + lag - aOrder) * 6.0, 0.0, 1.0) * mix(0.25, 1.0, uFruitSize) * (1.0 + uRipeSwell * ripe);
} else {
  grow = clamp((uHead + lag - aOrder) * 6.0, 0.0, 1.0);
}
transformed = aPivot + (transformed - aPivot) * grow;
transformed += aMorph * clamp(uDroop + lag, 0.0, 1.0) * min(grow, 1.0);
float hs = uScale * aRand.x;
transformed.y *= hs;
transformed.xz *= mix(0.35, 1.0, sqrt(max(uScale, 0.0))) * (0.85 + 0.3 * aRand.x);
float d = distance(origin.xz, uPatchCenter);
float keep = step(aRand.z, 1.0 - smoothstep(uFadeStart, uFadeEnd, d));
transformed *= step(0.01, uPresence) * keep;
// Wind: taller parts of taller plants move more; stiff crops (banana, castor) less.
float gust = gustAt(origin.xz);
float weight = aT * aT * (1.0 - uStiff) * clamp(hs * 1.2, 0.15, 2.0);
float flutter = sin(uTime * 6.0 + aRand.y * 40.0 + transformed.y * 7.0) * 0.03 * step(0.5, aPart);
float amount = (uWind * (0.25 + 0.85 * gust) + 0.02 + flutter * uWind) * weight;
vec3 localDir = normalize(transpose(mat3(instanceMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y) + vec3(1e-5));
transformed.xz += localDir.xz * amount * 0.45;
transformed.y -= amount * amount * 0.15;
vPart = aPart;
vOrder = aOrder;
vT = aT;
vRnd = aRand.y;
vColor2 = aColor2;
`;

const FRAG_DECL = /* glsl */ `
uniform float uSen;
uniform float uRipe;
uniform float uWet;
uniform float uTranslucency;
uniform vec3 uLeafColor;
uniform vec3 uLeafDead;
uniform vec3 uStemRipe;
varying float vPart;
varying float vOrder;
varying float vT;
varying float vRnd;
varying vec3 vColor2;
`;

const COLOR = /* glsl */ `
vec3 base = vColor.rgb;
vec3 col;
if (vPart < 0.5) {
  col = mix(base, uStemRipe, clamp(max(uRipe, uSen * 0.8), 0.0, 1.0));
} else if (vPart < 1.5) {
  // Leaf geometry carries only a brightness; the hue follows the crop stage.
  col = uLeafColor * base.r * (0.86 + 0.26 * vRnd);
  float dead = smoothstep(vOrder - 0.06, vOrder + 0.06, uSen + (vRnd - 0.5) * 0.08);
  col = mix(col, uLeafDead * base.r * (0.85 + 0.3 * vRnd), dead);
} else if (vPart < 2.5) {
  col = base;
} else if (vPart < 3.5) {
  col = mix(base, vColor2, smoothstep(vOrder * 0.5, vOrder * 0.5 + 0.35, uRipe));
} else {
  col = mix(base, vColor2, uRipe);
}
diffuseColor.rgb = col * mix(1.0, 0.8, uWet);
`;

const ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.25, uWet);
// Glossy fruit (brinjal, tomato, chilli) and waxy pods.
if (vPart > 2.5 && vPart < 3.5) roughnessFactor = min(roughnessFactor, 0.32);
`;

const TRANSLUCENT = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
if (vPart > 0.5 && vPart < 2.5) {
  vec3 toCam = normalize(vViewPosition);
  float back = pow(clamp(dot(-toCam, directionalLights[0].direction), 0.0, 1.0), 3.0);
  outgoingLight += diffuseColor.rgb * directionalLights[0].color * back * uTranslucency;
}
#endif
#include <opaque_fragment>
`;

const SOFT_NORMAL = /* glsl */ `
vec3 objectNormal = normalize(mix(vec3(normal), vec3(0.0, 1.0, 0.0), 0.25));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

function patchShader(material: THREE.Material, uniforms: Record<string, THREE.IUniform>, key: string, fragment: boolean) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL}`)
      .replace('#include <beginnormal_vertex>', SOFT_NORMAL)
      .replace('#include <begin_vertex>', VERTEX);
    if (fragment) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
        .replace('#include <roughnessmap_fragment>', ROUGH)
        .replace('#include <opaque_fragment>', TRANSLUCENT);
    }
  };
  material.customProgramCacheKey = () => key;
}

export function createCropMaterials(wind: WindUniforms) {
  const uniforms: CropUniforms = {
    uScale: { value: 0.5 },
    uLeaves: { value: 1 },
    uSen: { value: 0 },
    uShed: { value: 0 },
    uFlower: { value: 0 },
    uFlowerDrop: { value: 0 },
    uFruit: { value: 0 },
    uFruitSize: { value: 0 },
    uRipe: { value: 0 },
    uRipeSwell: { value: 0 },
    uHead: { value: 0 },
    uDroop: { value: 0 },
    uPresence: { value: 1 },
    uStiff: { value: 0.4 },
    uWet: { value: 0 },
    uTranslucency: { value: 0.45 },
    uLeafColor: { value: new THREE.Color(0.3, 0.6, 0.2) },
    uLeafDead: { value: new THREE.Color(0.7, 0.58, 0.38) },
    uStemRipe: { value: new THREE.Color(0.7, 0.6, 0.4) },
    uPatchCenter: { value: new THREE.Vector2(0, 0) },
    uFadeStart: { value: 1e6 },
    uFadeEnd: { value: 2e6 },
  };
  const all = { ...wind, ...uniforms } as unknown as Record<string, THREE.IUniform>;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0 });
  patchShader(material, all, 'bhoomi-crop', true);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  patchShader(depth, all, 'bhoomi-crop-depth', false);
  return { material, depth, uniforms };
}
