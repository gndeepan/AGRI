/**
 * GLSL ES 3.00 shaders for the live sky. Written for Bhoomi; techniques follow the published
 * approaches credited in ./CREDITS.md (fBm/domain-warped cloud layers, a short ray-march with a
 * light-march for cumulus, stateless GPU rain with Marshall–Palmer drop sizes, procedural
 * drops-on-glass refraction, midpoint-displacement bolts).
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
// Three octaves, normalised to 0..1 (mean 0.5).
float fbm3(vec2 p) {
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  float s = 0.5 * vnoise(p); p = r * p * 2.03 + 17.1;
  s += 0.25 * vnoise(p); p = r * p * 2.03 + 17.1;
  s += 0.125 * vnoise(p);
  return s / 0.875;
}
`

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/**
 * Fair-weather cumulus, rendered at half resolution into its own buffer. A short view ray-march
 * through a slab (flat bases, rounded tops) with a 3-sample light-march towards the key light gives
 * sunlit tops, shaded bases and self-shadowing. Output is premultiplied colour + alpha.
 */
export const CLOUD_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uFwd, uRight, uUp;
uniform float uTanHalfFov;
uniform vec3 uKeyDir, uKeyColor, uSunDir, uMoonDir;
uniform vec3 uCloudLit, uCloudShadow, uHorizon, uZenith;
uniform float uCover, uConvective, uSunVis, uDaylight, uMoonLight;
uniform vec2 uWind;
uniform float uSeed;
uniform int uSteps;
${NOISE}

const float H0 = 1.0;
vec2 gDrift;
float gThick;

