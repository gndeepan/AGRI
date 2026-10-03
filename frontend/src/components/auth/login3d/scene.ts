import * as THREE from 'three'
import { cropAt, type CropState } from '../season'

/** Uniforms shared by every custom material in the login scene. */
export function createUniforms() {
  return {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uSunColor: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uCloudCover: { value: 0.4 },
    uCloudDrift: { value: new THREE.Vector2() },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: FOG_DENSITY },
    uHemiSky: { value: new THREE.Color() },
    uHemiGround: { value: new THREE.Color() },
    uWindDir: { value: new THREE.Vector2(0.82, -0.57).normalize() },
    uWindStrength: { value: 0.6 },
    uGrow: { value: 1 },
    uPresence: { value: 1 },
    uPanicle: { value: 0 },
    uWater: { value: 0.5 },
    uLeaf: { value: new THREE.Color() },
    uGrain: { value: new THREE.Color() },
  }
}
export type SceneUniforms = ReturnType<typeof createUniforms>

export const FOG_DENSITY = 0.0022

const c = (h: string) => new THREE.Color(h)
const PAL = {
  zenith: [c('#2f4f8c'), c('#2a68c0')],
  horizon: [c('#f2b27a'), c('#bcd6ea')],
  sun: [c('#ffa458').multiplyScalar(1.9), c('#fff0d8').multiplyScalar(2.2)],
  hemiSky: [c('#8792b4').multiplyScalar(0.85), c('#a9c4df').multiplyScalar(0.95)],
  hemiGround: [c('#6a5238').multiplyScalar(0.55), c('#55603e').multiplyScalar(0.55)],
  fog: [c('#e9b98d'), c('#cddbe4')],
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export interface SunState {
  dir: THREE.Vector3
  elevationDeg: number
  /** 0 = golden hour, 1 = high day. */
  day: number
}

/**
 * Four gentle "days" per season loop, always between golden hour (9°) and late morning (25°),
 * with the sun ahead of the camera so the rice is backlit. Periodic, so the loop has no jump.
 */
export function sunAt(season: number): SunState {
  const phase = (season * 4) % 1
  const elevationDeg = 9 + 16 * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase))
  const az = 0.3 * Math.sin(2 * Math.PI * phase) + 0.62
  const el = (elevationDeg * Math.PI) / 180
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
  return { dir, elevationDeg, day: smoothstep(9, 25, elevationDeg) }
}

/** Writes season-dependent values into the shared uniforms. Deterministic for a given season. */
export function applySeason(u: SceneUniforms, season: number): { sun: SunState; crop: CropState } {
  const sun = sunAt(season)
  const crop = cropAt(season)
  const f = sun.day
  u.uSunDir.value.copy(sun.dir)
  u.uSunColor.value.copy(PAL.sun[0]).lerp(PAL.sun[1], f)
  u.uZenith.value.copy(PAL.zenith[0]).lerp(PAL.zenith[1], f)
  u.uHorizon.value.copy(PAL.horizon[0]).lerp(PAL.horizon[1], f)
  u.uHemiSky.value.copy(PAL.hemiSky[0]).lerp(PAL.hemiSky[1], f)
  u.uHemiGround.value.copy(PAL.hemiGround[0]).lerp(PAL.hemiGround[1], f)
  u.uFogColor.value.copy(PAL.fog[0]).lerp(PAL.fog[1], f)
  u.uCloudCover.value = 0.36 + 0.14 * Math.sin(2 * Math.PI * season * 2)
  u.uGrow.value = crop.grow
  u.uPresence.value = Math.max(0.04, crop.presence)
  u.uPanicle.value = crop.panicle
  u.uWater.value = crop.water
  u.uLeaf.value.setRGB(crop.leaf[0], crop.leaf[1], crop.leaf[2], THREE.SRGBColorSpace)
  u.uGrain.value.setRGB(crop.grain[0], crop.grain[1], crop.grain[2], THREE.SRGBColorSpace)
  return { sun, crop }
}
