import * as THREE from 'three';

/**
 * Surface kinds for the vertex-coloured figures (farmer, birds, insects). Each vertex carries its
 * kind in `aSurf`, so one material renders skin, cloth, feathers and horn on the same mesh with
 * their own roughness, sheen and procedural micro-detail (pores, weave, feather rows, grain).
 * Without this the figures read as matte clay: one flat colour and one roughness everywhere.
 */
export const SURF = {
  skin: 0,
  cloth: 1,
  feather: 2,
  horn: 3,
  metal: 4,
  wood: 5,
  hair: 6,
  eye: 7,
  /** Flannel check: dark bands both ways with thin light lines, on a cotton weave. */
  plaid: 8,
  /** Denim twill with uneven, faded indigo. */
  denim: 9,
  /** Coarse open-weave sacking. */
  burlap: 10,
  /** Loose dry straw: streaky, uneven gold. */
  straw: 11,
  /** Plaited straw (a hat): fine over-under weave, slightly glossy. */
  wovenStraw: 12,
} as const;
export type SurfKind = keyof typeof SURF;

const VERT_DECL = /* glsl */ `
attribute float aSurf;
varying float vSurf;
varying vec3 vObjPos;
`;

const VERT_BODY = /* glsl */ `
#include <begin_vertex>
vSurf = aSurf;
vObjPos = position;
`;

