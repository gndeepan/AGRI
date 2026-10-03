import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../season'

/** Mature clump height (m); growth scales it down. */
export const CLUMP_HEIGHT = 0.95
/** Height where panicles leave the clump (m), before growth scaling. */
export const PANICLE_BASE = 0.86

interface StripOpts {
  length: number
  width: number
  segments: number
  /** Outward lean of the base direction (rad). */
  lean: number
  yaw: number
  /** How strongly the tip arches over (0 = straight). */
  arch: number
  twist?: number
}

/** A tapered, arching blade as a ribbon; uv.y runs 0 (base) → 1 (tip). */
function blade(o: StripOpts): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const dir = new THREE.Vector3(Math.sin(o.lean) * Math.cos(o.yaw), Math.cos(o.lean), Math.sin(o.lean) * Math.sin(o.yaw))
  const side = new THREE.Vector3(-Math.sin(o.yaw), 0, Math.cos(o.yaw))
  const out = new THREE.Vector3(Math.cos(o.yaw), 0, Math.sin(o.yaw))
  const p = new THREE.Vector3()
  for (let i = 0; i <= o.segments; i++) {
    const t = i / o.segments
    // Arc: rises along `dir` and bends outward/down toward the tip.
    p.copy(dir).multiplyScalar(o.length * t)
    p.addScaledVector(out, o.arch * o.length * t * t * 0.55)
    p.y -= o.arch * o.length * t * t * t * 0.35
    const w = o.width * (1 - t) ** 0.7 * (t < 0.08 ? 0.6 + t * 5 : 1)
    const tw = (o.twist ?? 0) * t
    const s = side.clone().applyAxisAngle(dir, tw)
    pos.push(p.x - s.x * w, p.y - s.y * w, p.z - s.z * w, p.x + s.x * w, p.y + s.y * w, p.z + s.z * w)
    uv.push(0, t, 1, t)
    if (i < o.segments) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** One transplanted rice hill: a fan of arching blades. */
export function riceClump(seed: number, blades = 9, segments = 6): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < blades; i++) {
    const yaw = (i / blades) * Math.PI * 2 + rnd() * 0.6
    const central = i < 3
    parts.push(
      blade({
        length: CLUMP_HEIGHT * (central ? 0.92 + rnd() * 0.1 : 0.7 + rnd() * 0.25),
        width: 0.009 + rnd() * 0.004,
        segments,
        lean: central ? 0.06 + rnd() * 0.12 : 0.18 + rnd() * 0.3,
        yaw,
        arch: central ? 0.15 + rnd() * 0.15 : 0.35 + rnd() * 0.35,
        twist: (rnd() - 0.5) * 1.2,
      }),
    )
  }
  return mergeGeometries(parts)!
}

/** Drooping panicles from the clump top; uv.y continues above the clump so wind bends them most. */
export function paniclesGeometry(seed: number, count = 3): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const yaw = rnd() * Math.PI * 2
    const pts: THREE.Vector3[] = []
    const out = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw))
    for (let k = 0; k <= 6; k++) {
      const t = k / 6
      pts.push(new THREE.Vector3(0, PANICLE_BASE, 0).addScaledVector(out, 0.03 + t * 0.14).add(new THREE.Vector3(0, 0.12 * Math.sin(t * 2.2) - t * t * 0.16, 0)))
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.011, 4, false)
    // Grains: thicken the middle of the arc and mark uv.y as "near the tip".
    const uv = tube.getAttribute('uv') as THREE.BufferAttribute
    for (let v = 0; v < uv.count; v++) uv.setY(v, 0.85 + uv.getX(v) * 0.15)
    parts.push(tube)
  }
  return mergeGeometries(parts)!
}

