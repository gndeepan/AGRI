import type { SkyParams } from './params'

/**
 * Sky colours and scene lighting derived from SkyParams. Used by the WebGL shader (as uniforms),
 * the CSS fallback gradient, and — via `lightProbe` — by 3D scenes that want to be lit by the
 * same sky.
 */

export type RGB = [number, number, number]

const RAD = Math.PI / 180
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB
const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k]
const luma = (c: RGB) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722

interface Key { at: number; zenith: RGB; horizon: RGB; sun: RGB }
/** Keyed on solar elevation in degrees: night → astronomical/civil twilight → golden hour → day. */
const KEYS: Key[] = [
  { at: -18, zenith: hex('#02040c'), horizon: hex('#070c1c'), sun: hex('#000000') },
  { at: -10, zenith: hex('#050b1e'), horizon: hex('#141e3c'), sun: hex('#000000') },
  { at: -5, zenith: hex('#0f1a3c'), horizon: hex('#5a4868'), sun: hex('#7a3a2a') },
  { at: -1, zenith: hex('#203763'), horizon: hex('#e08a5c'), sun: hex('#ff6f3a') },
  { at: 3, zenith: hex('#2f5c98'), horizon: hex('#f3a862'), sun: hex('#ffa65c') },
  { at: 10, zenith: hex('#3e7bc3'), horizon: hex('#f1d0a0'), sun: hex('#ffd59a') },
  { at: 25, zenith: hex('#2f74cc'), horizon: hex('#a3c8ea'), sun: hex('#fff0d6') },
  { at: 60, zenith: hex('#2565c4'), horizon: hex('#93bfe8'), sun: hex('#fff8ee') },
]

function keyed(elevDeg: number) {
  if (elevDeg <= KEYS[0].at) return KEYS[0]
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]
    const b = KEYS[i + 1]
    if (elevDeg <= b.at) {
      const f = smooth(a.at, b.at, elevDeg)
      return { at: elevDeg, zenith: mix(a.zenith, b.zenith, f), horizon: mix(a.horizon, b.horizon, f), sun: mix(a.sun, b.sun, f) }
    }
  }
  return KEYS[KEYS.length - 1]
}

export interface SkyPalette {
  zenith: RGB
  horizon: RGB
  sunColor: RGB
  /** 0..1 how strongly the sun disc shows (0 below the horizon / behind thick cloud). */
  sunVisibility: number
  /** 0..1 daylight factor (1 = full day, 0 = night). */
  daylight: number
  cloudLit: RGB
  cloudShadow: RGB
  fogColor: RGB
  /** 0..1 how dim the whole scene is under cloud/rain (for streak brightness etc.). */
  gloom: number
}

export function skyPalette(p: SkyParams): SkyPalette {
  const elev = p.sunElevation / RAD
  const k = keyed(elev)
  const daylight = smooth(-8, 6, elev)
  const gloom = clamp01(Math.max(p.overcast * 0.75, p.cloudLow * 0.45) + p.rainIntensity * 0.35 + p.thunder * 0.3)

  // Cloudy skies lose saturation towards a grey of similar brightness, and darken with rain.
  const greyZ: RGB = scale([1, 1, 1], luma(k.zenith) * 0.95 + 0.04 * daylight)
  const greyH: RGB = scale([1, 1, 1], luma(k.horizon) * 0.95 + 0.05 * daylight)
  const desat = clamp01(p.overcast * 0.95 + p.cloudLow * 0.35 + p.fog * 0.6)
  // Rain clouds are thick: the heavier the rain, the darker the sky under them.
  const dark = 1 - 0.55 * p.rainIntensity - 0.12 * p.thunder
  let zenith = scale(mix(k.zenith, greyZ, desat), dark)
  let horizon = scale(mix(k.horizon, greyH, desat * 0.9), dark)

  const fogColor: RGB = mix(hex('#1b2029'), hex('#c8cfd6'), daylight)
  zenith = mix(zenith, fogColor, p.fog * 0.75)
  horizon = mix(horizon, fogColor, p.fog * 0.95)

  const sunVisibility = smooth(-1.5, 1.5, elev) * (1 - clamp01(p.overcast * 0.9 + p.fog * 0.8 + p.rainIntensity * 0.5))

  const cloudLit = mix(mix(hex('#3a4256'), hex('#fff7ec'), daylight), k.sun, (1 - smooth(4, 20, elev)) * daylight * 0.55)
  // Around sunrise/sunset clouds catch the low sun from below and glow pink-orange.
  const twilight = smooth(-10, -1, elev) * (1 - smooth(6, 14, elev)) * (1 - p.overcast * 0.7)
  const cloudLitTw = mix(cloudLit, scale(mix(horizon, k.sun, 0.45), 1.2), twilight * 0.75)
  const cloudShadow = scale(mix(hex('#0d1220'), hex('#8a94a6'), daylight), 1 - 0.45 * p.rainIntensity - 0.3 * p.thunder)

  return { zenith, horizon, sunColor: k.sun, sunVisibility, daylight, cloudLit: cloudLitTw, cloudShadow, fogColor, gloom }
}

/** Unit vector (east, up, north) for a compass azimuth and elevation, both in radians. */
export function directionENU(azimuth: number, elevation: number): [number, number, number] {
  const c = Math.cos(elevation)
  return [Math.sin(azimuth) * c, Math.sin(elevation), Math.cos(azimuth) * c]
}

export interface LightProbe {
  /** Direction towards the key light (sun by day, moon at night), as (east, up, north). */
  keyDirection: [number, number, number]
  keyColor: RGB
  keyIntensity: number
  ambientColor: RGB
  ambientIntensity: number
  fogColor: RGB
  fogDensity: number
}

/** Lighting summary so 3D scenes (e.g. the crop field) can be lit by the same sky. */
export function lightProbe(p: SkyParams): LightProbe {
  const pal = skyPalette(p)
  const night = pal.daylight < 0.15
  const moonUp = p.moonElevation > 0
  const moonLight = night && moonUp ? 0.12 * (1 - Math.abs(p.moonPhase - 0.5) * 2) : 0
  const keyIntensity = night ? moonLight : pal.daylight * (1 - pal.gloom * 0.75)
  return {
    keyDirection: night && moonUp ? directionENU(p.moonAzimuth, p.moonElevation) : directionENU(p.sunAzimuth, Math.max(p.sunElevation, 0.02)),
    keyColor: night ? [0.62, 0.7, 0.9] : pal.sunColor,
    keyIntensity,
    ambientColor: mix(pal.zenith, pal.horizon, 0.5),
    ambientIntensity: 0.08 + pal.daylight * 0.55 * (1 - pal.gloom * 0.4),
    fogColor: pal.fogColor,
    fogDensity: Math.max(p.fog, p.mist * 0.6),
  }
}

const css = (c: RGB) => `rgb(${c.map((v) => Math.round(clamp01(v) * 255)).join(',')})`

/** CSS gradient for the no-WebGL fallback, matching the shader's colours. */
export function fallbackGradient(p: SkyParams): string {
  const pal = skyPalette(p)
  return `linear-gradient(to bottom, ${css(pal.zenith)} 0%, ${css(mix(pal.zenith, pal.horizon, 0.55))} 55%, ${css(pal.horizon)} 100%)`
}
