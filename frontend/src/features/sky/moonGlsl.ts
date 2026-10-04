/**
 * The moon's surface, shared by the live sky (features/sky) and the 3D field's full-resolution sky
 * background (field3d/scene/Atmosphere), so both show the same moon.
 *
 * - Near-side map: the major maria at their real places on the disc (Oceanus Procellarum, Imbrium,
 *   Serenitatis, Tranquillitatis, Crisium, Fecunditatis, Nectaris, Nubium, Humorum, Frigoris), with
 *   ragged shores; bright, heavily cratered highlands between them.
 * - Craters at two scales (bowl, raised rim, slightly bright ejecta) that catch the light near the
 *   terminator, and the bright ray craters Tycho, Copernicus, Kepler and Aristarchus.
 * - Lighting: phase from SunCalc, lit side facing the real sun; a Lommel–Seeliger-style law, so a full
 *   moon looks flat-bright edge to edge as it does in the sky, not like a matte ball.
 *
 * GLSL that compiles both as ES 3.00 and through three.js's ShaderMaterial. Disc coordinates `l`:
 * unit disc, +x to the viewer's right, +y towards the zenith (lunar north up, as seen from the north).
 */
export const MOON_GLSL = /* glsl */ `
float mnHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float mnNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mnHash(i), mnHash(i + vec2(1.0, 0.0)), u.x), mix(mnHash(i + vec2(0.0, 1.0)), mnHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float mnFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * mnNoise(p); p = p * 2.07 + vec2(13.1, 7.7); a *= 0.5; }
  return s;
}
float mnBlob(vec2 p, vec2 c, vec2 r, float rot) {
  vec2 d = p - c;
  float cs = cos(rot);
  float sn = sin(rot);
  d = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y) / r;
  return 1.0 - smoothstep(0.7, 1.08, length(d));
}

/** 0 = highland, 1 = mare (dark basalt). */
float moonMaria(vec2 p) {
  vec2 q = p + (vec2(mnFbm(p * 3.1), mnFbm(p * 3.1 + 5.2)) - 0.5) * 0.14;
  float m = 0.0;
  // The western maria run together into one great dark arc; the eastern ones form a chain.
  m = max(m, mnBlob(q, vec2(-0.62, 0.02), vec2(0.28, 0.58), 0.12));   // Oceanus Procellarum
  m = max(m, mnBlob(q, vec2(-0.3, 0.42), vec2(0.33, 0.25), -0.15));   // Mare Imbrium
  m = max(m, mnBlob(q, vec2(-0.36, -0.12), vec2(0.17, 0.14), 0.0));   // Mare Insularum / Cognitum
  m = max(m, mnBlob(q, vec2(0.17, 0.42), vec2(0.18, 0.17), 0.0));     // Mare Serenitatis
  m = max(m, mnBlob(q, vec2(0.05, 0.27), vec2(0.11, 0.08), 0.0));     // Mare Vaporum
  m = max(m, mnBlob(q, vec2(0.36, 0.13), vec2(0.24, 0.18), 0.3));     // Mare Tranquillitatis
  m = max(m, mnBlob(q, vec2(0.74, 0.3), vec2(0.11, 0.14), 0.0));      // Mare Crisium
  m = max(m, mnBlob(q, vec2(0.56, -0.17), vec2(0.13, 0.2), 0.2));     // Mare Fecunditatis
  m = max(m, mnBlob(q, vec2(0.37, -0.32), vec2(0.1, 0.1), 0.0));      // Mare Nectaris
  m = max(m, mnBlob(q, vec2(-0.18, -0.38), vec2(0.21, 0.15), 0.2));   // Mare Nubium
  m = max(m, mnBlob(q, vec2(-0.5, -0.43), vec2(0.11, 0.11), 0.0));    // Mare Humorum
  m = max(m, mnBlob(q, vec2(0.0, 0.74), vec2(0.45, 0.065), 0.05));    // Mare Frigoris
  m = max(m, mnBlob(q, vec2(0.0, 0.17), vec2(0.11, 0.08), 0.0));      // Sinus Medii
  // Darker and lighter flows within the maria.
  m *= 0.85 + 0.25 * mnFbm(p * 6.0 + 2.0);
  return m;
}

/** One layer of craters: adds to height and albedo. scale = cells across the disc radius. */
void moonCraters(vec2 p, float scale, float density, inout float h, inout float alb) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 f = fract(g);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = id + vec2(float(i), float(j));
      if (mnHash(cell + 3.7) > density) continue;
      vec2 c = vec2(float(i), float(j)) + vec2(mnHash(cell), mnHash(cell + 17.3));
      float rad = 0.12 + 0.34 * pow(mnHash(cell + 9.1), 2.0);
      float d = length(f - c) / rad;
      if (d > 1.6) continue;
      float bowl = d < 1.0 ? (d * d - 1.0) * 0.7 : 0.0;
      float rim = exp(-pow((d - 1.0) / 0.16, 2.0)) * 0.35;
      h += (bowl + rim) * rad / scale;
      alb *= 1.0 + 0.08 * rim + 0.04 * smoothstep(1.6, 1.0, d);
    }
  }
}

/** A crater with bright rays of ejecta. */
float rayCrater(vec2 p, vec2 c, float size, float reach, float seed) {
  vec2 d = p - c;
  float r = length(d);
  float ang = atan(d.y, d.x);
  float rays = pow(mnNoise(vec2(ang * 9.0 + seed, seed)), 4.0) + 0.6 * pow(mnNoise(vec2(ang * 23.0 + seed * 3.0, 1.0)), 6.0);
  float fall = exp(-r / reach) * smoothstep(size * 0.8, size * 1.6, r);
  float spot = 1.0 - smoothstep(size * 0.5, size * 1.3, r);
  return rays * fall * 0.9 + spot * 0.7;
}

float moonHeight(vec2 p, out float alb) {
  alb = 1.0;
  float h = 0.0;
  float mare = moonMaria(p);
  // Highlands are saturated with craters; maria are smooth lava with fewer, smaller ones.
  moonCraters(p, 7.0, mix(0.55, 0.18, mare), h, alb);
  moonCraters(p + 3.3, 17.0, mix(0.6, 0.3, mare), h, alb);
  moonCraters(p + 7.1, 38.0, 0.5, h, alb);
  h += (mnFbm(p * 26.0) - 0.5) * 0.01 * (1.0 - 0.6 * mare);
  return h;
}

/**
 * Shades the moon at disc point l (|l| <= 1). right/up/m: the disc's frame in sky space; sunDir: real
 * sun direction; phase: SunCalc phase (0 new, 0.5 full). Returns colour (display space) and, in
 * litCover, how much of the pixel is sunlit surface (the rest shows the sky through the dark side).
 */
vec3 moonSurface(vec2 l, vec3 right, vec3 up, vec3 m, vec3 sunDir, float phase, out float litCover) {
  float r2 = dot(l, l);
  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 n0 = normalize(l.x * right + l.y * up - z * m);
  float illum = 1.0 - abs(phase - 0.5) * 2.0;
  // Phase angle: 0 at full moon (lit from behind the viewer), PI at new moon.
  float phaseAngle = abs(1.0 - 2.0 * clamp(phase, 0.0, 1.0)) * 3.14159265;
  vec2 s2 = vec2(dot(sunDir, right), dot(sunDir, up));
  s2 = dot(s2, s2) > 1e-8 ? normalize(s2) : vec2(1.0, 0.0);
  vec3 L = normalize(-m * cos(phaseAngle) + (s2.x * right + s2.y * up) * sin(phaseAngle));

  // Relief: crater slopes tilt the surface normal; they matter most near the terminator.
  float alb;
  float e = 0.004;
  float ax;
  float ay;
  float h0 = moonHeight(l, alb);
  float hx = moonHeight(l + vec2(e, 0.0), ax);
  float hy = moonHeight(l + vec2(0.0, e), ay);
  vec2 grad = vec2(hx - h0, hy - h0) / e;
  // Relief only shows when the light is oblique: none at full moon (lit from straight behind the
  // viewer), strongest near the quarters and crescents.
  float relief = 0.12 + 0.88 * smoothstep(0.25, 1.3, phaseAngle);
  vec3 n = normalize(n0 - (grad.x * right + grad.y * up) * 1.6 * relief * (0.35 + 0.65 * z));

  float mare = moonMaria(l);
  vec3 highland = vec3(0.95, 0.93, 0.88);
  vec3 basalt = mix(vec3(0.4, 0.41, 0.43), vec3(0.48, 0.46, 0.42), mnFbm(l * 4.0));
  vec3 albedo = mix(highland, basalt, mare * 0.92) * alb * (0.92 + 0.12 * mnFbm(l * 11.0));
  float rays = rayCrater(l, vec2(-0.12, -0.62), 0.03, 0.45, 1.0)    // Tycho
             + rayCrater(l, vec2(-0.31, 0.17), 0.028, 0.18, 4.0) * 0.8   // Copernicus
             + rayCrater(l, vec2(-0.53, 0.13), 0.016, 0.1, 7.0) * 0.6    // Kepler
             + rayCrater(l, vec2(-0.66, 0.32), 0.012, 0.05, 9.0) * 0.9;  // Aristarchus
  albedo += vec3(0.25, 0.25, 0.24) * clamp(rays, 0.0, 1.2) * (0.5 + 0.5 * illum);

  // Lommel–Seeliger with a little Lambert: flat-bright at full moon, crisp shadows at the terminator.
  float mu0 = max(dot(n, L), 0.0);
  float mu = max(dot(n, -m), 0.05);
  float shade = 1.6 * mu0 / (mu0 + mu) * 0.75 + mu0 * 0.35;
  float lit = smoothstep(-0.015, 0.05, dot(n0, L));
  // Earthshine: the dark side glows faintly, visible only beside a thin crescent.
  float earthshine = pow(1.0 - illum, 3.0) * 0.6;
  litCover = clamp(lit + earthshine * 0.5, 0.0, 1.0);
  return albedo * shade * lit + vec3(0.06, 0.07, 0.1) * albedo * earthshine;
}
`;