float baseField(vec2 xz) {
  vec2 q = xz * 2.1 + gDrift;
  float b = fbm3(q);
  // Billows at two scales give the cauliflower outline of cumulus.
  float bil = 1.0 - abs(2.0 * vnoise(q * 2.4 + 11.0) - 1.0);
  float bil2 = 1.0 - abs(2.0 * vnoise(q * 5.3 + 3.0) - 1.0);
  return b * 0.76 + bil * 0.16 + bil2 * 0.08;
}
// Density at a point in the slab; y01 is the normalised height inside the slab.
float density(vec3 pos, bool detail) {
  float y01 = (pos.y - H0) / gThick;
  if (y01 < 0.0 || y01 > 1.0) return 0.0;
  float b = baseField(pos.xz);
  float th = mix(0.72, 0.36, uCover);
  float e = b - th;
  if (e <= 0.0) return 0.0;
  float top = clamp(e * 4.2, 0.0, 1.0);                       // taller where the field is stronger
  float prof = smoothstep(0.0, 0.06, y01) * (1.0 - smoothstep(top * 0.45, top + 0.02, y01));
  float d = clamp(e * 15.0, 0.0, 1.0) * prof;
  if (detail && d > 0.0) {
    float det = vnoise(pos.xz * 9.0 + gDrift * 4.3 + y01 * 3.0) * 0.7 + vnoise(pos.xz * 21.0 + gDrift * 10.0) * 0.3;
    d = clamp((d - det * 0.42 * (1.0 - d)) / (1.0 - det * 0.3), 0.0, 1.0);
  }
  return d;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 dir = normalize(uFwd + (ndc.x * uRight + ndc.y * uUp) * uTanHalfFov);
  if (uCover < 0.01 || dir.y < 0.02) { outColor = vec4(0.0); return; }
  gDrift = (uWind * uTime * 1.6 + uSeed * 37.0) * 2.1 / 1.15;
  gThick = 0.34 + 0.3 * uConvective;

  float t0 = H0 / dir.y;
  float t1 = (H0 + gThick) / dir.y;
  float n = float(uSteps);
  float dt = (t1 - t0) / n;
  // A 2x2 ordered offset: enough to hide step banding, and it vanishes under the 4-tap resolve.
  vec2 cell = mod(floor(gl_FragCoord.xy), 2.0);
  float jitter = 0.25 + 0.25 * cell.x + 0.5 * cell.y * (1.0 - cell.x) - 0.25 * cell.y * cell.x + 0.125;
  float mu = max(dot(dir, uSunDir), 0.0);
  float muM = max(dot(dir, uMoonDir), 0.0);
  vec3 lstep = uKeyDir * gThick * 0.3;

  float T = 1.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uSteps || T < 0.03) break;
    vec3 pos = dir * (t0 + dt * (float(i) + jitter));
    float d = density(pos, true);
    if (d > 0.01) {
      float ld = density(pos + lstep, false) + density(pos + lstep * 2.0, false) + density(pos + lstep * 3.2, false);
      // Beer's law plus a wide multiple-scattering lobe, so interiors stay luminous rather than flat grey.
      float sunT = max(exp(-ld * 1.3), 0.5 * exp(-ld * 0.32));
      float y01 = (pos.y - H0) / gThick;
      // Shaded base is a soft grey-blue; ambient skylight brightens the upper part.
      vec3 base = mix(uCloudShadow, uCloudLit, 0.2) * vec3(0.93, 0.97, 1.05);
      vec3 shade = mix(base, mix(base, uCloudLit, 0.5), y01);
      vec3 c = mix(shade, uCloudLit, sunT * (0.6 + 0.4 * y01));
      // Forward scattering: edges towards the sun (or moon) glow.
      c += uKeyColor * sunT * (1.0 - d) * (pow(mu, 8.0) * 0.55 * uSunVis + pow(muM, 14.0) * 0.9 * uMoonLight);
      // Low per-step opacity: colour integrates over several samples, so the dither stays invisible.
      float a = 1.0 - exp(-d * 7.0 / n);
      col += T * a * c;
      T *= 1.0 - a;
    }
  }
  float alpha = (1.0 - T) * smoothstep(0.02, 0.1, uCover);
  col *= smoothstep(0.02, 0.1, uCover);
  // Aerial perspective: far clouds fade into the horizon haze.
  float haze = 1.0 - exp(-t0 * 0.085);
  col = mix(col, uHorizon * alpha, haze * 0.85);
  alpha *= exp(-t0 * 0.03) * smoothstep(0.02, 0.07, dir.y);
  col *= exp(-t0 * 0.03) * smoothstep(0.02, 0.07, dir.y);
  outColor = vec4(col, alpha);
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
uniform sampler2D uCumulus;   // half-res premultiplied cumulus buffer
uniform float uCumulusW;      // 0..1 weight of the cumulus buffer (0 under stratus / rain)
uniform vec2 uCumulusTexel;   // size of one cumulus-buffer texel in uv
${NOISE}

