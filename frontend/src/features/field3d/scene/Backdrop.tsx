import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../prng';
import { useField } from './FieldContext';

export function colorize(geo: THREE.BufferGeometry, color: THREE.Color, jitter = 0, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const count = g.attributes.position?.count ?? 0;
  const colors = new Float32Array(count * 3);
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i += 3) {
    const k = 1 + (rand() - 0.5) * jitter;
    for (let v = 0; v < 3 && i + v < count; v++) colors.set([color.r * k, color.g * k, color.b * k], (i + v) * 3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Coconut palm: ringed curved trunk, a crown of pinnate fronds with drooping leaflets, a nut cluster. */
export function createPalmGeometry(detail: 'high' | 'low', seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const lean = 0.6 + rand() * 1.4;
  const height = 8 + rand() * 4;
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.15, height * 0.35, 0),
    new THREE.Vector3(lean * 0.55, height * 0.7, 0.05),
    new THREE.Vector3(lean, height, 0.1),
  ]);
  const trunk = new THREE.TubeGeometry(trunkCurve, detail === 'high' ? 16 : 8, 0.17, 7, false);
  parts.push(colorize(trunk, new THREE.Color('#7a6a55'), 0.25, seed));

  const top = trunkCurve.getPoint(1);
  const nuts = new THREE.SphereGeometry(0.32, 7, 5);
  nuts.scale(1, 0.7, 1);
  nuts.translate(top.x, top.y - 0.35, top.z);
  parts.push(colorize(nuts, new THREE.Color('#6b6a2a'), 0.3, seed + 1));

  const fronds = detail === 'high' ? 18 : 11;
  const leaflets = detail === 'high' ? 22 : 10;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rand() * 0.3;
    const age = rand();
    const lift = 1.6 - age * 1.4;
    const fall = 1.2 + age * 2.8;
    const length = 3.2 + rand() * 1.2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const sideDir = new THREE.Vector3(-dir.z, 0, dir.x);
    const pts = Array.from({ length: 7 }, (_, s) => {
      const t = s / 6;
      return top.clone().addScaledVector(dir, t * length).add(new THREE.Vector3(0, lift * t - fall * t * t, 0));
    });
    const rachis = new THREE.CatmullRomCurve3(pts);
    parts.push(colorize(new THREE.TubeGeometry(rachis, 6, 0.03, 3, false), new THREE.Color('#5d6b2a'), 0, seed + i));
    const pos: number[] = [];
    for (let l = 0; l < leaflets; l++) {
      const t = 0.08 + (l / leaflets) * 0.9;
      const p = rachis.getPoint(t);
      const tan = rachis.getTangent(t);
      const ll = (0.9 - Math.abs(t - 0.45) * 0.9) * (0.9 + rand() * 0.2);
      for (const side of [-1, 1]) {
        // Leaflets hang down and slightly forward; old fronds droop more.
        const out = sideDir.clone().multiplyScalar(side).addScaledVector(tan, 0.35).add(new THREE.Vector3(0, -0.55 - age * 0.4, 0)).normalize();
        const tip = p.clone().addScaledVector(out, ll);
        const w = tan.clone().multiplyScalar(0.06);
        pos.push(p.x - w.x, p.y - w.y, p.z - w.z, p.x + w.x, p.y + w.y, p.z + w.z, tip.x, tip.y, tip.z);
      }
    }
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    leafGeo.computeVertexNormals();
    const green = new THREE.Color().setHSL(0.24 + rand() * 0.03, 0.45, age > 0.8 ? 0.32 : 0.22);
    parts.push(colorize(leafGeo, age > 0.92 ? new THREE.Color('#8c7a45') : green, 0.35, seed + 50 + i));
  }
  const merged = mergeGeometries(parts.map((p) => {
    if (!p.getAttribute('normal')) p.computeVertexNormals();
    return p;
  }), false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/** Broadleaf tree (neem / tamarind silhouette): trunk + clustered canopy blobs. */
export function createTreeGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const h = 4 + rand() * 3;
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, h, 6);
  trunk.translate(0, h / 2, 0);
  parts.push(colorize(trunk, new THREE.Color('#5a4a3a'), 0.2, seed));
  for (let i = 0; i < 7; i++) {
    const r = 1.6 + rand() * 1.6;
    const blob = new THREE.IcosahedronGeometry(r, 1);
    blob.translate((rand() - 0.5) * 3.5, h + (rand() - 0.2) * 2.2, (rand() - 0.5) * 3.5);
    parts.push(colorize(blob, new THREE.Color().setHSL(0.27, 0.42, 0.2 + rand() * 0.06), 0.3, seed + i));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/** Palmyra palm: tall straight trunk with a slight swelling and a dense fan-leaf crown. */
export function createPalmyraGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const h = 9 + rand() * 3.5;
  const pts = [0, 0.3, 0.65, 1].map((t) => new THREE.Vector3((rand() - 0.5) * 0.3 * t, h * t, 0));
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.19, 7, false);
  parts.push(colorize(trunk, new THREE.Color('#7d6f5d'), 0.3, seed));
  const top = pts[3]!;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.2;
    const lift = 0.35 + rand() * 0.55;
    const len = 3 + rand() * 1.1;
    const dir = new THREE.Vector3(Math.cos(a), lift, Math.sin(a)).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(1.5);
    const tip = top.clone().addScaledVector(dir, len);
    tip.y -= 0.55 * len * (1 - lift);
    const mid = top.clone().addScaledVector(dir, len * 0.55);
    const f = new THREE.BufferGeometry();
    f.setAttribute('position', new THREE.Float32BufferAttribute([
      top.x, top.y, top.z, mid.x + side.x, mid.y, mid.z + side.z, tip.x, tip.y, tip.z,
      top.x, top.y, top.z, tip.x, tip.y, tip.z, mid.x - side.x, mid.y, mid.z - side.z,
    ], 3));
    // Fan leaves face up so the crown stays lit when seen from below.
    f.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    const leafColor = new THREE.Color().setHSL(0.24 + rand() * 0.03, 0.42, 0.26 + rand() * 0.07);
    parts.push(colorize(f, leafColor, 0.3, seed + 10 + i));
    // The same leaf with reversed winding and a hair lower: from below the lit (up-normal) face
    // is the one that faces the viewer, so the crown doesn't go black against the sky.
    const under = f.clone();
    const up = under.getAttribute('position');
    for (let v = 0; v < up.count; v += 3) {
      const ax = up.getX(v + 1); const ay = up.getY(v + 1); const az = up.getZ(v + 1);
      up.setXYZ(v + 1, up.getX(v + 2), up.getY(v + 2), up.getZ(v + 2));
      up.setXYZ(v + 2, ax, ay, az);
    }
    under.translate(0, -0.03, 0);
    parts.push(colorize(under, leafColor, 0.3, seed + 60 + i));
  }
  const fruit = new THREE.SphereGeometry(0.22, 6, 5);
  fruit.translate(top.x + 0.2, top.y - 0.5, top.z);
  parts.push(colorize(fruit, new THREE.Color('#3b2b24'), 0.2, seed + 99));
  const merged = mergeGeometries(parts.map((p) => { if (!p.getAttribute('normal')) p.computeVertexNormals(); return p; }), false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/** Banyan: several stout trunks, a very wide dark canopy and hanging aerial roots. */
export function createBanyanGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const t = new THREE.CylinderGeometry(0.35, 0.6, 6, 6);
    t.translate(Math.cos(a) * 1.4, 3, Math.sin(a) * 1.4);
    parts.push(colorize(t, new THREE.Color('#5f5446'), 0.25, seed + i));
  }
  for (let i = 0; i < 11; i++) {
    const blob = new THREE.IcosahedronGeometry(3 + rand() * 2.4, 1);
    const a = rand() * Math.PI * 2;
    const d = rand() * 7;
    blob.scale(1, 0.62, 1);
    blob.translate(Math.cos(a) * d, 7 + rand() * 2.5, Math.sin(a) * d);
    parts.push(colorize(blob, new THREE.Color().setHSL(0.27, 0.4, 0.15 + rand() * 0.05), 0.3, seed + 20 + i));
  }
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const d = 2 + rand() * 6;
    const root = new THREE.CylinderGeometry(0.04, 0.05, 6.5, 4);
    root.translate(Math.cos(a) * d, 3.5, Math.sin(a) * d);
    parts.push(colorize(root, new THREE.Color('#6b5a45'), 0.2, seed + 40 + i));
  }
  const merged = mergeGeometries(parts.map((p) => { if (!p.getAttribute('normal')) p.computeVertexNormals(); return p; }), false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/** Distant low ridge on the horizon; trees, village and landmarks live in Landscape.tsx. */
export function Backdrop() {
  const { shape } = useField();

  const hills = useMemo(() => {
    const rand = mulberry32(8);
    // The delta is flat: only a low, distant ridge (Eastern Ghats foothills) on the western horizon,
    // leaving the live sky visible above the tree line.
    const d = shape.radius + 900;
    return Array.from({ length: 11 }, (_, i) => {
      const a = -Math.PI * 0.85 + (i / 10) * Math.PI * 0.7;
      return {
        x: shape.center[0] + Math.cos(a) * d + (rand() - 0.5) * 80,
        z: shape.center[1] + Math.sin(a) * d,
        r: 160 + rand() * 180,
        h: 12 + rand() * 22,
      };
    });
  }, [shape]);

  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, -4, h.z]} scale={[h.r, h.h, h.r * 0.6]}>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#56705a" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
