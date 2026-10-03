/**
 * GLSL for the login scene. All colours are linear; every material reads one shared uniform set
 * (sun, sky, fog, wind, crop state) so the sky, its reflection in the paddy water, the rice and
 * the distant canopy are lit consistently.
 */

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < OCTAVES; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
`

export const COMMON_UNIFORMS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uCloudCover;
uniform vec2 uCloudDrift;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uGrow;
uniform float uPresence;
uniform float uPanicle;
uniform float uWater;
uniform vec3 uLeaf;
uniform vec3 uGrain;
`

/** Sky radiance for a world direction: gradient, sun, drifting lit clouds, horizon haze. */
export const SKY_GLSL = /* glsl */ `
vec3 skyColor(vec3 dir) {
  float y = max(dir.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(y, 0.42));
  float sunDot = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * pow(sunDot, 5.0) * 0.1 * (1.0 - y);
  if (dir.y > 0.012) {
    vec2 uv = dir.xz / (dir.y + 0.1) * 0.75 + uCloudDrift;
    float d = fbm(uv * 1.4);
    float lo = 1.0 - uCloudCover;
    float cov = smoothstep(lo - 0.08, lo + 0.3, d);
    // Light from the sun side: denser material toward the sun = shaded underside.
    float dSun = fbm(uv * 1.4 + uSunDir.xz * 0.16);
    float shade = clamp(1.05 - (dSun - d) * 3.2, 0.42, 1.25);
    vec3 shadowCol = mix(uZenith, vec3(0.55, 0.56, 0.62), 0.55) * 0.9;
    vec3 litCol = uSunColor * 0.95 + uHorizon * 0.25;
    vec3 cloud = mix(shadowCol, litCol, clamp(shade - 0.35, 0.0, 1.0));
    cloud += uSunColor * pow(sunDot, 10.0) * (1.0 - cov * 0.6) * 0.3;
    float fade = smoothstep(0.0, 0.22, dir.y);
    col = mix(col, cloud, cov * fade * 0.94);
  }
  col += uSunColor * (pow(sunDot, 2600.0) * 14.0 + pow(sunDot, 180.0) * 0.22);
  col = mix(col, uHorizon * 1.04, pow(1.0 - y, 7.0) * 0.55);
  return col;
}
`

const OUTPUT_GLSL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

export const skyFragment = /* glsl */ `
${COMMON_UNIFORMS_GLSL}
${NOISE_GLSL}
${SKY_GLSL}
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = dir.y < 0.0 ? uFogColor : skyColor(dir);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_GLSL}
}
`

/** Shared wind displacement for anything planted in the field (uv.y = 0 at base, 1 at tip). */
const WIND_GLSL = /* glsl */ `
vec3 windOffset(vec3 world, float t, float rnd) {
  float phase = dot(world.xz, uWindDir) * 0.16 - uTime * 1.5;
  float gust = 0.5 + 0.5 * sin(phase) * (0.6 + 0.4 * sin(phase * 0.41 + 1.3));
  float flutter = sin(uTime * 3.7 + rnd * 31.0 + world.x * 0.6) * 0.18;
  float bend = (gust + flutter) * uWindStrength * t * t;
  return vec3(uWindDir.x * bend * 0.32, -bend * bend * 0.06, uWindDir.y * bend * 0.32);
}
`

export const riceVertex = /* glsl */ `
${COMMON_UNIFORMS_GLSL}
${WIND_GLSL}
attribute float aRand;
varying float vT;
varying float vRand;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  float t = uv.y;
#ifdef PANICLE
  // Panicles grow out of the clump top and droop as they fill.
  vec3 base = vec3(0.0, PANICLE_BASE, 0.0);
  p = base + (p - base) * uPanicle;
#endif
  float g = uGrow * uPresence;
  p.y *= g;
  p.xz *= mix(0.55, 1.0, uGrow);
  vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
  world.xyz += windOffset(world.xyz, t * g, aRand);
  vWorld = world.xyz;
  vT = t;
  vRand = aRand;
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

export const riceFragment = /* glsl */ `
${COMMON_UNIFORMS_GLSL}
varying float vT;
varying float vRand;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 N = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorld);
#ifdef PANICLE
  vec3 base = uGrain * (0.85 + 0.3 * vRand);
