import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, DepthOfField, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { seasonAt } from '../season'
import { Egrets, Insects } from './Creatures'
import { Bund, Ground, Hills, Palms, Rice, Sky, TreeLine } from './Landscape'
import { FOG_DENSITY, applySeason, createUniforms, type SceneUniforms } from './scene'
import { TIERS, degrade, detectTier, type Tier } from './tier'

export interface Login3DProps {
  /** Called once, after the first frames have been drawn. */
  onReady?: () => void
  /** Fixed season position (0..1) for previews/tests; otherwise follows the shared loop clock. */
  fixedSeason?: number
  /** Force a render tier (previews/tests). */
  tier?: Tier
  paused?: boolean
}

/** Writes the season, wind, sun-light rig and camera glide each frame. */
function Director({ uniforms, fixedSeason, onReady, onSlow }: { uniforms: SceneUniforms; fixedSeason?: number; onReady?: () => void; onSlow: () => void }) {
  const { scene, camera } = useThree()
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const frames = useRef(0)
  const acc = useRef({ t: 0, n: 0 })
  const drift = useRef(new THREE.Vector2())
  const look = useMemo(() => new THREE.Vector3(), [])
  const fog = useMemo(() => new THREE.FogExp2('#cddbe4', FOG_DENSITY), [])
  useEffect(() => {
    scene.fog = fog
    return () => { scene.fog = null }
  }, [scene, fog])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const season = fixedSeason ?? seasonAt(performance.now())
    applySeason(uniforms, season)
    uniforms.uTime.value = t
    uniforms.uWindStrength.value = 0.62 + 0.22 * Math.sin(t * 0.21) + 0.1 * Math.sin(t * 0.67)
    drift.current.x += dt * 0.0042
    drift.current.y += dt * 0.0016
    uniforms.uCloudDrift.value.copy(drift.current)

    fog.color.copy(uniforms.uFogColor.value)
    const s = sun.current
    if (s) {
      s.color.copy(uniforms.uSunColor.value).multiplyScalar(0.55)
      s.position.copy(uniforms.uSunDir.value).multiplyScalar(60)
      s.intensity = 2.2
    }
    if (hemi.current) {
      hemi.current.color.copy(uniforms.uHemiSky.value)
      hemi.current.groundColor.copy(uniforms.uHemiGround.value)
      hemi.current.intensity = 1.1
    }

    // Slow glide along the bund with a little handheld sway; always looking down the rows.
    const g = fixedSeason !== undefined ? 0 : t
    const x = 5.5 * Math.sin(g * 0.045)
    camera.position.set(x, 1.28 + 0.03 * Math.sin(g * 0.7), 1.9)
    look.set(x * 0.55 + 2.2 * Math.sin(g * 0.031 + 1), 4.2 + 0.4 * Math.sin(g * 0.13), -30)
    camera.lookAt(look)

    frames.current++
    if (frames.current === 4) onReady?.()
    // Adaptive quality: if the average frame time over ~2 s is poor, step the tier down.
    if (frames.current > 30) {
      acc.current.t += dt
      acc.current.n++
      if (acc.current.n >= 90) {
        if (acc.current.t / acc.current.n > 0.03) onSlow()
        acc.current = { t: 0, n: 0 }
      }
    }
  })
  return (
    <>
      <directionalLight ref={sun} />
      <hemisphereLight ref={hemi} />
    </>
  )
}

export default function Login3D({ onReady, fixedSeason, tier: forced, paused }: Login3DProps) {
  const [tier, setTier] = useState<Tier>(() => forced ?? detectTier())
  const settings = TIERS[tier]
  const uniforms = useMemo(() => createUniforms(), [])
  const [visible, setVisible] = useState(true)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting && document.visibilityState === 'visible'))
    io.observe(el)
    const vis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', vis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const run = visible && !paused
  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        key={tier}
        dpr={[1, settings.dpr]}
        frameloop={run ? 'always' : 'never'}
        camera={{ fov: 42, near: 0.1, far: 900, position: [0, 1.3, 1.9] }}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping
          gl.setClearColor('#cddbe4')
        }}
      >
        <Director uniforms={uniforms} fixedSeason={fixedSeason} onReady={onReady} onSlow={() => !forced && setTier((t) => (t === 'low' ? t : degrade(t)))} />
        <Sky uniforms={uniforms} tier={settings} />
        <Ground uniforms={uniforms} tier={settings} />
        <Bund />
        <Rice uniforms={uniforms} tier={settings} />
        <Hills uniforms={uniforms} />
        <TreeLine count={tier === 'low' ? 40 : 70} />
        <Palms count={tier === 'low' ? 8 : 14} />
        <Egrets count={tier === 'low' ? 5 : 8} />
        <Insects butterflies={tier === 'low' ? 3 : 5} dragonflies={tier === 'low' ? 1 : 3} />
        <EffectComposer multisampling={tier === 'high' ? 4 : 0} enableNormalPass={false}>
          <Bloom intensity={0.55} luminanceThreshold={1.0} luminanceSmoothing={0.2} mipmapBlur />
          {settings.dof ? <DepthOfField worldFocusDistance={9} worldFocusRange={16} bokehScale={tier === 'high' ? 2.6 : 1.8} resolutionScale={0.5} /> : <></>}
          <Vignette eskil={false} offset={0.28} darkness={0.5} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
