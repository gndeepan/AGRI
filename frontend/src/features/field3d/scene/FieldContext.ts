import { createContext, useContext } from 'react';
import * as THREE from 'three';
import type { FieldShape } from '../fieldShape';
import { syntheticShape } from '../fieldShape';
import type { ResolvedQuality } from '../quality';
import { createWindUniforms, type WindUniforms } from './plantMaterials';

/** Detail budget per quality tier. Radii in metres around the camera-side focus point. */
export interface LodConfig {
  /** Full-detail clumps (creased leaves, 12 tillers) inside this radius. */
  r0: number;
  /** Simplified clumps out to here; beyond it the canopy surface shader takes over. */
  r1: number;
  /** Branched panicles with individual grains inside this radius. */
  panicleR: number;
  budget0: number;
  budget1: number;
  /**
   * Far tier: very light clumps (24 vertices) and single panicles out from the detailed rings, so most
   * of a typical field is real plants rather than the canopy surface. Centred on its own, coarser focus.
   */
  budget2: number;
}

export function lodFor(quality: ResolvedQuality): LodConfig {
  return quality === 'high'
    ? { r0: 5.2, r1: 16, panicleR: 3.2, budget0: 3200, budget1: 26000, budget2: 60000 }
    : { r0: 3, r1: 8.5, panicleR: 0, budget0: 1100, budget1: 8000, budget2: 30000 };
}

export interface FieldContextValue {
  shape: FieldShape;
  wind: WindUniforms;
  /** Centre of the detailed plant patch; mutated in place (no re-render) as the camera moves. */
  focus: THREE.Vector2;
  /** Water surface height in metres (mutated each frame by Ground). */
  waterY: { value: number };
}

export const FieldContext = createContext<FieldContextValue>({
  shape: syntheticShape(),
  wind: createWindUniforms(),
  focus: new THREE.Vector2(),
  waterY: { value: 0 },
});

export const useField = () => useContext(FieldContext);

/** Scene metres → THREE.Vector2 list (x, z) for ShapeUtils, which works in 2D. */
export function ringToVec2(ring: Array<[number, number]>): THREE.Vector2[] {
  return ring.map(([x, z]) => new THREE.Vector2(x, z));
}

/** Flat triangulated polygon in the x/z plane (y = 0, normal +y). */
export function createFlatPolygon(shape: FieldShape, uvScale = 1): THREE.BufferGeometry {
  const contour = ringToVec2(shape.ring);
  const holes = shape.holes.map(ringToVec2);
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const all = [...contour, ...holes.flat()];
  const positions = new Float32Array(all.length * 3);
  const uvs = new Float32Array(all.length * 2);
  const normals = new Float32Array(all.length * 3);
  all.forEach((p, i) => {
    positions.set([p.x, 0, p.y], i * 3);
    uvs.set([p.x * uvScale, -p.y * uvScale], i * 2);
    normals.set([0, 1, 0], i * 3);
  });
  const index: number[] = [];
  for (const [a, b, c] of faces) {
    // Wind so the face points up (+y) in x/z space.
    const pa = all[a]!;
    const pb = all[b]!;
    const pc = all[c]!;
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (cross > 0) index.push(a, c, b);
    else index.push(a, b, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}
