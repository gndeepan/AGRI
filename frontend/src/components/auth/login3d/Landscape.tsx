import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '../season'
import {
  PANICLE_BASE, palmGeometry, paniclesGeometry, riceClump, treeBlobGeometry,
} from './geometry'
import { fieldFragment, fieldVertex, riceFragment, riceVertex, skyFragment, skyVertex } from './shaders'
import type { SceneUniforms } from './scene'
import type { TierSettings } from './tier'

interface Props {
  uniforms: SceneUniforms
  tier: TierSettings
}

/** Shader material sharing the scene's uniform objects, so one write updates every material. */
function useSharedMaterial(uniforms: SceneUniforms, vertex: string, fragment: string, defines: Record<string, string | number>, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: uniforms as unknown as Record<string, THREE.IUniform>, defines, ...opts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uniforms, vertex, fragment, JSON.stringify(defines)],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

export function Sky({ uniforms, tier }: Props) {
  const material = useSharedMaterial(uniforms, skyVertex, skyFragment, { OCTAVES: tier.octaves }, { side: THREE.BackSide, depthWrite: false })
  return (
    <mesh frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[400, 24, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

export function Ground({ uniforms, tier }: Props) {
  const material = useSharedMaterial(uniforms, fieldVertex, fieldFragment, { OCTAVES: tier.octaves })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -120]}>
      <planeGeometry args={[900, 560]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

/** Earthen bund the camera glides along, with a grassy verge. */
export function Bund() {
  return (
    <group>
      <mesh position={[0, 0.17, 1.55]}>
        <boxGeometry args={[400, 0.36, 1.9]} />
        <meshLambertMaterial color="#7d6240" />
      </mesh>
      <mesh position={[0, 0.2, 0.62]} rotation-x={-0.5}>
        <boxGeometry args={[400, 0.04, 0.55]} />
        <meshLambertMaterial color="#58703a" />
      </mesh>
    </group>
  )
}

interface BandSpec { count: number; zNear: number; zFar: number; scale: [number, number]; seed: number }

function fillBand(mesh: THREE.InstancedMesh, spec: BandSpec, xHalf: number) {
  const rnd = mulberry32(spec.seed)
  const dummy = new THREE.Object3D()
  const rand = new Float32Array(spec.count)
  for (let i = 0; i < spec.count; i++) {
    // Denser near the camera: u^1.7 concentrates samples toward zNear.
    const z = -(spec.zNear + (spec.zFar - spec.zNear) * Math.pow(rnd(), 1.7))
    const depth01 = (-z - spec.zNear) / (spec.zFar - spec.zNear)
    // Perspective rows: snap to a 0.28 m grid so rows read as planted lines near the camera.
    const snap = depth01 < 0.35 ? 0.28 : 0
    const zz = snap ? Math.round(z / snap) * snap : z
    const xx = (rnd() * 2 - 1) * xHalf
    const x = snap ? Math.round(xx / 0.22) * 0.22 : xx
    dummy.position.set(x + (rnd() - 0.5) * 0.06, 0.02, zz + (rnd() - 0.5) * 0.05)
    dummy.rotation.set(0, rnd() * Math.PI * 2, 0)
    const s = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * depth01
    dummy.scale.set(s * (0.9 + rnd() * 0.3), s * (0.88 + rnd() * 0.26), s * (0.9 + rnd() * 0.3))
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    rand[i] = rnd()
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1))
}

/** Instanced rice in near/mid/far bands (the far canopy is a shader on the ground). */
export function Rice({ uniforms, tier }: Props) {
  const near = useRef<THREE.InstancedMesh>(null)
  const mid = useRef<THREE.InstancedMesh>(null)
  const far = useRef<THREE.InstancedMesh>(null)
  const pan = useRef<THREE.InstancedMesh>(null)
  const clumpGeo = useMemo(() => riceClump(11, 9, 6), [])
  const clumpGeoLow = useMemo(() => riceClump(12, 6, 3), [])
  const panGeo = useMemo(() => paniclesGeometry(5, 3), [])
  const leafMat = useSharedMaterial(uniforms, riceVertex, riceFragment, { OCTAVES: tier.octaves }, { side: THREE.DoubleSide })
  const panMat = useSharedMaterial(uniforms, riceVertex, riceFragment, { OCTAVES: tier.octaves, PANICLE: 1, PANICLE_BASE: PANICLE_BASE.toFixed(3) }, { side: THREE.DoubleSide })

  const bands: Array<{ ref: React.RefObject<THREE.InstancedMesh | null>; spec: BandSpec; geo: THREE.BufferGeometry; x: number }> = [
    { ref: near, spec: { count: tier.near, zNear: 1.2, zFar: 12, scale: [1, 1.1], seed: 31 }, geo: clumpGeo, x: 22 },
    { ref: mid, spec: { count: tier.mid, zNear: 11, zFar: 30, scale: [1.15, 1.9], seed: 47 }, geo: clumpGeoLow, x: 40 },
    { ref: far, spec: { count: tier.far, zNear: 29, zFar: 52, scale: [1.9, 2.8], seed: 59 }, geo: clumpGeoLow, x: 62 },
  ]
  useEffect(() => {
    for (const b of bands) if (b.ref.current) {
      // Each band needs its own aRand buffer, so clone the shared geometry once per mesh.
      fillBand(b.ref.current, b.spec, b.x)
    }
    if (pan.current && near.current) {
      pan.current.instanceMatrix.copy(near.current.instanceMatrix)
      pan.current.count = Math.min(near.current.count, 2600)
      pan.current.instanceMatrix.needsUpdate = true
      pan.current.geometry.setAttribute('aRand', (near.current.geometry.getAttribute('aRand') as THREE.BufferAttribute).clone())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier])

  return (
    <group>
      {bands.map((b, i) => (
        <instancedMesh key={`${i}-${b.spec.count}`} ref={b.ref} args={[b.geo.clone(), leafMat, b.spec.count]} frustumCulled={false} />
      ))}
      <instancedMesh key={`p-${tier.near}`} ref={pan} args={[panGeo.clone(), panMat, Math.min(tier.near, 2600)]} frustumCulled={false} />
    </group>
  )
}

/** Hill ridges; fogged toward the horizon colour so they recede. */
export function Hills({ uniforms }: { uniforms: SceneUniforms }) {
  const ridges = useMemo(() => {
    return [
      { z: -330, h: 34, color: '#5d7a6c', seed: 3, mix: 0.55 },
      { z: -270, h: 20, color: '#4a6a55', seed: 9, mix: 0.42 },
    ].map((r) => {
      const rnd = mulberry32(r.seed)
      const phases = [rnd() * 6, rnd() * 6, rnd() * 6]
      const n = 90
      const pos: number[] = []
      const idx: number[] = []
      for (let i = 0; i <= n; i++) {
        const x = -480 + (960 * i) / n
        const y = r.h * (0.42 + 0.3 * Math.sin(x * 0.011 + phases[0]!) + 0.2 * Math.sin(x * 0.027 + phases[1]!) + 0.1 * Math.sin(x * 0.07 + phases[2]!))
        pos.push(x, -4, 0, x, y, 0)
        if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(idx)
      const m = new THREE.ShaderMaterial({
        uniforms: { uFogColor: uniforms.uFogColor, uHemiSky: uniforms.uHemiSky, uSunColor: uniforms.uSunColor, uMix: { value: r.mix }, uColor: { value: new THREE.Color(r.color) } },
        vertexShader: /* glsl */ `varying float vH; void main(){ vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uHemiSky;
uniform vec3 uSunColor;
uniform vec3 uColor;
uniform float uMix;
varying float vH;
void main() {
  vec3 c = uColor * (uHemiSky * 0.9 + uSunColor * 0.12);
  c = mix(c, uFogColor, uMix + (1.0 - smoothstep(0.0, 22.0, vH)) * 0.25);
  gl_FragColor = vec4(c, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
        side: THREE.DoubleSide,
        fog: false,
      })
      return { geo: g, mat: m, z: r.z }
    })
  }, [uniforms])
  useEffect(() => () => ridges.forEach((r) => { r.geo.dispose(); r.mat.dispose() }), [ridges])
  return (
    <group>
      {ridges.map((r, i) => (
        <mesh key={i} geometry={r.geo} material={r.mat} position={[0, 0, r.z]} frustumCulled={false} />
      ))}
    </group>
  )
}

export function TreeLine({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => treeBlobGeometry(), [])
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const rnd = mulberry32(77)
    const d = new THREE.Object3D()
    const col = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const z = -(105 + rnd() * 70)
      d.position.set((rnd() * 2 - 1) * 260, 0, z)
      const s = 3.2 + rnd() * 3.4
      d.scale.set(s * (1 + rnd() * 0.5), s * (0.9 + rnd() * 0.6), s * (1 + rnd() * 0.5))
      d.rotation.y = rnd() * 6
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      m.setColorAt(i, col.setHSL(0.27 + rnd() * 0.05, 0.38, 0.2 + rnd() * 0.08))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [count])
  return (
    <instancedMesh ref={m => { ref.current = m }} args={[geo, undefined, count]} frustumCulled={false}>
      <meshLambertMaterial />
    </instancedMesh>
  )
}

/** Coconut palms; each sways gently as one body about its base. */
export function Palms({ count }: { count: number }) {
  const geo = useMemo(() => palmGeometry(21), [])
  const geo2 = useMemo(() => palmGeometry(33), [])
  const groups = useRef<Array<THREE.Group | null>>([])
  const placements = useMemo(() => {
    const rnd = mulberry32(5)
    const list: Array<{ x: number; z: number; s: number; r: number; alt: boolean }> = [
      { x: -15, z: -20, s: 1.05, r: 1, alt: false }, { x: 17, z: -23, s: 1.15, r: 2, alt: true }, { x: -29, z: -40, s: 1.1, r: 0, alt: true },
    ]
    for (let i = 0; i < count; i++) list.push({ x: (rnd() * 2 - 1) * 150, z: -(48 + rnd() * 90), s: 0.9 + rnd() * 0.5, r: rnd() * 6, alt: rnd() > 0.5 })
    return list
  }, [count])
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    void dt
    groups.current.forEach((g, i) => {
      if (!g) return
      g.rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.012
      g.rotation.x = Math.sin(t * 0.55 + i * 0.9) * 0.01
    })
  })
  return (
    <group>
      {placements.map((p, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g }} position={[p.x, 0, p.z]} rotation-y={p.r} scale={p.s}>
          <mesh geometry={p.alt ? geo2 : geo}>
            <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
