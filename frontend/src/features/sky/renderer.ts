import type { SkyParams } from './params'
import { directionENU, lightProbe as probe, skyPalette, type LightProbe } from './palette'
import { activeEvent, boltSegments, flashEnvelope, MAX_SCREEN_FLASH, type LightningEvent } from './lightning'
import { BOLT_FRAG, BOLT_VERT, CLOUD_FRAG, FULLSCREEN_VERT, GLASS_FRAG, RAIN_FRAG, RAIN_VERT, SKY_FRAG } from './shaders'

/**
 * Headless WebGL2 sky renderer. Draws into whatever canvas it is given (an on-screen canvas, or an
 * offscreen one whose pixels a three.js scene can use as a texture), so the crop field can later
 * share the exact same sky. Passes: ray-marched cumulus → half-res buffer; sky + cloud layers →
 * offscreen target; rain and lightning composited into it; final pass applies drops-on-glass and
 * the screen flash.
 */

export type Vec3 = [number, number, number]

/** A camera in sky space (x = east, y = up, z = north). */
export interface SkyView {
  fwd: Vec3
  right: Vec3
  up: Vec3
  /** tan(vertical fov / 2). */
  tanHalfFov: number
}

export interface RenderOptions {
  glass?: boolean
  /** Freeze motion and disable lightning flashes (prefers-reduced-motion). */
  still?: boolean
  /** 0.4..1 particle budget. */
  quality?: number
  /** Camera override (e.g. a 3D scene's camera); by default the sky frames the sun or moon. */
  view?: SkyView
  /** Where the final image goes; defaults to the canvas (framebuffer null) at canvas size. */
  output?: { framebuffer: WebGLFramebuffer | null; width: number; height: number }
  /** Screen-space rain streaks and lightning bolt (both on by default). */
  rain?: boolean
  bolt?: boolean
  /** Whole-frame flash on lightning (default on). A 3D scene lights its field instead. */
  screenFlash?: boolean
  /**
   * Leave the moon out and write its visibility (through cloud, rain and fog) to alpha, for a 3D scene
   * that draws a sharp, full-resolution moon over this (smaller) sky image itself.
   */
  moonOverlay?: boolean
}

export interface FrameInfo {
  /** The lightning event visible this frame (for thunder sound scheduling). */
  lightning: LightningEvent | null
  /** 0..1 lightning brightness this frame (already 0 when `still`). */
  flash: number
}

export interface SkyRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas | null
  render(params: SkyParams, timeSeconds: number, opts?: RenderOptions): FrameInfo
  /**
   * Renders the six faces of a cube map (sky space: x = east, y = up, z = north, standard GL face
   * order) without rain, bolts or flashes, for environment lighting and reflections. Returns the
   * renderer-owned cube texture.
   */
  renderCube(params: SkyParams, timeSeconds: number, size: number, opts?: Pick<RenderOptions, 'still' | 'quality'>): WebGLTexture
  lightProbe(params: SkyParams): LightProbe
  readonly lost: boolean
  dispose(): void
}

/** GL cube-map faces: forward (major axis), right (+s) and up (+t) directions in lookup space. */
const CUBE_FACES: { fwd: Vec3; right: Vec3; up: Vec3 }[] = [
  { fwd: [1, 0, 0], right: [0, 0, -1], up: [0, -1, 0] },
  { fwd: [-1, 0, 0], right: [0, 0, 1], up: [0, -1, 0] },
  { fwd: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { fwd: [0, -1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  { fwd: [0, 0, 1], right: [1, 0, 0], up: [0, -1, 0] },
  { fwd: [0, 0, -1], right: [-1, 0, 0], up: [0, -1, 0] },
]

type GL = WebGL2RenderingContext
type Uniforms = Record<string, WebGLUniformLocation | null>

function compile(gl: GL, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`sky shader compile failed: ${log}`)
  }
  return sh
}

function program(gl: GL, vs: string, fs: string, names: string[]): { prog: WebGLProgram; u: Uniforms } {
  const prog = gl.createProgram()!
  const v = compile(gl, gl.VERTEX_SHADER, vs)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(prog, v)
  gl.attachShader(prog, f)
  gl.linkProgram(prog)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`sky program link failed: ${gl.getProgramInfoLog(prog)}`)
  const u: Uniforms = {}
  for (const n of names) u[n] = gl.getUniformLocation(prog, n)
  return { prog, u }
}

