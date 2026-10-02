/**
 * GLSL ES 3.00 shaders for the live sky. Written for Bhoomi; techniques follow the published
 * approaches credited in ./CREDITS.md (fBm/domain-warped cloud layers, stateless GPU rain with
 * Marshall–Palmer drop sizes, procedural drops-on-glass refraction, midpoint-displacement bolts).
 */

const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const SKY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uFwd, uRight, uUp;
uniform float uTanHalfFov;
uniform vec3 uSunDir, uMoonDir;
uniform float uMoonPhase;
uniform vec3 uZenith, uHorizon, uSunColor, uCloudLit, uCloudShadow, uFogColor;
uniform float uSunVis, uDaylight;
uniform vec3 uCloud;          // low, mid, high cover
uniform float uOvercast, uConvective, uRain, uThunder, uFog, uMist;
uniform vec2 uWind;           // cloud drift, plane units / s (east, north)
uniform float uFlash;         // in-cloud flash 0..1
uniform vec2 uFlashPos;       // screen position of the flash
uniform float uSeed;
${NOISE}

// One cloud layer: projected onto a horizontal plane at height h. Returns rgb + alpha.
vec4 cloudLayer(vec3 dir, float h, float cover, float scale, float stretch, float speed, float billow, float darkBase, vec3 sunDir, float mu) {
  if (cover < 0.01 || dir.y < 0.015) return vec4(0.0);
  vec2 p = dir.xz / dir.y * h;
  float fade = exp(-length(p) * 0.045 / h);
  p *= scale;
  p.x *= stretch;
  vec2 w = uWind * uTime * speed + uSeed * 37.0;
  vec2 q = vec2(fbm(p + w), fbm(p + vec2(5.2, 1.3) - w * 0.6));
  float n = fbm(p + 1.6 * q + w);
  if (billow > 0.0) n = mix(n, 1.0 - abs(2.0 * n - 1.0), billow * 0.6);
  float th = 1.0 - cover;
  float d = smoothstep(th - 0.08, th + 0.32, n);
  d = max(d, uOvercast * (0.8 + 0.2 * n) * step(0.5, darkBase));
  // Self-shadowing: denser towards the sun means darker.
  vec2 toSun = normalize(sunDir.xz + 1e-4) * 0.35;
  float n2 = fbm(p + 1.6 * q + w + toSun);
  float shade = clamp(0.62 - (n2 - n) * 3.2 + (1.0 - d) * 0.25, 0.0, 1.0);
  shade *= 1.0 - darkBase * (0.35 + 0.45 * uRain + 0.3 * uConvective) * smoothstep(0.3, 1.0, d);
  vec3 col = mix(uCloudShadow, uCloudLit, shade);
  // Silver lining: thin edges glow when looking towards the sun.
  float edge = d * (1.0 - d) * 4.0;
  col += uSunColor * edge * pow(max(mu, 0.0), 5.0) * uSunVis * 1.4;
  return vec4(col, d * fade);
}

vec3 stars(vec3 dir) {
  vec2 sph = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
  vec2 g = sph * 110.0;
  vec2 id = floor(g);
  vec3 r = hash32(id);
  vec2 f = fract(g) - 0.5 - (r.xy - 0.5) * 0.7;
  float s = step(0.9, r.z) * smoothstep(0.11, 0.0, length(f)) * (0.35 + 0.65 * fract(r.z * 71.0));
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r.x * 3.0) + r.y * 40.0);
  vec3 band = vec3(0.0);
  vec3 n = normalize(vec3(0.35, 0.55, 0.76));
  float b = exp(-pow(dot(dir, n) / 0.16, 2.0));
  band = vec3(0.55, 0.6, 0.8) * b * fbm(sph * 9.0) * 0.12;
  return vec3(0.9, 0.93, 1.0) * s * tw * (0.6 + r.x) + band;
}

