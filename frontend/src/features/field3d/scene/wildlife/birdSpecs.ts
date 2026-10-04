import * as THREE from 'three';
import { at, buildColored, ellipsoid, limb } from './geo';
import { setSurface } from './organicMaterial';

export type Species = 'egret' | 'myna' | 'parakeet' | 'drongo';

export interface BirdGeos {
  body: THREE.BufferGeometry;
  /** Pivot at the shoulder of the neck; extends along +z/+y. */
  neck: THREE.BufferGeometry;
  /** Position of the neck pivot relative to the body origin. */
  neckPivot: [number, number, number];
  /** Left wing (extends along -x from the shoulder); the right wing mirrors it. */
  wing: THREE.BufferGeometry;
  wingPivot: [number, number, number];
  leg: THREE.BufferGeometry;
  legPivot: [number, number, number];
  tail: THREE.BufferGeometry;
  tailPivot: [number, number, number];
  /** Standing height of the hip above the ground, in metres. */
  hipY: number;
}

const WHITE = '#f6f3ea';
const WHITE_SH = '#dcd8cc';

function wingShape(span: number, chord: number, color: string, tip: string): THREE.BufferGeometry {
  // Flat swept wing: root at the origin, extending along -x; primaries darker/coloured at the tip.
  const g = new THREE.BufferGeometry();
  const verts = [
    0, 0, chord * 0.5, -span * 0.55, 0, chord * 0.55, -span, 0, chord * 0.05,
    0, 0, chord * 0.5, -span, 0, chord * 0.05, -span * 0.8, 0, -chord * 0.6,
    0, 0, chord * 0.5, -span * 0.8, 0, -chord * 0.6, 0, 0, -chord * 0.5,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const c1 = new THREE.Color(color);
  const c2 = new THREE.Color(tip);
  const cols: number[] = [];
  const pick = [c1, c1, c2, c1, c2, c2, c1, c2, c1];
  pick.forEach((c) => cols.push(c.r, c.g, c.b));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return setSurface(g, 'feather');
}

export function birdGeos(species: Species): BirdGeos {
  switch (species) {
    case 'egret': {
      // Cattle egret: stocky white body, long S-neck, yellow bill, buff plumes on the crown and breast in season.
      const body = buildColored([
        [ellipsoid(0.075, 0.07, 0.15, 12, 9), WHITE],
        [at(ellipsoid(0.06, 0.05, 0.07, 8, 6), 0, 0.02, 0.07), '#efe3c4'], // buff breast plumes
        [at(ellipsoid(0.03, 0.025, 0.07, 6, 5), 0, 0.01, -0.17), WHITE_SH],
      ], 'feather');
      const neck = buildColored([
        [at(limb(0.02, 0.026, 0.1, 6).rotateX(-0.2), 0, 0.1, 0.02), WHITE],
        [at(limb(0.017, 0.02, 0.1, 6).rotateX(0.35), 0, 0.2, 0.0), WHITE],
        [at(ellipsoid(0.034, 0.032, 0.05, 8, 6), 0, 0.215, 0.05), '#efe3c4'],
        [at(ellipsoid(0.007, 0.007, 0.007, 4, 4), 0.026, 0.225, 0.07), '#1a1a12', 'eye'],
        [at(new THREE.ConeGeometry(0.011, 0.075, 5).rotateX(Math.PI / 2), 0, 0.212, 0.115), '#e3a62f', 'horn'],
      ], 'feather');
      return {
        body, neck, neckPivot: [0, 0.03, 0.1],
        wing: wingShape(0.34, 0.16, WHITE, '#e8e4d8'), wingPivot: [-0.05, 0.05, 0.02],
        leg: buildColored([
          [limb(0.009, 0.007, 0.13, 4), '#6f6a3c'], // thigh+tibia, joint in mid
          [at(limb(0.007, 0.006, 0.13, 4), 0, -0.13, 0), '#3a3a28'],
          [at(new THREE.BoxGeometry(0.03, 0.006, 0.07), 0, -0.262, 0.025), '#3a3a28'],
        ], 'horn'), legPivot: [0.035, -0.04, 0.0],
        tail: buildColored([[at(ellipsoid(0.03, 0.01, 0.05, 6, 4), 0, 0, -0.04), WHITE_SH]], 'feather'), tailPivot: [0, 0.01, -0.2],
        hipY: 0.27,
      };
    }
    case 'myna': {
      const body = buildColored([
        [ellipsoid(0.04, 0.042, 0.075, 10, 8), '#6b4a34'],
        [at(ellipsoid(0.035, 0.03, 0.05, 8, 6), 0, 0.012, 0.045), '#7a5740'],
      ], 'feather');
      const neck = buildColored([
        [at(ellipsoid(0.03, 0.032, 0.034, 8, 6), 0, 0.045, 0.02), '#15110e'], // black head
        [at(ellipsoid(0.018, 0.012, 0.012, 5, 4), 0.02, 0.05, 0.035), '#f1c52b', 'horn'], // yellow bare-skin eye patch
        [at(new THREE.ConeGeometry(0.009, 0.034, 5).rotateX(Math.PI / 2), 0, 0.04, 0.062), '#f1b82b', 'horn'],
      ], 'feather');
      return {
        body, neck, neckPivot: [0, 0.03, 0.06],
        wing: wingShape(0.17, 0.09, '#6b4a34', '#2a1d14'), wingPivot: [-0.03, 0.03, 0.0],
        leg: buildColored([[limb(0.006, 0.005, 0.07, 4), '#f1b82b'], [at(new THREE.BoxGeometry(0.02, 0.004, 0.04), 0, -0.07, 0.012), '#f1b82b']], 'horn'),
        legPivot: [0.02, -0.035, 0.0],
        tail: buildColored([[at(ellipsoid(0.02, 0.006, 0.04, 6, 4), 0, 0, -0.035), '#3b2a1d']], 'feather'), tailPivot: [0, 0, -0.07],
        hipY: 0.075,
      };
    }
    case 'parakeet': {
      const body = buildColored([
        [ellipsoid(0.035, 0.036, 0.075, 10, 8), '#7cc242'],
        [at(ellipsoid(0.03, 0.02, 0.05, 8, 6), 0, -0.012, 0.01), '#a9d86b'],
      ], 'feather');
      const neck = buildColored([
        [at(ellipsoid(0.03, 0.03, 0.032, 8, 6), 0, 0.04, 0.02), '#74b83a'],
        [at(ellipsoid(0.023, 0.006, 0.02, 6, 4), 0, 0.022, 0.026), '#1a1a1a'], // black collar
        [at(new THREE.SphereGeometry(0.014, 6, 5), 0, 0.037, 0.048).scale(1, 0.9, 1.1), '#d9363a', 'horn'], // red hooked beak
        [at(ellipsoid(0.005, 0.005, 0.005, 4, 4), 0.022, 0.05, 0.036), '#111111', 'eye'],
      ], 'feather');
      return {
        body, neck, neckPivot: [0, 0.03, 0.06],
        wing: wingShape(0.2, 0.08, '#6bb534', '#3f7f2a'), wingPivot: [-0.03, 0.03, 0.0],
        leg: buildColored([[limb(0.005, 0.004, 0.04, 4), '#c9b8a0']], 'horn'), legPivot: [0.015, -0.03, 0.0],
        tail: buildColored([[at(ellipsoid(0.012, 0.004, 0.12, 5, 4), 0, 0, -0.11), '#52a83a']], 'feather'), tailPivot: [0, 0, -0.06],
        hipY: 0.045,
      };
    }
    case 'drongo': {
      const body = buildColored([[ellipsoid(0.034, 0.036, 0.085, 10, 8), '#14171c']], 'feather');
      const neck = buildColored([
        [at(ellipsoid(0.03, 0.03, 0.035, 8, 6), 0, 0.04, 0.02), '#14171c'],
        [at(new THREE.ConeGeometry(0.009, 0.036, 5).rotateX(Math.PI / 2), 0, 0.037, 0.06), '#0c0d10', 'horn'],
        [at(ellipsoid(0.005, 0.005, 0.005, 4, 4), 0.022, 0.048, 0.04), '#b02a2a', 'eye'],
      ], 'feather');
      return {
        body, neck, neckPivot: [0, 0.03, 0.07],
        wing: wingShape(0.19, 0.09, '#14171c', '#0c0d10'), wingPivot: [-0.03, 0.03, 0.0],
        leg: buildColored([[limb(0.005, 0.004, 0.035, 4), '#111111']], 'horn'), legPivot: [0.015, -0.03, 0.0],
        // Forked tail.
        tail: buildColored([
          [at(ellipsoid(0.006, 0.004, 0.07, 4, 3).rotateY(0.18), -0.012, 0, -0.14), '#14171c'],
          [at(ellipsoid(0.006, 0.004, 0.07, 4, 3).rotateY(-0.18), 0.012, 0, -0.14), '#14171c'],
        ], 'feather'), tailPivot: [0, 0, -0.07],
        hipY: 0.04,
      };
    }
  }
}
