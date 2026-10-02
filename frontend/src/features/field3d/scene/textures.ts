import * as THREE from 'three';
import { mulberry32 } from '../prng';

/** Everything here is generated in the browser, so the scene downloads no image assets. */

/** Tileable fractal value noise on a `grid`-cell lattice (wraps at 1.0). */
function makeNoise(seed: number, grid: number) {
  const rand = mulberry32(seed);
  const lattice = Array.from({ length: grid * grid }, () => rand());
  const at = (x: number, y: number) => lattice[(((y % grid) + grid) % grid) * grid + (((x % grid) + grid) % grid)] ?? 0;
  const value = (u: number, v: number, g: number) => {
    const x = u * g;
    const y = v * g;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    // Scale lattice lookups so every octave still tiles.
    const step = grid / g;
    const a = at(xi * step, yi * step) + (at((xi + 1) * step, yi * step) - at(xi * step, yi * step)) * sx;
    const b = at(xi * step, (yi + 1) * step) + (at((xi + 1) * step, (yi + 1) * step) - at(xi * step, (yi + 1) * step)) * sx;
    return a + (b - a) * sy;
  };
  return (u: number, v: number, octaves = 4, base = 4) => {
    let n = 0;
    let amp = 0.5;
    let g = base;
    let norm = 0;
    for (let o = 0; o < octaves && g <= grid; o++) {
      n += value(u, v, g) * amp;
      norm += amp;
      amp *= 0.5;
      g *= 2;
    }
    return n / norm;
  };
}

function dataTexture(data: Uint8Array, size: number, srgb: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Normal map from a height function sampled on a tileable grid. */
function normalsFromHeight(height: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const h = (x: number, y: number) => height[(((y + size) % size) * size) + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

export interface MudTextures {
  /** Albedo detail (greyscale-ish, tinted by material colour). */
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  /** R = puddle mask (low ground collects water), G = clod roughness. */
  detail: THREE.DataTexture;
}

/** Puddled paddy mud: clods, tractor-wheel smears and low spots that hold water. */
export function createMudTextures(size = 256, seed = 3): MudTextures {
  const noise = makeNoise(seed, 64);
  const fine = makeNoise(seed + 9, 128);
  const height = new Float32Array(size * size);
  const albedo = new Uint8Array(size * size * 4);
  const detail = new Uint8Array(size * size * 4);
  const rand = mulberry32(seed + 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const broad = noise(u, v, 4, 2);
      const clods = fine(u, v, 3, 16);
      // Smears from puddling run roughly in one direction.
      const smear = 0.5 + 0.5 * Math.sin((u * 6 + broad * 1.5) * Math.PI * 2);
      const hgt = broad * 0.6 + clods * 0.35 + smear * 0.08;
      height[y * size + x] = hgt;
      const i = (y * size + x) * 4;
      const shade = 0.62 + clods * 0.32 + (rand() - 0.5) * 0.06 - smear * 0.04;
      const warm = 0.03 * broad;
      albedo[i] = Math.min(255, 255 * (shade + warm));
      albedo[i + 1] = Math.min(255, 255 * shade);
      albedo[i + 2] = Math.min(255, 255 * (shade - warm));
      albedo[i + 3] = 255;
      const puddle = Math.max(0, Math.min(1, (0.46 - broad) * 6));
      detail[i] = puddle * 255;
      detail[i + 1] = (0.55 + clods * 0.45) * 255;
      detail[i + 2] = 0;
      detail[i + 3] = 255;
    }
  }
  return {
    map: dataTexture(albedo, size, true),
    normalMap: dataTexture(normalsFromHeight(height, size, 6), size, false),
    detail: dataTexture(detail, size, false),
  };
}

/** Packed earth on the bunds: drier, with grass roots and footpath wear. */
export function createSoilTexture(size = 128, seed = 41): { map: THREE.DataTexture; normalMap: THREE.DataTexture } {
  const noise = makeNoise(seed, 64);
  const height = new Float32Array(size * size);
  const albedo = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise(x / size, y / size, 5, 4);
      height[y * size + x] = n;
      const i = (y * size + x) * 4;
      const s = 0.68 + n * 0.4;
      albedo[i] = 255 * Math.min(1, s);
      albedo[i + 1] = 255 * Math.min(1, s * 0.94);
      albedo[i + 2] = 255 * Math.min(1, s * 0.86);
      albedo[i + 3] = 255;
    }
  }
  return { map: dataTexture(albedo, size, true), normalMap: dataTexture(normalsFromHeight(height, size, 4), size, false) };
}

/** Small wind-driven ripples on standing water (tileable normal map). */
export function createRippleNormal(size = 256, seed = 19): THREE.DataTexture {
  const noise = makeNoise(seed, 64);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] = noise(u, v, 4, 8) + 0.25 * Math.sin((u * 12 + noise(u, v, 2, 4) * 2) * Math.PI * 2);
    }
  }
  return dataTexture(normalsFromHeight(height, size, 3), size, false);
}

/**
 * Rice leaf detail along a blade (u across, v base→tip): fine parallel veins, a paler
 * midrib, and slightly darker margins. Multiplied with the stage colour in the shader.
 */
export function createLeafTexture(): THREE.Texture {
  const w = 64;
  const h = 256;
  const data = new Uint8Array(w * h * 4);
  const rand = mulberry32(23);
  const grain = Array.from({ length: w }, () => rand());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const across = Math.abs(u - 0.5) * 2;
      const veins = 0.92 + 0.08 * Math.cos(u * Math.PI * 22);
      const midrib = 1 + 0.22 * Math.exp(-((u - 0.5) ** 2) / 0.0015);
      const margin = 1 - 0.18 * Math.pow(across, 6);
      const speck = 0.97 + (grain[x] ?? 0) * 0.05;
      const s = Math.min(1, veins * midrib * margin * speck * 0.86);
      const i = (y * w + x) * 4;
      data[i] = 255 * s;
      data[i + 1] = 255 * s;
      data[i + 2] = 255 * s;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Soft cloud puff as a data URL, so drei <Clouds> needs no CDN texture. */
export function createCloudDataUrl(size = 256, seed = 12): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rand = mulberry32(seed);
  for (let p = 0; p < 26; p++) {
    const a = rand() * Math.PI * 2;
    const r0 = Math.sqrt(rand()) * size * 0.26;
    const cx = size / 2 + Math.cos(a) * r0;
    const cy = size / 2 + Math.sin(a) * r0 * 0.8;
    const r = size * (0.1 + rand() * 0.16);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas.toDataURL('image/png');
}

/** Soft round sprite used for clouds, mist and glow particles. */
export function createSoftSpriteTexture(size = 128, puffs = 1, seed = 5): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rand = mulberry32(seed);
  for (let p = 0; p < puffs; p++) {
    const cx = puffs === 1 ? size / 2 : size * (0.25 + rand() * 0.5);
    const cy = puffs === 1 ? size / 2 : size * (0.35 + rand() * 0.3);
    const r = puffs === 1 ? size / 2 : size * (0.15 + rand() * 0.18);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