vec3 moon(vec3 dir) {
  float R = 0.016;
  vec3 m = uMoonDir;
  if (m.y < -0.02) return vec3(0.0);
  vec3 right = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, m);
  vec2 l = vec2(dot(dir, right), dot(dir, up)) / R;
  float r2 = dot(l, l);
  float glow = exp(-sqrt(r2) * 0.35) * 0.06;
  if (r2 > 1.0 || dot(dir, m) < 0.0) return vec3(0.75, 0.8, 0.95) * glow;
  float z = sqrt(1.0 - r2);
  float ph = uMoonPhase * 6.28318;
  vec3 lightDir = vec3(sin(ph), 0.0, -cos(ph));
  float lit = smoothstep(-0.05, 0.08, dot(vec3(l, z), lightDir));
  float maria = 0.82 + 0.18 * fbm(l * 2.2 + 3.0);
  return vec3(0.95, 0.94, 0.88) * (lit * maria + 0.03) + vec3(0.75, 0.8, 0.95) * glow;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 dir = normalize(uFwd + (ndc.x * uRight + ndc.y * uUp) * uTanHalfFov);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));

  // Below the horizon: distant hazy land.
  if (dir.y < 0.0) col = mix(uHorizon, uHorizon * 0.62 + uFogColor * 0.08, smoothstep(0.0, -0.2, dir.y));

  float mu = dot(dir, uSunDir);
  float night = 1.0 - uDaylight;
  col += stars(dir) * night * night * (1.0 - max(uCloud.x, uOvercast)) * (1.0 - uFog) * step(0.0, dir.y);
  col += moon(dir) * smoothstep(0.35, 0.95, night) * (1.0 - uOvercast * 0.9) * (1.0 - uFog * 0.8);

  // Sun: aureole, warm low-sun band and disc, all hidden by thick cloud.
  float aureole = pow(max(mu, 0.0), 6.0) * 0.2 + pow(max(mu, 0.0), 60.0) * 0.35 + pow(max(mu, 0.0), 700.0) * 0.9;
  float lowBand = exp(-max(dir.y, 0.0) * 7.0) * pow(max(mu, 0.0), 2.5) * (1.0 - smoothstep(0.1, 0.45, uSunDir.y));
  float disc = smoothstep(0.99972, 0.99992, mu);
  col += uSunColor * (aureole * uSunVis + lowBand * 0.55 * max(uSunVis, 0.25 * uDaylight) + disc * uSunVis * 3.0);

  // Haze towards the horizon.
  col = mix(col, uHorizon, exp(-max(dir.y, 0.0) * 18.0) * 0.35);

  // Cloud layers, high → low.
  vec4 c3 = cloudLayer(dir, 6.0, uCloud.z, 0.18, 0.35, 0.6, 0.0, 0.0, uSunDir, mu);
  col = mix(col, c3.rgb * 0.9 + 0.1 * uHorizon, c3.a * 0.55);
  vec4 c2 = cloudLayer(dir, 2.6, uCloud.y, 0.42, 0.8, 1.0, uConvective, 0.4, uSunDir, mu);
  col = mix(col, c2.rgb, c2.a * 0.85);
  vec4 c1 = cloudLayer(dir, 1.0, uCloud.x, 0.75, 1.0, 1.6, uConvective, 1.0, uSunDir, mu);
  col = mix(col, c1.rgb, c1.a);

  // Lightning lighting the cloud from within.
  vec2 sp = gl_FragCoord.xy / uRes;
  float fl = uFlash * exp(-length((sp - uFlashPos) * vec2(uRes.x / uRes.y, 1.0)) * 4.2);
  col += vec3(0.78, 0.82, 1.0) * fl * (0.18 + 0.5 * (c1.a + c2.a * 0.5));
  col += vec3(0.6, 0.65, 0.85) * uFlash * 0.05;

  // Fog and low mist.
  col = mix(col, uFogColor, uFog * (0.55 + 0.45 * (1.0 - clamp(dir.y * 2.5, 0.0, 1.0))));
  col = mix(col, uFogColor * 1.05 + 0.03, uMist * exp(-max(dir.y, 0.0) * 10.0));

  // Soft shoulder so the sun glow rolls off instead of clipping to white.
  col = mix(col, 0.78 + (1.0 - exp(-(col - 0.78) * 2.2)) * 0.22, step(0.78, col));

  // Dither to avoid banding in smooth gradients.
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`

/** Stateless rain streaks: every drop is derived from gl_VertexID and time. */
export const RAIN_VERT = /* glsl */ `#version 300 es
precision highp float;
uniform float uTime;
uniform float uRate;      // mm/h
uniform float uSlant;     // horizontal drift per unit of fall
uniform vec2 uRes;
uniform float uSpeedScale;
out float vAlong;
out float vAcross;
out float vAlpha;
${NOISE}
void main() {
  int drop = gl_VertexID / 6;
  int corner = gl_VertexID % 6;
  vec3 r = hash32(vec2(float(drop) * 1.37, 7.1));
  vec3 r2 = hash32(vec2(float(drop) * 0.71, 91.7));
  float z = mix(0.25, 1.0, r.x * r.x);                 // depth: far (0.25) → near (1)
  // Marshall–Palmer drop diameter (mm) and Atlas et al. terminal fall speed (m/s).
  float lambda = 4.1 * pow(max(uRate, 0.1), -0.21);
  float D = clamp(-log(1.0 - r.y * 0.98) / lambda, 0.3, 4.5);
  float v = max(9.65 - 10.3 * exp(-0.6 * D), 1.0);
  float speed = v * uSpeedScale * (0.35 + 0.9 * z);
  float y = 1.15 - fract(r.z + uTime * speed) * 1.3;
  float x = r2.x * (1.0 + abs(uSlant) * 1.2) - max(uSlant, 0.0) * 1.2 + uSlant * (1.15 - y);
  float len = (0.025 + v * 0.006) * (0.5 + z);
  // Work in aspect-corrected space so streak width is isotropic.
  float aspect = uRes.x / uRes.y;
  vec2 dirv = normalize(vec2(uSlant, -1.0));
  vec2 perp = vec2(-dirv.y, dirv.x);
  float halfW = (0.7 + D * 0.3) * z / uRes.y * 2.0;
  const vec2 Q[6] = vec2[6](vec2(0.0, -1.0), vec2(0.0, 1.0), vec2(1.0, -1.0), vec2(1.0, -1.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
  float along = Q[corner].x;
  float side = Q[corner].y;
  vec2 head = vec2((x * 2.0 - 1.0) * aspect, y * 2.0 - 1.0);
  vec2 pa = head - dirv * len * 2.0 * along + perp * halfW * side;
  vec2 p = vec2(pa.x / aspect, pa.y);
  vAlong = along;
  vAcross = side;
  vAlpha = (0.3 + 0.6 * z) * (0.6 + 0.4 * r2.y);
  gl_Position = vec4(p, 0.0, 1.0);
}`

export const RAIN_FRAG = /* glsl */ `#version 300 es
precision highp float;
in float vAlong;
in float vAcross;
in float vAlpha;
uniform vec3 uColor;
uniform float uOpacity;
out vec4 outColor;
void main() {
  float a = vAlpha * uOpacity * (1.0 - vAlong) * (1.0 - vAcross * vAcross);
  outColor = vec4(uColor * a, a);
}`

export const BOLT_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
in float aAcross;
in float aGlow;
out float vAcross;
out float vGlow;
void main() {
  vAcross = aAcross;
  vGlow = aGlow;
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}`

export const BOLT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in float vAcross;
in float vGlow;
uniform float uFlash;
out vec4 outColor;
void main() {
  float x2 = vAcross * vAcross;
  float core = exp(-x2 * 60.0);
  float halo = exp(-x2 * 4.0) * 0.35;
  vec3 c = vec3(0.86, 0.9, 1.0) * (core * 1.6 + halo) * vGlow * uFlash;
  outColor = vec4(c, 0.0);
}`

/** Composite: drops on glass refract the rendered sky; wet glass blurs it; plus screen flash. */
export const GLASS_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uWet;      // 0..1 water on the glass
uniform float uRain;     // 0..1 actively raining → sliding drops
uniform float uScreenFlash;
${NOISE}

// Small static beads that appear and evaporate.
vec3 beads(vec2 uv, float aspect, float density) {
  vec2 g = uv * vec2(aspect, 1.0) * 30.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec3 r = hash32(id + 3.1);
  if (r.z > density) return vec3(0.0);
  vec2 c = (r.xy - 0.5) * 0.6;
  float rad = mix(0.05, 0.16, fract(r.x * 13.7) * fract(r.x * 13.7));
  float life = fract(uTime * 0.04 + r.y * 9.0);
  float fade = smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.7, life);
  vec2 d = (f - c) / rad;
  float m = smoothstep(1.0, 0.82, length(d)) * fade;
  return vec3(d * m, m);
}

// Path of the sliding drop in column 'col' (x as a function of y; independent of time).
float pathX(float col, vec3 r, float y, float cols) {
  return (col + 0.5 + (r.z - 0.5) * 0.55 + 0.035 * sin(y * 17.0 + r.x * 6.0) + 0.02 * sin(y * 41.0 + r.y * 3.0)) / cols;
}

vec3 sliders(vec2 uv, float aspect) {
  float cols = floor(7.0 * aspect + 2.0);
  float col = floor(uv.x * cols);
  vec3 acc = vec3(0.0);
  for (int k = -1; k <= 1; k++) {
    float c = col + float(k);
    vec3 r = hash32(vec2(c, 13.0));
    if (r.x > 0.35 + 0.65 * uRain) continue;
    float spd = mix(0.05, 0.16, r.y);
    float tt = uTime * spd + r.z * 10.0;
    // Stick-slip: the drop pauses, then lurches down.
    float y = 1.1 - (fract(tt) * 1.25 + 0.06 * sin(fract(tt) * 18.0));
    float x = pathX(c, r, y, cols);
    float rad = mix(0.018, 0.032, r.y);
    vec2 d = (uv - vec2(x, y)) * vec2(aspect, 1.0) / vec2(rad, rad * 1.25);
    d.y -= 0.25 * (1.0 - d.y * d.y) * step(0.0, d.y); // slightly pointed top (teardrop)
    float m = smoothstep(1.0, 0.8, length(d));
    acc += vec3(d * m, m);
    // Trail of tiny droplets left above the drop.
    float above = uv.y - y;
    if (above > 0.0 && above < 0.4) {
      float cell = floor(uv.y * 70.0);
      float cy = (cell + 0.5) / 70.0;
      vec3 rr = hash32(vec2(c, cell));
      if (rr.x < 0.55) {
        vec2 tc = vec2(pathX(c, r, cy, cols) + (rr.y - 0.5) * 0.006, cy);
        float tr = rad * mix(0.18, 0.38, rr.z) * (1.0 - above / 0.4);
        vec2 td = (uv - tc) * vec2(aspect, 1.0) / tr;
        float tm = smoothstep(1.0, 0.75, length(td)) * smoothstep(0.4, 0.05, above);
        acc += vec3(td * tm, tm);
      }
    }
  }
  return acc;
}

vec3 blurred(vec2 uv, float radius) {
  vec3 s = texture(uScene, uv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.3;
    s += texture(uScene, uv + vec2(cos(a), sin(a)) * radius / vec2(uRes.x / uRes.y, 1.0)).rgb * 0.1;
  }
  return s;
}

void main() {
  vec2 uv = vUv;
  vec3 col = texture(uScene, uv).rgb;
  if (uWet > 0.001) {
    float aspect = uRes.x / uRes.y;
    vec3 b = beads(uv, aspect, 0.25 + 0.6 * uWet);
    vec3 s = uRain > 0.0 ? sliders(uv, aspect) : vec3(0.0);
    vec2 n = b.xy * 0.6 + s.xy;
    float m = clamp(b.z + s.z, 0.0, 1.0);
    // Wet glass softens the view; drops act as small lenses showing a flipped, sharper image.
    vec3 soft = blurred(uv, 0.006 * uWet);
    // A drop is a tiny wide-angle lens: it shows the scene upside down, so its lower half picks up
    // bright sky and its upper half the darker ground.
    vec3 lens = texture(uScene, clamp(uv - n * 0.2, 0.0, 1.0)).rgb;
    float r = length(n);
    lens *= 1.0 - 0.22 * n.y;                                  // brighter towards the bottom
    lens *= 1.0 - smoothstep(0.6, 1.0, r) * 0.45;              // dark refracted rim
    col = mix(mix(col, soft, uWet * 0.85), lens, m);
    float spec = pow(max(dot(normalize(vec3(n * 1.2, 0.6)), normalize(vec3(-0.5, 0.62, 0.6))), 0.0), 40.0);
    float luma = dot(soft, vec3(0.3, 0.6, 0.1));
    col += spec * m * (0.25 + 0.6 * luma);
    col += smoothstep(0.75, 0.95, r) * smoothstep(1.0, 0.95, r) * max(-n.y, 0.0) * m * 0.25 * luma; // lit lower rim
  }
  col += vec3(0.72, 0.78, 0.95) * uScreenFlash;
  outColor = vec4(col, 1.0);
}`