// One flat cloud layer projected onto a horizontal plane at height h. Returns rgb + alpha.
// lo/hi: noise thresholds for the cover; ripple: altocumulus mackerel pattern.
vec4 cloudLayer(vec3 dir, float h, float cover, float lo, float hi, float scale, float stretch, float speed, float billow, float ripple, float darkBase, vec3 sunDir, float mu) {
  if (cover < 0.01 || dir.y < 0.015) return vec4(0.0);
  vec2 p = dir.xz / dir.y * h;
  float fade = exp(-length(p) * 0.045 / h);
  p *= scale;
  p.x *= stretch;
  vec2 w = uWind * uTime * speed + uSeed * 37.0;
  vec2 q = vec2(fbm(p + w), fbm(p + vec2(5.2, 1.3) - w * 0.6));
  float n = fbm(p + 1.6 * q + w);
  if (billow > 0.0) n = mix(n, 1.0 - abs(2.0 * n - 1.0), billow * 0.6);
  float d = smoothstep(lo, hi, n);
  if (ripple > 0.0) {
    float cells = vnoise(p * 5.5 + w * 3.0 + q * 1.5);
    d *= mix(1.0, smoothstep(0.28, 0.62, cells), ripple);
  }
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

float starGrid(vec2 sph, float density, float cutoff, out vec3 r) {
  vec2 g = sph * density;
  vec2 id = floor(g);
  r = hash32(id);
  vec2 f = fract(g) - 0.5 - (r.xy - 0.5) * 0.7;
  float mag = pow(fract(r.z * 71.0), 5.0);                     // few bright, many faint
  float size = mix(0.07, 0.2, mag);
  return step(cutoff, r.z) * smoothstep(size, 0.0, length(f)) * (0.3 + 1.5 * mag);
}

vec3 stars(vec3 dir, float moonGlare) {
  vec2 sph = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
  vec3 r1, r2;
  float s1 = starGrid(sph, 70.0, 0.8, r1);
  float s2 = starGrid(sph + 3.7, 170.0, 0.72, r2) * 0.55;
  float tw1 = 0.6 + 0.4 * sin(uTime * (1.5 + r1.x * 3.5) + r1.y * 40.0);
  float tw2 = 0.75 + 0.25 * sin(uTime * (2.0 + r2.x * 3.0) + r2.y * 31.0);
  vec3 tint = mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.88, 0.72), r1.x);
  vec3 col = tint * s1 * tw1 + vec3(0.88, 0.92, 1.0) * s2 * tw2;
  // Milky Way: a soft band with star clouds and dark dust lanes; washed out by a bright moon.
  vec3 n = normalize(vec3(0.35, 0.55, 0.76));
  float across = dot(dir, n);
  float b = exp(-pow(across / 0.2, 2.0));
  float cloud = fbm(sph * 7.0 + 2.0);
  float dust = smoothstep(0.42, 0.62, fbm(sph * vec2(11.0, 16.0) + 9.0)) * exp(-pow(across / 0.07, 2.0));
  col += vec3(0.5, 0.56, 0.78) * b * (0.1 + 0.3 * cloud) * (1.0 - 0.7 * dust) * (1.0 - moonGlare);
  return col;
}

// Moon: lit by the real sun direction, so phase and the tilt of the terminator come out right.
vec3 moon(vec3 dir, out float disc) {
  disc = 0.0;
  float R = 0.048;
  vec3 m = uMoonDir;
  if (m.y < -0.04) return vec3(0.0);
  vec3 right = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, m);
  vec2 l = vec2(dot(dir, right), dot(dir, up)) / R;
  float r = length(l);
  float illum = 1.0 - abs(uMoonPhase - 0.5) * 2.0;
  vec3 halo = vec3(0.7, 0.78, 0.98) * (exp(-r * 0.55) * 0.16 + exp(-r * 0.12) * 0.05) * (0.25 + 0.75 * illum);
  if (dot(dir, m) < 0.0) return vec3(0.0);
  if (r > 1.0) return halo;
  float z = sqrt(1.0 - r * r);
  vec3 nrm = normalize(l.x * right + l.y * up - z * m);
  float lit = smoothstep(-0.03, 0.14, dot(nrm, uSunDir));
  // Maria (dark basalt plains) and a few bright ray craters.
  float seas = smoothstep(0.42, 0.62, fbm(l * 1.7 + vec2(4.3, 1.7)));
  float fine = fbm(l * 6.0 + 8.0);
  float albedo = mix(1.0, 0.58, seas) * (0.9 + 0.2 * fine);
  float limb = 0.75 + 0.25 * z;                                // gentle limb darkening
  vec3 surf = vec3(0.98, 0.96, 0.9) * albedo * limb * lit + vec3(0.05, 0.06, 0.09) * albedo; // + earthshine
  disc = smoothstep(1.0, 0.96, r);
  return mix(halo, surf * 1.15, disc);
}