const FRAG_DECL = /* glsl */ `
varying float vSurf;
varying vec3 vObjPos;

float oHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float oNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(oHash(i), oHash(i + vec3(1, 0, 0)), f.x), mix(oHash(i + vec3(0, 1, 0)), oHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(oHash(i + vec3(0, 0, 1)), oHash(i + vec3(1, 0, 1)), f.x), mix(oHash(i + vec3(0, 1, 1)), oHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float oFbm(vec3 x) { return oNoise(x) * 0.6 + oNoise(x * 2.03) * 0.28 + oNoise(x * 4.1) * 0.12; }
/** 1 while a pattern of this frequency (cycles per object unit) is resolvable, 0 once it would alias. */
float oResolve(float freq) {
  float w = length(fwidth(vObjPos)) * freq;
  return 1.0 - smoothstep(0.35, 1.0, w);
}

// Per-kind detail, filled in once per fragment.
float oHeight;   // bump height in object units
float oAlbedo;   // albedo multiplier
float oRough;    // roughness
float oMetal;    // metalness
float oSheen;    // sheen multiplier

void organicDetail() {
  int k = int(vSurf + 0.5);
  vec3 p = vObjPos;
  oHeight = 0.0; oAlbedo = 1.0; oRough = 0.8; oMetal = 0.0; oSheen = 0.0;
  if (k == 0) {
    // Skin: uneven tone, fine pores, soft warm sheen at grazing angles.
    float tone = oFbm(p * 18.0);
    float pores = oNoise(p * 520.0);
    oAlbedo = 0.9 + 0.2 * tone;
    oHeight = (pores - 0.5) * 0.00035 * oResolve(520.0) + (tone - 0.5) * 0.0012;
    oRough = 0.5 + 0.18 * tone;
    oSheen = 0.45;
  } else if (k == 1) {
    // Cotton: plain weave plus soft folds and a little grime.
    float f = 900.0;
    float warp = sin(p.x * f + sin(p.y * f) * 0.6) * sin(p.y * f);
    float weave = abs(sin(p.y * f * 0.5)) * 0.5 + abs(sin((p.x + p.z) * f * 0.5)) * 0.5;
    float folds = oFbm(p * vec3(6.0, 14.0, 6.0));
    oHeight = (weave - 0.5) * 0.0004 * oResolve(f * 0.16) + (folds - 0.5) * 0.009;
    oAlbedo = (0.88 + 0.12 * weave * oResolve(f * 0.16)) * (0.9 + 0.16 * folds) * (0.94 + 0.06 * warp);
    oRough = 0.95;
    oSheen = 0.9;
  } else if (k == 2) {
    // Feathers: overlapping rows (scalloped edges) with fine barbs along each feather.
    float rows = 70.0;
    float row = fract(p.z * rows + oNoise(p * 40.0) * 0.8 + abs(p.x) * 18.0);
    float barbs = sin((p.x * 1.3 + p.y) * 1400.0) * 0.5 + 0.5;
    oHeight = (smoothstep(0.0, 0.9, row) - 0.5) * 0.0012 * oResolve(rows) + (barbs - 0.5) * 0.00012 * oResolve(220.0);
    oAlbedo = (0.86 + 0.18 * row) * (0.95 + 0.1 * barbs * oResolve(220.0)) * (0.93 + 0.14 * oNoise(p * 60.0));
    oRough = 0.62 + 0.15 * row;
    oSheen = 0.6;
  } else if (k == 3) {
    // Horn / keratin (beaks, legs, nails) and insect cuticle: smooth, faintly glossy.
    float n = oFbm(p * 90.0);
    oAlbedo = 0.9 + 0.18 * n;
    oHeight = (n - 0.5) * 0.0002;
    oRough = 0.32 + 0.12 * n;
  } else if (k == 4) {
    // Worn steel: brushed streaks and soil rubbed into the low spots.
    float streak = oNoise(vec3(p.x * 6.0, p.y * 400.0, p.z * 6.0));
    float grime = smoothstep(0.45, 0.75, oFbm(p * 30.0));
    oAlbedo = mix(1.0, 0.45, grime);
    oRough = mix(0.32 + 0.2 * streak, 0.9, grime);
    oMetal = mix(0.85, 0.1, grime);
    oHeight = (streak - 0.5) * 0.0001;
  } else if (k == 5) {
    // Wood: grain running along the handle / post.
    float grain = sin(p.y * 260.0 + oFbm(p * vec3(30.0, 3.0, 30.0)) * 9.0) * 0.5 + 0.5;
    oAlbedo = 0.82 + 0.3 * grain;
    oHeight = (grain - 0.5) * 0.0004 * oResolve(40.0);
    oRough = 0.72 + 0.15 * grain;
  } else if (k == 6) {
    // Hair: strands along y with an anisotropic-looking streaky sheen.
    float strands = oNoise(vec3(p.x * 900.0, p.y * 40.0, p.z * 900.0));
    oAlbedo = 0.8 + 0.4 * strands;
    oHeight = (strands - 0.5) * 0.0003 * oResolve(300.0);
    oRough = 0.42;
    oSheen = 0.3;
  } else if (k == 7) {
    // Eyes: wet and glossy, so they catch a highlight.
    oRough = 0.06;
  } else if (k == 8) {
    float f = 9.0;
    float px = fract(p.x * f);
    float py = fract((p.y + p.z) * f);
    float bx = smoothstep(0.52, 0.58, px) * (1.0 - smoothstep(0.88, 0.94, px));
    float by = smoothstep(0.52, 0.58, py) * (1.0 - smoothstep(0.88, 0.94, py));
    float thin = (1.0 - smoothstep(0.0, 0.035, abs(px - 0.25))) + (1.0 - smoothstep(0.0, 0.035, abs(py - 0.25)));
    float weave = abs(sin(p.y * 900.0)) * 0.5 + abs(sin((p.x + p.z) * 900.0)) * 0.5;
    float folds = oFbm(p * vec3(6.0, 14.0, 6.0));
    oAlbedo = mix(1.0, 0.38, bx) * mix(1.0, 0.45, by) * (1.0 + 0.9 * clamp(thin, 0.0, 1.0)) * (0.9 + 0.12 * weave * oResolve(150.0)) * (0.9 + 0.16 * folds);
    oHeight = (weave - 0.5) * 0.0004 * oResolve(150.0) + (folds - 0.5) * 0.01;
    oRough = 0.93;
    oSheen = 0.8;
  } else if (k == 9) {
    float twill = sin((p.x * 0.7 + p.y) * 1500.0 + p.z * 900.0) * 0.5 + 0.5;
    float fade = oFbm(p * vec3(8.0, 3.0, 8.0));
    float wear = smoothstep(0.55, 0.85, oFbm(p * 22.0));
    oAlbedo = (0.78 + 0.34 * fade) * (0.93 + 0.12 * twill * oResolve(240.0)) * (1.0 + 0.35 * wear);
    oHeight = (twill - 0.5) * 0.00025 * oResolve(240.0) + (oFbm(p * vec3(5.0, 12.0, 5.0)) - 0.5) * 0.012;
    oRough = 0.88;
    oSheen = 0.45;
  } else if (k == 10) {
    float f = 220.0;
    float wx = abs(sin(p.x * f + oNoise(p * 30.0) * 2.0));
    float wy = abs(sin((p.y + p.z) * f));
    float weave = wx * wy;
    float stain = oFbm(p * 12.0);
    oAlbedo = (0.7 + 0.42 * weave * oResolve(f * 0.16) + 0.1 * (1.0 - oResolve(f * 0.16))) * (0.85 + 0.25 * stain);
    oHeight = (weave - 0.5) * 0.0018 * oResolve(f * 0.16) + (stain - 0.5) * 0.006;
    oRough = 0.97;
    oSheen = 0.55;
  } else if (k == 11) {
    float strands = oNoise(vec3(p.x * 500.0, p.y * 500.0, p.z * 500.0));
    float tone = oFbm(p * 40.0);
    oAlbedo = (0.7 + 0.5 * strands) * (0.85 + 0.3 * tone);
    oHeight = (strands - 0.5) * 0.0004 * oResolve(80.0);
    oRough = 0.6;
    oSheen = 0.35;
  } else {
    float f = 160.0;
    float a = sin(p.x * f + sin((p.y + p.z) * f) * 1.5);
    float plait = abs(a) * abs(sin((p.y + p.z) * f * 0.5));
    float tone = oFbm(p * 25.0);
    oAlbedo = (0.78 + 0.32 * plait * oResolve(f * 0.16)) * (0.88 + 0.24 * tone);
    oHeight = (plait - 0.5) * 0.0012 * oResolve(f * 0.16);
    oRough = 0.62;
    oSheen = 0.3;
  }
}

/** Bump from a height value, via screen-space derivatives (Mikkelsen 2010). */
vec3 organicBump(vec3 surfPos, vec3 n, float h) {
  vec3 dpdx = dFdx(surfPos);
  vec3 dpdy = dFdy(surfPos);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}
`;

export interface OrganicOptions {
  side?: THREE.Side;
}

/** A vertex-coloured physical material whose surface response follows each vertex's `aSurf` kind. */
export function createOrganicMaterial({ side = THREE.FrontSide }: OrganicOptions = {}): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0,
    side,
    sheen: 1,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(1, 1, 1),
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\norganicDetail();\ndiffuseColor.rgb *= oAlbedo;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = oRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = oMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = organicBump(-vViewPosition, normal, oHeight);')
      // Sheen is a material-wide colour; scale it per surface kind (cloth and feathers have it, horn and metal don't).
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.sheenColor *= oSheen * mix(vec3(1.0), diffuseColor.rgb * 1.6, 0.5);');
  };
  material.customProgramCacheKey = () => 'bhoomi-organic';
  return material;
}

/** Adds a constant `aSurf` attribute to a geometry. */
export function setSurface(g: THREE.BufferGeometry, kind: SurfKind): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(new Float32Array(count).fill(SURF[kind]), 1));
  return g;
}