#else
  vec3 base = uLeaf * mix(0.42, 1.12, vT) * (0.82 + 0.36 * vRand);
  base = mix(base, base * vec3(1.18, 1.1, 0.62), vT * vT * 0.3);
#endif
  float wrap = max((dot(N, uSunDir) + 0.45) / 1.45, 0.0);
  float back = pow(max(dot(-V, uSunDir), 0.0), 3.0) * (0.35 + 0.65 * vT);
  vec3 amb = mix(uHemiGround, uHemiSky, 0.5 + 0.5 * N.y) * 0.6;
  vec3 col = base * (amb + uSunColor * wrap * 0.6);
  col += base * uSunColor * back * 0.7 * vec3(1.0, 1.06, 0.55);
  vec3 H = normalize(V + uSunDir);
  col += uSunColor * pow(max(dot(N, H), 0.0), 48.0) * 0.12;
  col *= mix(0.4, 1.0, smoothstep(0.0, 0.45, vT));
  float dist = length(cameraPosition - vWorld);
  float fog = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
  gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
  ${OUTPUT_GLSL}
}
`

export const fieldVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

/** Paddy surface: puddled mud, standing water reflecting the sky, and a far canopy band. */
export const fieldFragment = /* glsl */ `
${COMMON_UNIFORMS_GLSL}
${NOISE_GLSL}
${SKY_GLSL}
varying vec3 vWorld;
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vWorld.xz;
  float n = fbm(p * 0.32);
  float n2 = vnoise(p * 3.3);
  float wet = clamp(uWater * 1.5, 0.0, 1.0);
  vec3 mud = mix(vec3(0.33, 0.24, 0.15), vec3(0.085, 0.065, 0.045), wet) * (0.78 + 0.4 * n) * (0.88 + 0.24 * n2);
  float ndl = max(uSunDir.y, 0.0);
  vec3 lit = mud * (uSunColor * (0.35 + 0.65 * ndl) + uHemiSky * 0.45);

  float waterMask = smoothstep(0.0, 0.1, uWater - n * 0.6 + 0.12);
  vec2 rp = p * 1.6 + vec2(uTime * 0.22, uTime * 0.15);
  float r1 = vnoise(rp) - 0.5;
  float r2 = vnoise(rp * 2.3 + 7.1) - 0.5;
  vec3 Nw = normalize(vec3((r1 + r2 * 0.5) * 0.09, 1.0, (vnoise(rp + 3.7) - 0.5 + r2 * 0.4) * 0.09));
  vec3 R = reflect(-V, Nw);
  R.y = max(R.y, 0.004);
  vec3 refl = skyColor(normalize(R));
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(Nw, V), 0.0), 5.0);
  vec3 body = vec3(0.07, 0.075, 0.045) * (uHemiSky * 0.5 + 0.5);
  vec3 water = mix(body, refl, clamp(fres * 1.15 + 0.15, 0.0, 1.0));
  vec3 col = mix(lit, water, waterMask);

  // Beyond the instanced rice the field reads as a canopy surface.
  float canopyAmt = smoothstep(26.0, 58.0, dist) * smoothstep(0.34, 0.72, uGrow) * uPresence;
  float wave = 0.5 + 0.5 * sin(dot(p, uWindDir) * 0.16 - uTime * 1.5);
  float rows = 0.92 + 0.08 * sin(p.x * 9.0);
  vec3 canopy = uLeaf * (0.5 + 0.38 * fbm(p * 0.6)) * rows;
  canopy *= uSunColor * (0.55 + 0.45 * ndl) + uHemiSky * 0.4;
  canopy *= 0.88 + 0.22 * wave;
  canopy = mix(canopy, uGrain * (uSunColor * 0.85 + 0.15), uPanicle * 0.4);
  col = mix(col, canopy, canopyAmt);

  float fog = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
  gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
  ${OUTPUT_GLSL}
}
`
