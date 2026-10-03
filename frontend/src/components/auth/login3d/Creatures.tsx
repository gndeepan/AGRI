import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '../season'
import { butterflyWing, egretParts } from './geometry'

/** Cattle-egret style flock crossing the sky; wings flap about the body axis, bodies bob. */
export function Egrets({ count }: { count: number }) {
  const parts = useMemo(() => egretParts(), [])
  const refs = useRef<Array<THREE.Group | null>>([])
  const wingsL = useRef<Array<THREE.Group | null>>([])
  const wingsR = useRef<Array<THREE.Group | null>>([])
  const birds = useMemo(() => {
    const rnd = mulberry32(13)
    return Array.from({ length: count }, (_, i) => ({
      // Loose V: leader first, followers trail behind and to the sides.
      dx: (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2.2) + (rnd() - 0.5) * 0.8,
      dz: i === 0 ? 0 : Math.ceil(i / 2) * 2.0 + (rnd() - 0.5),
      dy: (rnd() - 0.5) * 1.2,
      phase: rnd() * 6.28,
      flapRate: 5.2 + rnd() * 1.2,
    }))
  }, [count])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // One pass every ~38 s, right to left across the field, drifting slightly in depth and height.
    const u = (t / 38) % 1
    const lead = new THREE.Vector3(70 - 140 * u, 9 + 2.2 * Math.sin(u * 5), -34 + 6 * Math.sin(u * 3))
    birds.forEach((b, i) => {
      const g = refs.current[i]
      if (!g) return
      g.position.set(lead.x + b.dx * 0 + b.dz, lead.y + b.dy + Math.sin(t * 2 + b.phase) * 0.12, lead.z + b.dx)
      g.rotation.y = Math.PI // facing -x (flying left)
      g.rotation.z = Math.sin(t * 0.8 + b.phase) * 0.08
      const flap = Math.sin(t * b.flapRate + b.phase)
      // Glide briefly between flaps: damp amplitude on a slow cycle.
      const amp = 0.75 * (0.5 + 0.5 * Math.cos(t * 0.45 + b.phase * 2)) + 0.25
      const a = flap * amp * 0.9
      if (wingsL.current[i]) wingsL.current[i]!.rotation.x = -a - 0.1
      if (wingsR.current[i]) wingsR.current[i]!.rotation.x = a + 0.1
    })
  })
  return (
    <group>
      {birds.map((_, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g }} scale={1.5}>
          <mesh geometry={parts.bodyGeo}>
            <meshLambertMaterial color="#f4f2ea" emissive="#2a2a28" />
          </mesh>
          <mesh geometry={parts.bill} position={[0, 0, 0]}>
            <meshLambertMaterial color="#e0a93a" />
          </mesh>
          <group ref={(g) => { wingsR.current[i] = g }}>
            <mesh geometry={parts.wing}>
              <meshLambertMaterial color="#fbfaf4" emissive="#33332f" side={THREE.DoubleSide} />
            </mesh>
          </group>
          <group ref={(g) => { wingsL.current[i] = g }} scale={[1, 1, -1]}>
            <mesh geometry={parts.wing}>
              <meshLambertMaterial color="#fbfaf4" emissive="#33332f" side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}

/** Butterflies and dragonflies near the camera, on looping Lissajous paths over the field. */
export function Insects({ butterflies, dragonflies }: { butterflies: number; dragonflies: number }) {
  const wing = useMemo(() => butterflyWing(), [])
  // Dragonfly wing: a thin blade lying in the XZ plane, rooted at the body (z = 0) and reaching +z.
  const dragonWing = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.03, 0.11)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, 0.055)
    return g
  }, [])
  const bRefs = useRef<Array<THREE.Group | null>>([])
  const bWings = useRef<Array<[THREE.Mesh | null, THREE.Mesh | null]>>([])
  const dRefs = useRef<Array<THREE.Group | null>>([])
  const dWings = useRef<Array<Array<THREE.Mesh | null>>>([])
  const bf = useMemo(() => {
    const rnd = mulberry32(91)
    const colors = ['#f1c445', '#f4f0e0', '#e9a23b', '#e8eef7', '#d96f3f']
    return Array.from({ length: butterflies }, (_, i) => ({
      cx: (rnd() - 0.5) * 7, cz: -(3 + rnd() * 8), cy: 0.9 + rnd() * 0.9, ax: 1.4 + rnd() * 1.6, az: 0.9 + rnd() * 1.4,
      fx: 0.13 + rnd() * 0.1, fz: 0.17 + rnd() * 0.12, ph: rnd() * 6.28, color: colors[i % colors.length]!, size: 0.7 + rnd() * 0.5,
    }))
  }, [butterflies])
  const df = useMemo(() => {
    const rnd = mulberry32(57)
    return Array.from({ length: dragonflies }, () => ({
      cx: (rnd() - 0.5) * 8, cz: -(4 + rnd() * 7), cy: 1.2 + rnd() * 0.7, r: 2 + rnd() * 2, f: 0.22 + rnd() * 0.12, ph: rnd() * 6.28,
    }))
  }, [dragonflies])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    bf.forEach((b, i) => {
      const g = bRefs.current[i]
      if (!g) return
      const x = b.cx + b.ax * Math.sin(t * b.fx + b.ph)
      const z = b.cz + b.az * Math.sin(t * b.fz * 1.3 + b.ph * 0.7)
      const y = b.cy + 0.35 * Math.sin(t * 1.9 + b.ph) + 0.15 * Math.sin(t * 0.6 + b.ph)
      const vx = b.ax * b.fx * Math.cos(t * b.fx + b.ph)
      const vz = b.az * b.fz * 1.3 * Math.cos(t * b.fz * 1.3 + b.ph * 0.7)
      g.position.set(x, y, z)
      g.rotation.y = Math.atan2(-vz, vx)
      const flap = Math.sin(t * 13 + b.ph) * 0.9 + 0.55
      const w = bWings.current[i]
      if (w?.[0]) w[0].rotation.x = flap
      if (w?.[1]) w[1].rotation.x = -flap
    })
    df.forEach((d, i) => {
      const g = dRefs.current[i]
      if (!g) return
      // Hovering darts: figure-eight with sudden pauses.
      const s = t * d.f + d.ph
      const x = d.cx + d.r * Math.sin(s)
      const z = d.cz + d.r * 0.5 * Math.sin(s * 2)
      g.position.set(x, d.cy + 0.12 * Math.sin(t * 3 + d.ph), z)
      g.rotation.y = Math.atan2(-d.r * Math.sin(s * 2) * 0.5 * 2 * d.f, d.r * Math.cos(s) * d.f) + Math.PI
      const ws = dWings.current[i]
      const buzz = Math.sin(t * 60 + d.ph) * 0.35
      ws?.forEach((m, k) => { if (m) m.rotation.x = (k % 2 ? -1 : 1) * (0.25 + buzz) })
    })
  })

  return (
    <group>
      {bf.map((b, i) => (
        <group key={`b${i}`} ref={(g) => { bRefs.current[i] = g }} scale={b.size}>
          <mesh scale={[1.6, 0.35, 0.35]}>
            <capsuleGeometry args={[0.012, 0.05, 2, 4]} />
            <meshLambertMaterial color="#2b2118" />
          </mesh>
          {[0, 1].map((k) => (
            <mesh key={k} ref={(m) => { (bWings.current[i] ??= [null, null])[k] = m }} geometry={wing} scale={[1, 1, k ? -1 : 1]} rotation-y={Math.PI / 2}>
              <meshLambertMaterial color={b.color} side={THREE.DoubleSide} emissive={b.color} emissiveIntensity={0.18} />
            </mesh>
          ))}
        </group>
      ))}
      {df.map((_, i) => (
        <group key={`d${i}`} ref={(g) => { dRefs.current[i] = g }}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.006, 0.004, 0.17, 4]} />
            <meshLambertMaterial color="#2f6f8f" emissive="#12384a" />
          </mesh>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} geometry={dragonWing} ref={(m) => { (dWings.current[i] ??= [])[k] = m }} position={[0.035 - (k >> 1) * 0.045, 0, 0]} scale={[1, 1, k % 2 ? -1 : 1]}>
              <meshBasicMaterial color="#cfe6ee" transparent opacity={0.32} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