void main() {
  vec2 ndc = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec2 sp = gl_FragCoord.xy / uRes;
  vec3 dir = normalize(uFwd + (ndc.x * uRight + ndc.y * uUp) * uTanHalfFov);
  float h = clamp(dir.y, 0.0, 1.0);
  float mu = dot(dir, uSunDir);
  float muM = dot(dir, uMoonDir);
  float night = 1.0 - uDaylight;
  float clearF = 1.0 - max(uOvercast, uFog);

  // Sky dome: pale, hazy horizon rising to a deeper zenith that darkens away from the sun.
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
  col *= 1.0 - 0.2 * uDaylight * clearF * pow(h, 1.2) * (1.0 - 0.6 * max(mu, 0.0));
  col = mix(col, uHorizon * 1.05 + 0.02 * uDaylight, exp(-h * 5.5) * 0.35 * uDaylight);

  // Twilight: orange at the horizon, a pink belt above it and purple higher up.
  float tw = (1.0 - smoothstep(0.0, 0.17, abs(uSunDir.y + 0.015))) * clearF;
  if (tw > 0.0) {
    float az = 0.5 + 0.5 * dot(normalize(dir.xz + 1e-4), normalize(uSunDir.xz + 1e-4));
    vec3 belt = vec3(1.0, 0.42, 0.18) * exp(-h * 8.0) * 0.4 * az
              + vec3(0.98, 0.42, 0.5) * exp(-pow((h - 0.17) / 0.11, 2.0)) * 0.3
              + vec3(0.4, 0.28, 0.62) * exp(-pow((h - 0.4) / 0.18, 2.0)) * 0.24;
    col += belt * tw * (0.4 + 0.6 * az);
  }

  // Below the horizon: distant hazy land.
  if (dir.y < 0.0) col = mix(uHorizon, uHorizon * 0.62 + uFogColor * 0.08, smoothstep(0.0, -0.2, dir.y));

  float moonIllum = 1.0 - abs(uMoonPhase - 0.5) * 2.0;
  float moonUp = smoothstep(-0.03, 0.08, uMoonDir.y);
  float moonDisc;
  float nightF = smoothstep(0.35, 0.95, night) * (1.0 - uOvercast * 0.9) * (1.0 - uFog * 0.8);
  vec3 moonCol = moon(dir, moonDisc) * nightF;
  float glare = moonIllum * moonUp * 0.75;
  vec3 st = stars(dir, glare) * smoothstep(0.78, 1.0, night) * (1.0 - max(uCloud.x * 0.6, uOvercast)) * (1.0 - uFog) * step(0.0, dir.y);
  col += st * (1.0 - moonDisc) * (1.0 - glare * exp(-(1.0 - max(muM, 0.0)) * 14.0));
  col = col * (1.0 - moonDisc * nightF) + moonCol;

  // Sun: aureole, soft rays, warm low-sun band and disc, all hidden by thick cloud.
  float aureole = pow(max(mu, 0.0), 6.0) * 0.2 + pow(max(mu, 0.0), 60.0) * 0.35 + pow(max(mu, 0.0), 700.0) * 0.9;
  float lowBand = exp(-max(dir.y, 0.0) * 7.0) * pow(max(mu, 0.0), 2.5) * (1.0 - smoothstep(0.1, 0.45, uSunDir.y));
  float disc = smoothstep(0.99972, 0.99992, mu);
  vec2 sv = vec2(dot(dir, uRight), dot(dir, uUp)) - vec2(dot(uSunDir, uRight), dot(uSunDir, uUp));
  float ang = atan(sv.y, sv.x);
  float rays = 0.5 + 0.5 * sin(ang * 7.0 + vnoise(vec2(ang * 1.5, uTime * 0.03)) * 6.0);
  rays *= rays * exp(-length(sv) * 2.6) * 0.035 * step(0.0, mu);
  col += uSunColor * ((aureole + rays) * uSunVis + lowBand * 0.55 * max(uSunVis, 0.25 * uDaylight) + disc * uSunVis * 3.0);

  // Haze towards the horizon.
  col = mix(col, uHorizon, exp(-max(dir.y, 0.0) * 18.0) * 0.35);

  // Cloud layers, high → low. High: thin cirrus streaks. Mid: altocumulus ripples.
  float stratusW = 1.0 - uCumulusW;
  float thC = mix(0.74, 0.3, uCloud.z);
  vec4 c3 = cloudLayer(dir, 6.0, uCloud.z, thC, thC + 0.3, 0.16, 0.22, 0.6, 0.0, 0.0, 0.0, uSunDir, mu);
  col = mix(col, c3.rgb * 0.92 + 0.08 * uHorizon, c3.a * 0.6);
  float thM = mix(0.72, 0.24, uCloud.y);
  float ripple = (1.0 - uConvective) * (1.0 - uOvercast) * uCumulusW;
  vec4 c2 = cloudLayer(dir, 2.6, uCloud.y, thM, thM + 0.26, 0.42, 0.8, 1.0, uConvective, ripple, 0.4, uSunDir, mu);
  col = mix(col, c2.rgb, c2.a * 0.85);
  // Thin cloud in front of the moon glows.
  col += vec3(0.7, 0.78, 0.98) * (c2.a * 0.5 + c3.a * 0.6) * pow(max(muM, 0.0), 40.0) * 0.5 * moonIllum * moonUp * night;

  // Low: ray-marched cumulus in fair weather...
  vec2 px = uCumulusTexel * 0.5; // each tap averages a 2x2 block, which cancels the march dither
  vec4 cu = (texture(uCumulus, sp + px) + texture(uCumulus, sp - px) + texture(uCumulus, sp + vec2(px.x, -px.y)) + texture(uCumulus, sp + vec2(-px.x, px.y))) * 0.25 * uCumulusW;
  col = col * (1.0 - cu.a) + cu.rgb;
  // ...and a stratus deck (lower and darker the harder it rains) otherwise.
  float base = mix(1.0, 0.72, uRain);
  float cov = uCloud.x * stratusW;
  vec4 c1 = cloudLayer(dir, base, cov, 1.0 - cov - 0.08, 1.0 - cov + 0.32, 0.75, 1.0, 1.6, uConvective, 0.0, 1.0, uSunDir, mu);
  col = mix(col, c1.rgb, c1.a * stratusW);
  float lowA = max(c1.a * stratusW, cu.a);

  // Lightning lighting the cloud from within.
  float fl = uFlash * exp(-length((sp - uFlashPos) * vec2(uRes.x / uRes.y, 1.0)) * 4.2);
  col += vec3(0.78, 0.82, 1.0) * fl * (0.18 + 0.5 * (lowA + c2.a * 0.5));
  col += vec3(0.6, 0.65, 0.85) * uFlash * 0.05;

  // Rain veil: distant rain hides contrast, in drifting curtains that thicken towards the horizon.
  if (uRain > 0.0) {
    float curtain = fbm(vec2(sp.x * 4.0 + uTime * 0.03, sp.y * 1.1 + uTime * 0.22));
    float shafts = fbm(vec2(sp.x * 9.0 - uTime * 0.02, sp.y * 0.6 + uTime * 0.4));
    float veil = uRain * (0.16 + 0.5 * exp(-max(dir.y, 0.0) * 3.2)) * (0.6 + 0.5 * curtain + 0.4 * shafts);
    col = mix(col, mix(uHorizon, uCloudShadow, 0.6), clamp(veil, 0.0, 0.85));
  }

  // Fog: drifting banks of varying density, with the sun or moon as a dim diffused glow.
  if (uFog > 0.0) {
    float bank = fbm(vec2(dir.x / (abs(dir.y) + 0.3) * 1.3 + uTime * 0.014, dir.y * 4.5 - uTime * 0.005));
    float wisps = fbm(vec2(sp.x * 2.4 - uTime * 0.022, sp.y * 6.5) + 9.0);
    float low = 1.0 - clamp(dir.y * 2.2, 0.0, 1.0);
    float fogD = uFog * clamp(0.5 + 0.4 * low + (bank - 0.5) * 1.1 + (wisps - 0.5) * 0.6, 0.0, 1.0);
    vec3 fogCol = uFogColor * (0.8 + 0.4 * wisps) * (0.92 + 0.16 * bank);
    fogCol += uSunColor * (pow(max(mu, 0.0), 4.0) * 0.26 + pow(max(mu, 0.0), 30.0) * 0.4 + pow(max(mu, 0.0), 220.0) * 0.45) * uDaylight;
    fogCol += vec3(0.6, 0.68, 0.9) * (pow(max(muM, 0.0), 6.0) * 0.1 + pow(max(muM, 0.0), 60.0) * 0.22) * night * moonUp * moonIllum;
    col = mix(col, fogCol, fogD);
    float thin = 1.0 - fogD * 0.55;
    col += uSunColor * smoothstep(0.9986, 0.9997, mu) * 0.4 * uFog * thin * uDaylight * (1.0 - min(1.0, uRain * 4.0));
    col += vec3(0.85, 0.88, 0.95) * moonDisc * 0.3 * uFog * thin * night;
  }
  col = mix(col, uFogColor * 1.05 + 0.03, uMist * exp(-max(dir.y, 0.0) * 10.0) * (0.7 + 0.6 * fbm(vec2(sp.x * 3.0 + uTime * 0.02, sp.y * 8.0))));

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
uniform float uFine;      // 1 = drizzle: short, fine, slow
out float vAlong;
out float vAcross;
out float vAlpha;
${NOISE}
void main() {
  int drop = gl_VertexID / 6;
  int corner = gl_VertexID % 6;
  vec3 r = hash32(vec2(float(drop) * 1.37, 7.1));
  vec3 r2 = hash32(vec2(float(drop) * 0.71, 91.7));
  float z = mix(0.2, 1.0, r.x * r.x);                  // depth: far (0.2) → near (1)
  float near = smoothstep(0.82, 1.0, z);               // closest drops: big and motion-blurred
  // Marshall–Palmer drop diameter (mm) and Atlas et al. terminal fall speed (m/s).
  float lambda = 4.1 * pow(max(uRate, 0.1), -0.21);
  float D = clamp(-log(1.0 - r.y * 0.98) / lambda, 0.3, 4.5);
  float v = max(9.65 - 10.3 * exp(-0.6 * D), 1.0);
  float speed = v * uSpeedScale * (0.35 + 0.9 * z) * mix(1.0, 0.55, uFine);
  // Gusts: the slant breathes slowly, so sheets of rain lean and recover together.
  float slant = uSlant * (1.0 + 0.3 * sin(uTime * 0.7) + 0.12 * sin(uTime * 1.9 + 1.3)) + 0.02 * sin(uTime * 1.1);
  float y = 1.2 - fract(r.z + uTime * speed) * 1.4;
  float x = r2.x * (1.0 + abs(slant) * 1.2) - max(slant, 0.0) * 1.2 + slant * (1.2 - y);
  float len = (0.03 + v * 0.011) * (0.45 + z) * (1.0 + 0.9 * near) * mix(1.0, 0.3, uFine);
  // Work in aspect-corrected space so streak width is isotropic.
  float aspect = uRes.x / uRes.y;
  vec2 dirv = normalize(vec2(slant, -1.0));
  vec2 perp = vec2(-dirv.y, dirv.x);
  // Never thinner than ~0.6 px (thin streaks alias into hatching); fade them instead.
  float wpx = (0.75 + D * 0.3) * z * (1.0 + 1.2 * near);
  float thin = min(1.0, wpx / 0.65);
  float halfW = max(wpx, 0.65) / uRes.y * 2.0;
  const vec2 Q[6] = vec2[6](vec2(0.0, -1.0), vec2(0.0, 1.0), vec2(1.0, -1.0), vec2(1.0, -1.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
  float along = Q[corner].x;
  float side = Q[corner].y;
  vec2 head = vec2((x * 2.0 - 1.0) * aspect, y * 2.0 - 1.0);
  vec2 pa = head - dirv * len * 2.0 * along + perp * halfW * side;
  vec2 p = vec2(pa.x / aspect, pa.y);
  vAlong = along;
  vAcross = side;
  vAlpha = (0.22 + 0.7 * z) * (0.55 + 0.45 * r2.y) * mix(1.0, 0.5, near) * thin;
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
  float core = 1.0 - vAcross * vAcross;
  // Bright at the head, fading along the tail; a thin bright core with a softer edge.
  float a = vAlpha * uOpacity * pow(1.0 - vAlong, 0.8) * (0.35 * core + 0.65 * core * core * core);
  // Partly additive: streaks catch skylight, so they read brighter than what is behind them.
  outColor = vec4(uColor * a, a * 0.55);
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
