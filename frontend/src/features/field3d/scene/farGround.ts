import * as THREE from 'three';

/**
 * Ground beyond the neighbouring plots: a procedural patchwork of fields (young and ripe crop,
 * ploughed soil, water) with bund lines and slow large-scale variation, aligned with the farmer's
 * rows. One shader, no geometry — the horizon reads as farmland instead of a flat disc.
 */
export type FarGroundKind = 'paddy' | 'upland';

const DECL = /* glsl */ `
uniform vec2 uFarRow;
uniform vec2 uFarOrigin;
varying vec2 vFarXZ;
float fgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fgNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fgHash(i), fgHash(i + vec2(1, 0)), u.x), mix(fgHash(i + vec2(0, 1)), fgHash(i + vec2(1, 1)), u.x), u.y);
}
`;

const PADDY = /* glsl */ `
vec3 fgPick(float h) {
  if (h < 0.28) return vec3(0.17, 0.33, 0.07);   // young green
  if (h < 0.52) return vec3(0.1, 0.24, 0.05);    // mid green
  if (h < 0.68) return vec3(0.3, 0.34, 0.1);     // yellowing
  if (h < 0.8) return vec3(0.38, 0.3, 0.1);      // golden
  if (h < 0.9) return vec3(0.15, 0.1, 0.06);     // puddled mud
  return vec3(0.12, 0.17, 0.17);                 // flooded
}
`;

const UPLAND = /* glsl */ `
vec3 fgPick(float h) {
  if (h < 0.25) return vec3(0.28, 0.12, 0.07);   // red soil
  if (h < 0.45) return vec3(0.1, 0.24, 0.05);    // green crop
  if (h < 0.62) return vec3(0.17, 0.3, 0.07);    // young crop
  if (h < 0.78) return vec3(0.34, 0.27, 0.1);    // dry stubble
  if (h < 0.9) return vec3(0.2, 0.14, 0.08);     // ploughed
  return vec3(0.05, 0.12, 0.04);                 // grove
}
`;

export function createFarGroundMaterial(kind: FarGroundKind, rowAngle: number, origin: [number, number]) {
  const uniforms = {
    uFarRow: { value: new THREE.Vector2(Math.cos(rowAngle), Math.sin(rowAngle)) },
    uFarOrigin: { value: new THREE.Vector2(origin[0], origin[1]) },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#7a6d45', roughness: 1 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\n${kind === 'paddy' ? PADDY : UPLAND}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 rel = vFarXZ - uFarOrigin;
        vec2 g = vec2(dot(rel, uFarRow), dot(rel, vec2(-uFarRow.y, uFarRow.x)));
        // Irregular field sizes: warp the grid with slow noise so cells aren't a perfect lattice.
        g += (vec2(fgNoise(g * 0.004), fgNoise(g * 0.004 + 9.0)) - 0.5) * 40.0;
        vec2 cs = vec2(78.0, 56.0);
        vec2 id = floor(g / cs);
        vec2 f = fract(g / cs);
        float h = fgHash(id);
        vec3 c = fgPick(h);
        c *= 0.8 + 0.4 * fgNoise(vFarXZ * 0.03 + h * 17.0);
        float edge = min(min(f.x, 1.0 - f.x) * cs.x, min(f.y, 1.0 - f.y) * cs.y);
        float px = max(fwidth(edge), 0.0001);
        c = mix(vec3(0.34, 0.29, 0.17), c, smoothstep(0.5, 0.5 + px * 1.5, edge));
        diffuseColor.rgb = c;`);
  };
  material.customProgramCacheKey = () => `bhoomi-farground-${kind}`;
  return material;
}