const SKY_UNIFORMS = [
  'uRes', 'uTime', 'uFwd', 'uRight', 'uUp', 'uTanHalfFov', 'uSunDir', 'uMoonDir', 'uMoonPhase', 'uMoonOverlay', 'uZenith', 'uHorizon',
  'uSunColor', 'uCloudLit', 'uCloudShadow', 'uFogColor', 'uSunVis', 'uDaylight', 'uCloud', 'uOvercast', 'uConvective',
  'uRain', 'uThunder', 'uFog', 'uMist', 'uWind', 'uFlash', 'uFlashPos', 'uSeed', 'uCumulus', 'uCumulusW', 'uCumulusTexel',
]
const CLOUD_UNIFORMS = [
  'uRes', 'uTime', 'uFwd', 'uRight', 'uUp', 'uTanHalfFov', 'uKeyDir', 'uKeyColor', 'uSunDir', 'uMoonDir', 'uCloudLit',
  'uCloudShadow', 'uHorizon', 'uZenith', 'uCover', 'uConvective', 'uSunVis', 'uDaylight', 'uMoonLight', 'uWind', 'uSeed',
  'uSteps',
]

/** Vertical field of view and camera pitch: horizon sits near the bottom like a weather app. */
const FOV = 62 * (Math.PI / 180)
const MIN_PITCH = 27 * (Math.PI / 180)
const MAX_PITCH = 58 * (Math.PI / 180)
const MAX_DROPS = 5200

function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(a: number[]) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
/** ENU (east, up, north) → shader space (x = east, y = up, z = north). Same layout. */
const enu = (az: number, el: number) => directionENU(az, el)

export function createSkyRenderer(canvas: HTMLCanvasElement | OffscreenCanvas): SkyRenderer | null {
  const ctx = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, premultipliedAlpha: false }) as GL | null
  if (!ctx) return null
  return build(ctx, canvas)
}

/**
 * Sky renderer on a context someone else owns (e.g. three.js), so a 3D scene can share one GPU
 * context. The caller must reset its own GL state cache afterwards (three: `renderer.resetState()`).
 */
export function createSkyRendererForContext(gl: WebGL2RenderingContext): SkyRenderer {
  return build(gl, null)
}

