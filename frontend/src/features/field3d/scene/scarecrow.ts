import * as THREE from 'three';
import { mulberry32 } from '../prng';
import { at, buildColored, ellipsoid, type ColoredPart } from './wildlife/geo';
import type { SurfKind } from './wildlife/organicMaterial';

/**
 * Classic field scarecrow, about 1.9 m to the top of the hat, facing +z: a wooden pole and crossbar,
 * blue denim overalls (bib, straps, brass buttons, rolled cuffs) over a plaid flannel shirt with the
 * arms stretched along the crossbar, a stuffed burlap-sack head with a stitched face tied off with
 * rope, a woven straw hat with a band, and straw spilling from the cuffs, trouser legs and collar.
 */

const DENIM = '#6684b0';
const DENIM_DARK = '#4f6d98';
const PLAID = '#a8684f';
const BURLAP = '#b59c70';
const HAT = '#c9a964';
const WOOD = '#6b5236';
const STRAWS = ['#dcb860', '#c9a24a', '#e8cc7c', '#b8913f'];

const UP = new THREE.Vector3(0, 1, 0);

export function scarecrowGeometry(): THREE.BufferGeometry {
  const rand = mulberry32(5);
  const parts: ColoredPart[] = [];
  const add = (g: THREE.BufferGeometry, color: string, kind: SurfKind) => parts.push([g, color, kind]);

  /** A bunch of straw stalks fanning out from a point along `dir`. */
  const tuft = (x: number, y: number, z: number, dir: [number, number, number], n: number, len: number, spread: number, jitter = 0.03) => {
    const base = new THREE.Vector3(...dir).normalize();
    const d = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      d.set(base.x + (rand() - 0.5) * spread, base.y + (rand() - 0.5) * spread, base.z + (rand() - 0.5) * spread).normalize();
      const l = len * (0.55 + rand() * 0.7);
      const g = new THREE.ConeGeometry(0.0035 + rand() * 0.002, l, 3);
      g.translate(0, l / 2, 0);
      g.applyQuaternion(q.setFromUnitVectors(UP, d));
      g.translate(x + (rand() - 0.5) * jitter, y + (rand() - 0.5) * jitter, z + (rand() - 0.5) * jitter);
      add(g, STRAWS[Math.floor(rand() * STRAWS.length)]!, 'straw');
    }
  };

  // Pole down through the body and a crossbar inside the sleeves.
  add(at(new THREE.CylinderGeometry(0.028, 0.034, 1.8, 10, 6), 0, 0.9, -0.03), WOOD, 'wood');
  add(at(new THREE.CylinderGeometry(0.022, 0.022, 1.26, 10, 4).rotateZ(Math.PI / 2), 0, 1.36, -0.03), WOOD, 'wood');

  // Overalls: seat, waistband, legs hanging either side of the pole, rolled-up cuffs.
  add(at(ellipsoid(0.19, 0.13, 0.12, 16, 10), 0, 1.0, 0), DENIM, 'denim');
  add(at(new THREE.CylinderGeometry(0.178, 0.182, 0.06, 24, 1).scale(1, 1, 0.68), 0, 1.07, 0), DENIM_DARK, 'denim');
  for (const side of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.072, 0.066, 0.56, 16, 6);
    leg.translate(0, -0.28, 0).rotateZ(side * 0.05).translate(side * 0.1, 0.98, 0.005);
    add(leg, DENIM, 'denim');
    const cuffY = 0.98 - 0.56 * Math.cos(0.05);
    const cuffX = side * (0.1 + 0.56 * Math.sin(0.05));
    add(at(new THREE.CylinderGeometry(0.074, 0.074, 0.045, 16, 1), cuffX, cuffY + 0.03, 0.005), DENIM_DARK, 'denim');
    tuft(cuffX, cuffY + 0.01, 0.005, [side * 0.15, -1, 0], 34, 0.2, 0.6, 0.08);
  }

  // Plaid shirt: body, shoulders, sleeves along the crossbar with straw at the cuffs.
  add(at(new THREE.CylinderGeometry(0.17, 0.172, 0.4, 24, 4).scale(1, 1, 0.66), 0, 1.24, 0), PLAID, 'plaid');
  add(at(ellipsoid(0.2, 0.075, 0.12, 16, 10), 0, 1.41, 0), PLAID, 'plaid');
  for (const side of [-1, 1]) {
    const sleeve = new THREE.CylinderGeometry(0.066, 0.056, 0.46, 14, 5);
    sleeve.rotateZ(Math.PI / 2).translate(side * 0.39, 1.365, -0.01);
    add(sleeve, PLAID, 'plaid');
    // Loose folds where the sleeve bunches at the elbow.
    add(at(new THREE.TorusGeometry(0.06, 0.008, 6, 16).rotateY(Math.PI / 2), side * 0.36, 1.365, -0.01), PLAID, 'plaid');
    add(at(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 14, 1).rotateZ(Math.PI / 2), side * 0.61, 1.365, -0.01), '#844a3a', 'plaid');
    tuft(side * 0.63, 1.365, -0.01, [side, -0.3, 0], 40, 0.2, 0.75, 0.07);
  }

  // Bib with a patch pocket, shoulder straps and brass buttons.
  add(at(new THREE.BoxGeometry(0.24, 0.26, 0.02, 4, 4, 1), 0, 1.22, 0.112), DENIM, 'denim');
  add(at(new THREE.BoxGeometry(0.11, 0.09, 0.006), 0, 1.22, 0.124), DENIM_DARK, 'denim');
  for (const side of [-1, 1]) {
    add(at(new THREE.BoxGeometry(0.036, 0.14, 0.012).rotateX(-0.45), side * 0.088, 1.405, 0.095), DENIM, 'denim');
    add(at(new THREE.BoxGeometry(0.036, 0.012, 0.22), side * 0.088, 1.48, -0.005), DENIM, 'denim');
    add(at(new THREE.BoxGeometry(0.036, 0.22, 0.012), side * 0.088, 1.37, -0.085), DENIM, 'denim');
    add(at(new THREE.SphereGeometry(0.015, 12, 8), side * 0.088, 1.335, 0.126), '#c8a95a', 'metal');
  }
  // Straw poking out of the collar.
  tuft(0, 1.47, 0.02, [0, 1, 0.3], 16, 0.07, 1.2, 0.1);

  // Burlap sack head, gathered at the neck and tied with rope.
  const head = { x: 0, y: 1.6, z: 0, rx: 0.12, ry: 0.135, rz: 0.115 };
  add(at(ellipsoid(head.rx, head.ry, head.rz, 20, 16), head.x, head.y, head.z), BURLAP, 'burlap');
  add(at(new THREE.CylinderGeometry(0.06, 0.08, 0.07, 16, 2), 0, 1.495, 0), BURLAP, 'burlap');
  add(at(new THREE.TorusGeometry(0.063, 0.011, 8, 20).rotateX(Math.PI / 2), 0, 1.49, 0), '#8a6f45', 'straw');

  // Face, stitched onto the sack front.
  const surfZ = (x: number, y: number) => head.rz * Math.sqrt(Math.max(0, 1 - (x / head.rx) ** 2 - ((y - head.y) / head.ry) ** 2)) + 0.002;
  for (const side of [-1, 1]) {
    const ex = side * 0.045;
    const ey = 1.625;
    add(at(ellipsoid(0.022, 0.018, 0.007, 10, 8), ex, ey, surfZ(ex, ey) - 0.002), '#2a2119', 'cloth');
  }
  add(at(ellipsoid(0.016, 0.012, 0.007, 8, 6), 0, 1.592, surfZ(0, 1.592)), '#3a2c20', 'cloth');
  for (let i = 0; i <= 8; i++) {
    const x = -0.056 + i * 0.014;
    const y = 1.556 + 0.03 * (x / 0.056) ** 2;
    const stitch = new THREE.BoxGeometry(0.003, 0.022, 0.004);
    stitch.rotateZ(Math.atan2(0.06 * x, 0.056 ** 2) * 0.6).translate(x, y, surfZ(x, y));
    add(stitch, '#1f1812', 'cloth');
    if (i < 8) {
      const x2 = x + 0.007;
      const y2 = 1.556 + 0.03 * (x2 / 0.056) ** 2;
      add(at(new THREE.BoxGeometry(0.014, 0.003, 0.004).rotateZ(Math.atan2(0.06 * x2 * 2, 0.056 ** 2) * 0.35), x2, y2, surfZ(x2, y2)), '#1f1812', 'cloth');
    }
  }

  // Woven straw hat, tipped back and to one side, with a dark band and a frayed brim edge.
  const hatParts: ColoredPart[] = [
    [at(new THREE.CylinderGeometry(0.104, 0.124, 0.12, 32, 3), 0, 1.775, 0), HAT, 'wovenStraw'],
    [at(ellipsoid(0.104, 0.02, 0.104, 16, 6), 0, 1.835, 0), HAT, 'wovenStraw'],
    [at(new THREE.CylinderGeometry(0.255, 0.255, 0.012, 48, 1), 0, 1.718, 0), HAT, 'wovenStraw'],
    [at(new THREE.CylinderGeometry(0.127, 0.127, 0.03, 32, 1, true), 0, 1.738, 0), '#5a3b22', 'cloth'],
  ];
  const fray: ColoredPart[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.1;
    const l = 0.02 + rand() * 0.025;
    const g = new THREE.ConeGeometry(0.003, l, 3);
    g.translate(0, l / 2, 0).rotateZ(-Math.PI / 2 + (rand() - 0.5) * 0.4).rotateY(-a).translate(Math.cos(a) * 0.25, 1.716, Math.sin(a) * 0.25);
    fray.push([g, STRAWS[i % STRAWS.length]!, 'straw']);
  }
  const tilt = new THREE.Matrix4()
    .makeTranslation(0, head.y, 0)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.12, 0, 0.08)))
    .multiply(new THREE.Matrix4().makeTranslation(0, -head.y, 0));
  for (const [g, c, k] of [...hatParts, ...fray]) {
    g.applyMatrix4(tilt);
    parts.push([g, c, k]);
  }

  return buildColored(parts, 'cloth');
}
