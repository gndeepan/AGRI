import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { signedDistanceToEdge } from '../fieldShape';
import { mulberry32 } from '../prng';
import { useSceneSettings } from '../quality';
import { useField } from './FieldContext';

function colorize(geo: THREE.BufferGeometry, color: THREE.Color, jitter = 0, seed = 1): THREE.BufferGeometry {
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
function createPalmGeometry(detail: 'high' | 'low', seed: number): THREE.BufferGeometry {
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
function createTreeGeometry(seed: number): THREE.BufferGeometry {
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

export function Backdrop() {
  const { quality } = useSceneSettings();
  const { shape } = useField();
  const high = quality === 'high';

  const instanced = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const rand = mulberry32(31);
    const ring = shape.radius + 25;
    const palmVariants = [0, 1, 2].map((v) => createPalmGeometry(high ? 'high' : 'low', 100 + v));
    const treeGeo = createTreeGeometry(7);
    const perVariant = high ? 24 : 12;
    const meshes: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const sv = new THREE.Vector3();
    const place = (mesh: THREE.InstancedMesh, count: number, minD: number, maxD: number, scale: [number, number]) => {
      let n = 0;
      for (let tries = 0; n < count && tries < count * 20; tries++) {
        // Palms cluster in groves along field edges and around homesteads.
        const grove = Math.floor(rand() * 9);
        const ga = (grove / 9) * Math.PI * 2 + 0.4;
        const a = ga + (rand() - 0.5) * 0.5;
        const d = minD + rand() * (maxD - minD);
        const x = shape.center[0] + Math.cos(a) * d;
        const z = shape.center[1] + Math.sin(a) * d;
        if (signedDistanceToEdge(shape, x, z) < 6) continue;
        const s = scale[0] + rand() * (scale[1] - scale[0]);
        m.makeRotationY(rand() * Math.PI * 2).scale(sv.set(s, s * (0.9 + rand() * 0.25), s)).setPosition(x, 0, z);
        mesh.setMatrixAt(n++, m);
      }
      mesh.count = n;
    };
    for (const g of palmVariants) {
      const mesh = new THREE.InstancedMesh(g, mat, perVariant);
      place(mesh, perVariant, ring, ring + 140, [0.85, 1.25]);
      mesh.castShadow = false;
      meshes.push(mesh);
    }
    const trees = new THREE.InstancedMesh(treeGeo, mat, high ? 40 : 18);
    place(trees, high ? 40 : 18, ring + 60, ring + 320, [1, 1.8]);
    meshes.push(trees);
    return { meshes, mat };
  }, [shape, high]);

  useEffect(() => () => {
    instanced.meshes.forEach((m) => m.geometry.dispose());
    instanced.mat.dispose();
  }, [instanced]);

  const hills = useMemo(() => {
    const rand = mulberry32(8);
    const d = shape.radius + 600;
    return Array.from({ length: 11 }, (_, i) => {
      const a = -Math.PI * 0.85 + (i / 10) * Math.PI * 0.7;
      return {
        x: shape.center[0] + Math.cos(a) * d + (rand() - 0.5) * 80,
        z: shape.center[1] + Math.sin(a) * d,
        r: 120 + rand() * 150,
        h: 40 + rand() * 70,
      };
    });
  }, [shape]);

  return (
    <group>
      {instanced.meshes.map((m, i) => <primitive key={i} object={m} />)}
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, -4, h.z]} scale={[h.r, h.h, h.r * 0.6]}>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#56705a" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