/** Coconut palm: curved trunk + crown of arching fronds with leaflets. uv.y = sway weight. */
export function palmGeometry(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const h = 9 + rnd() * 5
  const lean = new THREE.Vector3((rnd() - 0.5) * 1.6, 0, (rnd() - 0.5) * 1.6)
  const trunkPts = [0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(0, h * t, 0).addScaledVector(lean, t * t))
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trunkPts), 10, 0.17, 6, false)
  const tuv = trunk.getAttribute('uv') as THREE.BufferAttribute
  for (let v = 0; v < tuv.count; v++) tuv.setXY(v, 0, tuv.getX(v) * 0.15)
  const top = trunkPts[3]!
  const parts: THREE.BufferGeometry[] = [trunk]
  const fronds = 14
  for (let i = 0; i < fronds; i++) {
    const yaw = (i / fronds) * Math.PI * 2 + rnd() * 0.3
    const up = i % 3 === 0 ? 0.9 : 0.35 + rnd() * 0.3
    const len = 4.8 + rnd() * 1.4
    // Rachis plus leaflets on both sides.
    const out = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw))
    const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw))
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const seg = 10
    for (let k = 0; k <= seg; k++) {
      const t = k / seg
      const c = top.clone().addScaledVector(out, len * t).add(new THREE.Vector3(0, len * (up * t - (0.55 + up * 0.5) * t * t), 0))
      const leaf = 0.95 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) * (1 - t * 0.3)
      const droop = new THREE.Vector3(0, -leaf * 0.55, 0)
      const l = c.clone().addScaledVector(side, -leaf).add(droop)
      const r = c.clone().addScaledVector(side, leaf).add(droop)
      pos.push(l.x, l.y, l.z, c.x, c.y, c.z, r.x, r.y, r.z)
      uv.push(0, 0.3 + t * 0.7, 0.5, 0.3 + t * 0.7, 1, 0.3 + t * 0.7)
      if (k < seg) {
        const a = k * 3
        idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    parts.push(g)
  }
  // Vertex colours: bark for the trunk (first part), fresh green for fronds with slight variation.
  const bark = new THREE.Color('#6b5439')
  const frond = new THREE.Color('#3f7a2e')
  const coloured = parts.map((part, i) => {
    const g = part.index ? part.toNonIndexed() : part
    const n = g.getAttribute('position').count
    const col = new Float32Array(n * 3)
    const c = i === 0 ? bark : frond.clone().offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.08)
    for (let v = 0; v < n; v++) col.set([c.r, c.g, c.b], v * 3)
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    return g
  })
  const merged = mergeGeometries(coloured)!
  merged.computeVertexNormals()
  return merged
}

/** Low, lumpy broadleaf tree for the distant tree line. */
export function treeBlobGeometry(): THREE.BufferGeometry {
  // Merge duplicate vertices so normals smooth across faces (Icosahedron is non-indexed → flat shaded).
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2))
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const rnd = mulberry32(7)
  for (let i = 0; i < p.count; i++) {
    const s = 0.82 + rnd() * 0.3
    p.setXYZ(i, p.getX(i) * s, Math.max(-0.2, p.getY(i)) * s * 0.85 + 0.6, p.getZ(i) * s)
  }
  g.computeVertexNormals()
  return g
}

/** Egret in flight: body, neck and two wing panels that flap about the body axis. */
export function egretParts() {
  const body = new THREE.CapsuleGeometry(0.09, 0.42, 4, 8)
  body.rotateZ(Math.PI / 2)
  const neck = new THREE.CapsuleGeometry(0.035, 0.22, 3, 6)
  neck.rotateZ(Math.PI / 2.6)
  neck.translate(0.3, 0.07, 0)
  const head = new THREE.SphereGeometry(0.05, 8, 6)
  head.translate(0.42, 0.13, 0)
  const bill = new THREE.ConeGeometry(0.018, 0.14, 5)
  bill.rotateZ(-Math.PI / 2)
  bill.translate(0.52, 0.12, 0)
  const legs = new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4)
  legs.rotateZ(Math.PI / 2)
  legs.translate(-0.38, -0.02, 0)
  const bodyGeo = mergeGeometries([body, neck, head, legs].map((g) => g.toNonIndexed()))!
  const wing = new THREE.BufferGeometry()
  // Swept wing: root along the body, tip out on +z.
  wing.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.15, 0, 0, 0.18, 0, 0, 0.02, 0, 0.55,
    0.02, 0, 0.55, -0.15, 0, 0, -0.22, 0, 0.62,
    -0.22, 0, 0.62, 0.02, 0, 0.55, -0.1, 0, 0.82,
  ], 3))
  wing.computeVertexNormals()
  return { bodyGeo, wing, bill }
}

export function butterflyWing(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(0.02, 0.05, 0.06, 0.06, 0.055, 0.02)
  s.bezierCurveTo(0.06, -0.01, 0.04, -0.045, 0, -0.01)
  return new THREE.ShapeGeometry(s, 6)
}