function build(gl: GL, canvas: HTMLCanvasElement | OffscreenCanvas | null): SkyRenderer {
  let lost = false
  const onLost = (e: Event) => {
    e.preventDefault()
    lost = true
  }
  canvas?.addEventListener('webglcontextlost', onLost as EventListener)

  const sky = program(gl, FULLSCREEN_VERT, SKY_FRAG, SKY_UNIFORMS)
  const cloud = program(gl, FULLSCREEN_VERT, CLOUD_FRAG, CLOUD_UNIFORMS)
  const rain = program(gl, RAIN_VERT, RAIN_FRAG, ['uTime', 'uRate', 'uSlant', 'uRes', 'uSpeedScale', 'uColor', 'uOpacity', 'uFine'])
  const bolt = program(gl, BOLT_VERT, BOLT_FRAG, ['uFlash'])
  const glass = program(gl, FULLSCREEN_VERT, GLASS_FRAG, ['uScene', 'uRes', 'uTime', 'uWet', 'uRain', 'uScreenFlash'])

  const emptyVao = gl.createVertexArray()
  const boltVao = gl.createVertexArray()
  const boltBuf = gl.createBuffer()
  gl.bindVertexArray(boltVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, boltBuf)
  const stride = 4 * 4
  const aPos = gl.getAttribLocation(bolt.prog, 'aPos')
  const aAcross = gl.getAttribLocation(bolt.prog, 'aAcross')
  const aGlow = gl.getAttribLocation(bolt.prog, 'aGlow')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0)
  gl.enableVertexAttribArray(aAcross)
  gl.vertexAttribPointer(aAcross, 1, gl.FLOAT, false, stride, 8)
  gl.enableVertexAttribArray(aGlow)
  gl.vertexAttribPointer(aGlow, 1, gl.FLOAT, false, stride, 12)
  gl.bindVertexArray(null)
  let boltKey = -1
  let boltVerts = 0

  const makeTarget = () => ({ tex: gl.createTexture(), fbo: gl.createFramebuffer(), w: 0, h: 0 })
  type Target = ReturnType<typeof makeTarget>
  /** Scene + half-res cumulus buffers per output size (the canvas, a 3D view, cube faces). */
  const targets = new Map<string, { scene: Target; cumulus: Target }>()
  const targetsFor = (w: number, h: number) => {
    const key = `${w}x${h}`
    let t = targets.get(key)
    if (!t) {
      if (targets.size >= 4) {
        for (const old of targets.values()) for (const x of [old.scene, old.cumulus]) { gl.deleteTexture(x.tex); gl.deleteFramebuffer(x.fbo) }
        targets.clear()
      }
      t = { scene: makeTarget(), cumulus: makeTarget() }
      targets.set(key, t)
    }
    return t
  }
  let cube: { tex: WebGLTexture | null; fbo: WebGLFramebuffer | null; size: number } | null = null
  const ensureTarget = (target: ReturnType<typeof makeTarget>, w: number, h: number) => {
    if (target.w === w && target.h === h) return
    target.w = w
    target.h = h
    gl.bindTexture(gl.TEXTURE_2D, target.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  const uploadBolt = (e: LightningEvent, aspect: number) => {
    const segs = boltSegments(e, 0.66, -0.02)
    const data: number[] = []
    for (const s of segs) {
      const dx = (s.x2 - s.x1) * aspect
      const dy = s.y2 - s.y1
      const l = Math.hypot(dx, dy) || 1
      const w = 0.008 * s.width
      const px = (-dy / l) * w / aspect
      const py = (dx / l) * w
      const v = (x: number, y: number, side: number) => data.push(x, y, side, s.glow)
      v(s.x1 - px, s.y1 - py, -1); v(s.x1 + px, s.y1 + py, 1); v(s.x2 - px, s.y2 - py, -1)
      v(s.x2 - px, s.y2 - py, -1); v(s.x1 + px, s.y1 + py, 1); v(s.x2 + px, s.y2 + py, 1)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, boltBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW)
    boltVerts = data.length / 4
  }

  /** Neutral fixed-function state: a shared context may have depth/cull/scissor enabled. */
  const prepareState = () => {
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.SCISSOR_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
    gl.disable(gl.POLYGON_OFFSET_FILL)
    gl.colorMask(true, true, true, true)
    gl.blendEquation(gl.FUNC_ADD)
  }

  function render(p: SkyParams, t: number, opts: RenderOptions = {}): FrameInfo {
    if (lost) return { lightning: null, flash: 0 }
    const out = opts.output ?? (canvas ? { framebuffer: null, width: canvas.width, height: canvas.height } : null)
    if (!out) return { lightning: null, flash: 0 }
    const w = out.width
    const h = out.height
    if (!w || !h) return { lightning: null, flash: 0 }
    prepareState()
    const { scene: target, cumulus } = targetsFor(w, h)
    ensureTarget(target, w, h)
    // Cumulus buffer: full resolution on small canvases, half on large ones or when frames run slow.
    const cs = w * h > 650_000 || (opts.quality ?? 1) < 0.8 ? 0.5 : 1
    const cw = Math.max(2, Math.ceil(w * cs))
    const ch = Math.max(2, Math.ceil(h * cs))
    ensureTarget(cumulus, cw, ch)
    const pal = skyPalette(p)
    const time = opts.still ? 37 : t

    let fwd: number[], right: number[], up: number[]
    let tanHalf = Math.tan(FOV / 2)
    if (opts.view) {
      fwd = opts.view.fwd
      right = opts.view.right
      up = opts.view.up
      tanHalf = opts.view.tanHalfFov
    } else {
      // Camera faces the sun by day (slightly offset so it sits left of centre), the moon at night.
      const dayish = p.sunElevation > -0.1
      const yaw = (dayish ? p.sunAzimuth : p.moonElevation > 0 ? p.moonAzimuth : p.sunAzimuth + Math.PI) + 0.3
      // Tilt up just enough to keep a high sun or moon in the upper part of the frame.
      const targetEl = dayish ? p.sunElevation : Math.max(p.moonElevation, 0)
      const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, targetEl - 0.3))
      fwd = norm([Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)])
      right = norm(cross(fwd, [0, 1, 0]))
      up = cross(right, fwd)
    }

    // Wind blows *from* windDirectionDeg; clouds drift the other way. Plane units per second.
    const wd = (p.windDirectionDeg * Math.PI) / 180
    const drift = 0.004 + p.windSpeedKmh * 0.0011
    const wind = [-Math.sin(wd) * drift, -Math.cos(wd) * drift]

    const lightning = opts.still ? null : activeEvent(p.seed, p.thunder, time)
    const env = lightning ? flashEnvelope(lightning, time) : 0

    // Fair-weather cumulus is ray-marched; under a stratus deck, rain or thunder the flat layer takes over.
    const cumulusW = 1 - Math.max(p.overcast, Math.min(1, p.rainIntensity * 6), p.thunder)
    const sunDir = enu(p.sunAzimuth, p.sunElevation)
    const moonDir = enu(p.moonAzimuth, p.moonElevation)
    const moonLight = pal.daylight < 0.15 && p.moonElevation > 0 ? 1 - Math.abs(p.moonPhase - 0.5) * 2 : 0
    gl.disable(gl.BLEND)
    gl.bindVertexArray(emptyVao)
    if (cumulusW > 0.01 && p.cloudLow > 0.01) {
      // Key light for the light-march: the sun by day (kept above the horizon), the moon at night.
      const keyDir = pal.daylight > 0.15 ? enu(p.sunAzimuth, Math.max(p.sunElevation, 0.06)) : moonLight > 0 ? enu(p.moonAzimuth, Math.max(p.moonElevation, 0.06)) : [0, 1, 0]
      gl.bindFramebuffer(gl.FRAMEBUFFER, cumulus.fbo)
      gl.viewport(0, 0, cw, ch)
      gl.useProgram(cloud.prog)
      const c = cloud.u
      gl.uniform2f(c.uRes, cw, ch)
      gl.uniform1f(c.uTime, time)
      gl.uniform3fv(c.uFwd, fwd)
      gl.uniform3fv(c.uRight, right)
      gl.uniform3fv(c.uUp, up)
      gl.uniform1f(c.uTanHalfFov, tanHalf)
      gl.uniform3fv(c.uKeyDir, keyDir)
      gl.uniform3fv(c.uKeyColor, pal.daylight > 0.15 ? pal.sunColor : [0.62, 0.7, 0.9])
      gl.uniform3fv(c.uSunDir, sunDir)
      gl.uniform3fv(c.uMoonDir, moonDir)
      gl.uniform3fv(c.uCloudLit, pal.cloudLit)
      gl.uniform3fv(c.uCloudShadow, pal.cloudShadow)
      gl.uniform3fv(c.uHorizon, pal.horizon)
      gl.uniform3fv(c.uZenith, pal.zenith)
      gl.uniform1f(c.uCover, p.cloudLow)
      gl.uniform1f(c.uConvective, p.convective)
      gl.uniform1f(c.uSunVis, pal.sunVisibility)
      gl.uniform1f(c.uDaylight, pal.daylight)
      gl.uniform1f(c.uMoonLight, moonLight)
      gl.uniform2f(c.uWind, wind[0], wind[1])
      gl.uniform1f(c.uSeed, p.seed)
      gl.uniform1i(c.uSteps, Math.round(6 + 10 * (opts.quality ?? 1)))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, w, h)
    gl.useProgram(sky.prog)
    const u = sky.u
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, cumulus.tex)
    gl.uniform1i(u.uCumulus, 0)
    gl.uniform2f(u.uCumulusTexel, 1 / cw, 1 / ch)
    gl.uniform1f(u.uCumulusW, cumulusW > 0.01 && p.cloudLow > 0.01 ? cumulusW : 0)
    gl.uniform2f(u.uRes, w, h)
    gl.uniform1f(u.uTime, time)
    gl.uniform3fv(u.uFwd, fwd)
    gl.uniform3fv(u.uRight, right)
    gl.uniform3fv(u.uUp, up)
    gl.uniform1f(u.uTanHalfFov, tanHalf)
    gl.uniform3fv(u.uSunDir, sunDir)
    gl.uniform3fv(u.uMoonDir, moonDir)
    gl.uniform1f(u.uMoonPhase, p.moonPhase)
    gl.uniform1f(u.uMoonOverlay, opts.moonOverlay ? 1 : 0)
    gl.uniform3fv(u.uZenith, pal.zenith)
    gl.uniform3fv(u.uHorizon, pal.horizon)
    gl.uniform3fv(u.uSunColor, pal.sunColor)
    gl.uniform3fv(u.uCloudLit, pal.cloudLit)
    gl.uniform3fv(u.uCloudShadow, pal.cloudShadow)
    gl.uniform3fv(u.uFogColor, pal.fogColor)
    gl.uniform1f(u.uSunVis, pal.sunVisibility)
    gl.uniform1f(u.uDaylight, pal.daylight)
    gl.uniform3f(u.uCloud, p.cloudLow, p.cloudMid, p.cloudHigh)
    gl.uniform1f(u.uOvercast, p.overcast)
    gl.uniform1f(u.uConvective, p.convective)
    gl.uniform1f(u.uRain, p.rainIntensity)
    gl.uniform1f(u.uThunder, p.thunder)
    gl.uniform1f(u.uFog, p.fog)
    gl.uniform1f(u.uMist, p.mist)
    gl.uniform2f(u.uWind, wind[0], wind[1])
    gl.uniform1f(u.uFlash, env)
    gl.uniform2f(u.uFlashPos, lightning?.x ?? 0.5, 0.72)
    gl.uniform1f(u.uSeed, p.seed)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.enable(gl.BLEND)
    if (p.rainIntensity > 0 && opts.rain !== false) {
      const fine = p.precipKind === 'drizzle'
      // Drizzle is many fine, short drops; rain scales with intensity up to a full downpour.
      const drops = Math.round(MAX_DROPS * (fine ? 0.4 : Math.min(1, 0.12 + p.rainIntensity * 1.05)) * (opts.quality ?? 1))
      // Slant: wind component across the view, relative to fall speed.
      const across = -Math.sin(wd) * right[0] + -Math.cos(wd) * right[2]
      const slant = Math.max(-0.55, Math.min(0.55, across * (p.windSpeedKmh / 45)))
      const bright = 0.5 + pal.daylight * 0.62 + env * 0.8
      gl.useProgram(rain.prog)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.uniform1f(rain.u.uTime, time)
      gl.uniform1f(rain.u.uRate, Math.max(p.rainRateMmH, 0.2))
      gl.uniform1f(rain.u.uSlant, slant)
      gl.uniform2f(rain.u.uRes, w, h)
      gl.uniform1f(rain.u.uSpeedScale, 0.075)
      gl.uniform3f(rain.u.uColor, 0.8 * bright, 0.84 * bright, 0.9 * bright)
      gl.uniform1f(rain.u.uOpacity, fine ? 0.42 : 0.55 + 0.45 * p.rainIntensity)
      gl.uniform1f(rain.u.uFine, fine ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, drops * 6)
    }

    if (lightning && lightning.kind === 'bolt' && env > 0.02 && opts.bolt !== false) {
      if (boltKey !== lightning.t0) {
        uploadBolt(lightning, w / h)
        boltKey = lightning.t0
      }
      gl.useProgram(bolt.prog)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.uniform1f(bolt.u.uFlash, Math.min(1, env * 1.4))
      gl.bindVertexArray(boltVao)
      gl.drawArrays(gl.TRIANGLES, 0, boltVerts)
      gl.bindVertexArray(emptyVao)
    }
    gl.disable(gl.BLEND)

    gl.bindFramebuffer(gl.FRAMEBUFFER, out.framebuffer)
    gl.viewport(0, 0, w, h)
    gl.useProgram(glass.prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, target.tex)
    gl.uniform1i(glass.u.uScene, 0)
    gl.uniform2f(glass.u.uRes, w, h)
    gl.uniform1f(glass.u.uTime, time)
    gl.uniform1f(glass.u.uWet, opts.glass ? p.wetness : 0)
    gl.uniform1f(glass.u.uRain, opts.glass ? p.rainIntensity : 0)
    const screenFlash = lightning && opts.screenFlash !== false ? env * (lightning.kind === 'bolt' ? MAX_SCREEN_FLASH : MAX_SCREEN_FLASH * 0.45) : 0
    gl.uniform1f(glass.u.uScreenFlash, screenFlash)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
    return { lightning, flash: env }
  }

  function renderCube(p: SkyParams, t: number, size: number, opts: Pick<RenderOptions, 'still' | 'quality'> = {}): WebGLTexture {
    if (!cube || cube.size !== size) {
      if (cube) { gl.deleteTexture(cube.tex); gl.deleteFramebuffer(cube.fbo) }
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex)
      for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
      cube = { tex, fbo: gl.createFramebuffer(), size }
    }
    for (let f = 0; f < 6; f++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, cube.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, cube.tex, 0)
      const face = CUBE_FACES[f]
      render(p, t, {
        still: opts.still, quality: opts.quality, rain: false, bolt: false, screenFlash: false,
        view: { ...face, tanHalfFov: 1 }, output: { framebuffer: cube.fbo, width: size, height: size },
      })
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return cube.tex!
  }

  return {
    canvas,
    render,
    renderCube,
    lightProbe: probe,
    get lost() {
      return lost || gl.isContextLost()
    },
    dispose() {
      canvas?.removeEventListener('webglcontextlost', onLost as EventListener)
      gl.deleteProgram(sky.prog)
      gl.deleteProgram(cloud.prog)
      gl.deleteProgram(rain.prog)
      gl.deleteProgram(bolt.prog)
      gl.deleteProgram(glass.prog)
      gl.deleteVertexArray(emptyVao)
      gl.deleteVertexArray(boltVao)
      gl.deleteBuffer(boltBuf)
      for (const t of targets.values()) for (const x of [t.scene, t.cumulus]) { gl.deleteTexture(x.tex); gl.deleteFramebuffer(x.fbo) }
      targets.clear()
      if (cube) { gl.deleteTexture(cube.tex); gl.deleteFramebuffer(cube.fbo); cube = null }
      // A shared context belongs to its owner; only an own canvas's context is released.
      if (!canvas) return
      // Free the GPU context only once the canvas has really left the page: under React StrictMode
      // the same canvas is re-used right after cleanup, and a lost context cannot be re-acquired.
      setTimeout(() => {
        if (!('isConnected' in canvas) || !canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext()
      }, 0)
    },
  }
}
