import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { planLandscape, type TreeSpot } from '../landscape';
import { mulberry32 } from '../prng';
import { useSceneSettings } from '../quality';
import { createBanyanGeometry, createPalmGeometry, createPalmyraGeometry, createTreeGeometry } from './Backdrop';
import { useField } from './FieldContext';
import { buildCanals, buildGopuram, buildHouses, buildPoles, buildRoad, buildWires } from './landscapeGeometry';
import { colored, place } from './meshUtil';

/**
 * Everything around the farmer's field, from the neighbouring village to the horizon: houses,
 * road and electricity poles, canals, a temple tower, a tank bund and groves of trees. All of it is
 * merged or instanced (≈ a dozen draw calls) and fixed per land (see landscape.ts).
 */
export function Landscape() {
  const { shape } = useField();
  const { quality } = useSceneSettings();
  const high = quality === 'high';
  const plan = useMemo(() => planLandscape(shape), [shape]);

  const built = useMemo(() => {
    const houses = buildHouses(high ? plan.houses : plan.houses.slice(0, 10));
    const roadAngle = Math.atan2(plan.road.b[0] - plan.road.a[0], plan.road.b[1] - plan.road.a[1]);
    const poles = buildPoles(plan.poles, roadAngle);
    const wires = buildWires(plan.poles, roadAngle);
    const road = buildRoad(plan);
    const canals = buildCanals(plan.canals);
    const gopuram = plan.gopuram ? buildGopuram(plan.gopuram) : null;

    // Tank: an earthen bund with a grassy top, and the water in front of it (towards the field).
    let tankBund: THREE.BufferGeometry | null = null;
    let tankWater: THREE.BufferGeometry | null = null;
    if (plan.tank) {
      const t = plan.tank;
      const toField = [shape.center[0] - t.center[0], shape.center[1] - t.center[1]];
      const nx = -Math.sin(t.yaw);
      const nz = Math.cos(t.yaw);
      const side = nx * toField[0]! + nz * toField[1]! >= 0 ? 1 : -1;
      const prof = new THREE.Shape();
      prof.moveTo(-t.width * 0.6, 0);
      prof.lineTo(-t.width * 0.12, t.height);
      prof.lineTo(t.width * 0.12, t.height);
      prof.lineTo(t.width * 0.6, 0);
      const ext = new THREE.ExtrudeGeometry(prof, { depth: t.length, bevelEnabled: false });
      ext.translate(0, 0, -t.length / 2);
      ext.rotateY(Math.PI / 2);
      tankBund = colored(place(ext, t.center[0], 0, t.center[1], -t.yaw), '#8a7b55', 0.25, 5);
      const water = new THREE.PlaneGeometry(t.length * 0.92, 60);
      water.rotateX(-Math.PI / 2);
      tankWater = place(water, t.center[0] + nx * side * (t.width * 0.6 + 30), 0.0, t.center[1] + nz * side * (t.width * 0.6 + 30), -t.yaw);
    }
    return { houses, poles, wires, road, canals, gopuram, tankBund, tankWater };
  }, [plan, high, shape.center]);

  // Trees: one InstancedMesh per variant.
  const trees = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
    const detail = high ? 'high' : 'low';
    const variants: Record<TreeSpot['kind'], THREE.BufferGeometry[]> = {
      coconut: [0, 1, 2].map((v) => createPalmGeometry(detail, 100 + v)),
      palmyra: [0, 1].map((v) => createPalmyraGeometry(300 + v)),
      neem: [createTreeGeometry(7), createTreeGeometry(19)],
      banyan: [createBanyanGeometry(41)],
    };
    const rand = mulberry32(plan.seed ^ 0x51ed270b);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const meshes: THREE.InstancedMesh[] = [];
    (Object.keys(variants) as TreeSpot['kind'][]).forEach((kind) => {
      const list = plan.trees.filter((t) => t.kind === kind).slice(0, high ? 400 : 160);
      const vs = variants[kind];
      vs.forEach((geo, vi) => {
        const mine = list.filter((_, i) => i % vs.length === vi);
        if (mine.length === 0) return;
        const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
        mine.forEach((t, i) => {
          const s = t.scale * (0.92 + rand() * 0.16);
          q.setFromEuler(e.set(0, t.yaw, 0));
          m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(s, s * (0.92 + rand() * 0.2), s));
          mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = false;
        meshes.push(mesh);
      });
    });
    return { meshes, mat, geos: Object.values(variants).flat() };
  }, [plan, high]);

  const materials = useMemo(() => ({
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
    road: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    water: new THREE.MeshStandardMaterial({ color: '#58777a', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    tankWater: new THREE.MeshStandardMaterial({ color: '#4c6c70', roughness: 0.04, metalness: 0.25, transparent: true, opacity: 0.92 }),
    wire: new THREE.LineBasicMaterial({ color: '#26262a', fog: true }),
  }), []);

  useEffect(() => () => {
    Object.values(built).forEach((g) => {
      if (g instanceof THREE.BufferGeometry) g.dispose();
      else if (g && typeof g === 'object') Object.values(g).forEach((x) => x instanceof THREE.BufferGeometry && x.dispose());
    });
  }, [built]);
  useEffect(() => () => {
    trees.geos.forEach((g) => g.dispose());
    trees.mat.dispose();
  }, [trees]);
  useEffect(() => () => { Object.values(materials).forEach((m) => m.dispose()); }, [materials]);

  return (
    <group>
      <mesh geometry={built.houses} material={materials.solid} />
      <mesh geometry={built.poles} material={materials.solid} />
      <lineSegments geometry={built.wires} material={materials.wire} />
      <mesh geometry={built.road} material={materials.road} receiveShadow />
      <mesh geometry={built.canals.bank} material={materials.solid} />
      <mesh geometry={built.canals.water} material={materials.water} />
      {built.gopuram && <mesh geometry={built.gopuram} material={materials.solid} />}
      {built.tankBund && <mesh geometry={built.tankBund} material={materials.solid} />}
      {built.tankWater && <mesh geometry={built.tankWater} material={materials.tankWater} />}
      {trees.meshes.map((m, i) => <primitive key={i} object={m} />)}
    </group>
  );
}
