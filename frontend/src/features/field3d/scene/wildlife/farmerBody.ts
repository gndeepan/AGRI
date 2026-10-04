import * as THREE from 'three';
import { mulberry32 } from '../../prng';
import { at, buildColored, ellipsoid, gauss, loft, paint, shadeY, smooth01, type ColoredPart, type LoftRing } from './geo';

/**
 * A sculpted Tamil Nadu farmer, about 1.75 m: weathered brown skin, greying stubble and moustache,
 * a white veshti folded to the knee, a towel (thundu) over the shoulder and another rolled round the
 * head. Barefoot, as on a wet bund. Body parts are lofted through anatomical cross-sections (ribcage,
 * shoulders, calves, knuckles) instead of plain cylinders and spheres, so the figure reads as a person,
 * not a toy, at bund distance.
 *
 * Every part is built in the local frame of its joint in `Farmer.tsx` (hips at 0.9 m; thighs hang from
 * (±0.09, -0.02); knees 0.43 below; torso 0.08 above the hips; shoulders at (±0.2, 0.47); elbows 0.28
 * below the shoulder; head pivot 0.6 above the torso base). +z is the front.
 */

export interface FarmerLook {
  /** Half-sleeve shirt colour, or null when bare-chested. */
  shirt: string | null;
  veshti: string;
}

const SKIN = new THREE.Color('#5b3a27');
const SKIN_WARM = new THREE.Color('#6a4030');
const SKIN_SHADE = new THREE.Color('#47291b');
const LIP = new THREE.Color('#4a2a24');
const STUBBLE = new THREE.Color('#5d5651');
const PALM_COLOR = new THREE.Color('#7a5040');
const HAIR = '#2b2724';
const GREY_HAIR = '#6e6a66';
const TOWEL = '#f2eee3';

const tmp = new THREE.Color();

/** Skin with gentle tonal variation: warmer on the cheeks and knuckles, darker in creases. */
function skin(warm = 0, shade = 0): THREE.Color {
  return tmp.copy(SKIN).lerp(SKIN_WARM, warm).lerp(SKIN_SHADE, shade);
}

// ------------------------------------------------------------------ head

function sculptHead(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 72, 54);
  const p = g.getAttribute('position');
  const col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i);
    const front = Math.max(0, z);
    const ax = Math.abs(x);
    // Jaw narrows below the cheekbones; the cranium is a little flatter at the temples.
    const low = smooth01((-y - 0.15) / 0.85);
    x *= (1 - 0.3 * low) * (0.93 + 0.07 * (1 - Math.abs(y)));
    if (z < 0) z *= 1 - 0.12 * low;
    // Chin, muzzle (mouth area) and brow ridge come forward; eye sockets and temples sink.
    z += 0.11 * gauss(y + 0.86, 0.13) * gauss(x, 0.32) * (front > 0 ? 1 : 0);
    z += 0.07 * gauss(y + 0.55, 0.22) * gauss(x, 0.38) * front;
    z += 0.06 * gauss(y - 0.2, 0.07) * gauss(x, 0.55) * front;
    for (const s of [-1, 1]) {
      z -= 0.1 * gauss(x - s * 0.36, 0.13) * gauss(y - 0.06, 0.1) * front;
      // Cheekbones.
      x += s * 0.05 * gauss(x - s * 0.62, 0.18) * gauss(y + 0.1, 0.15) * front;
      z += 0.03 * gauss(ax - 0.55, 0.15) * gauss(y + 0.12, 0.12) * front;
      // Temples.
      x -= s * 0.04 * gauss(x - s * 0.85, 0.15) * gauss(y - 0.25, 0.2) * gauss(z - 0.4, 0.3);
    }
    // Fuller back of the skull.
    if (z < 0) z -= 0.05 * gauss(y - 0.15, 0.35);
    p.setXYZ(i, x * 0.08, y * 0.114 + 0.09, z * 0.096);

    // Paint: warm cheeks and nose area, darker sockets, greying stubble on the jaw, darker lips.
    const c = skin(0.6 * gauss(ax - 0.5, 0.18) * gauss(y + 0.2, 0.2) * front, 0.5 * gauss(ax - 0.36, 0.12) * gauss(y - 0.02, 0.1) * front);
    const jaw = smooth01((-y - 0.45) / 0.35) * (z > -0.2 ? 1 : 0) * (1 - gauss(x, 0.12) * gauss(y + 0.57, 0.06));
    c.lerp(STUBBLE, 0.4 * jaw);
    c.lerp(LIP, 0.75 * gauss(x, 0.24) * gauss(y + 0.57, 0.045) * front);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function headGeometry(): THREE.BufferGeometry {
  const parts: ColoredPart[] = [[sculptHead(), null, 'skin']];
  // Nose: bridge between the eyes down to a rounded tip, with nostril wings.
  parts.push([paint(loft([
    { y: 0.104, rx: 0.006, rz: 0.005, z: 0.083 },
    { y: 0.09, rx: 0.0075, rz: 0.007, z: 0.088 },
    { y: 0.074, rx: 0.009, rz: 0.009, z: 0.093 },
    { y: 0.062, rx: 0.012, rz: 0.011, z: 0.097 },
    { y: 0.055, rx: 0.012, rz: 0.009, z: 0.096 },
    { y: 0.051, rx: 0.007, rz: 0.005, z: 0.09 },
  ], 18), () => skin(0.5)), null, 'skin']);
  for (const s of [-1, 1]) {
    parts.push([at(ellipsoid(0.008, 0.0065, 0.008, 10, 8), s * 0.0115, 0.056, 0.089), skin(0.4).getStyle(), 'skin']);
    parts.push([at(ellipsoid(0.003, 0.0018, 0.003, 6, 4), s * 0.006, 0.0505, 0.094), '#1d120c', 'skin']);
    // Eyes: white sclera, dark iris, an upper lid and a brow.
    const ex = s * 0.0285;
    const ey = 0.1;
    parts.push([at(new THREE.SphereGeometry(0.0108, 18, 14), ex, ey, 0.072), '#d9d0c0', 'eye']);
    parts.push([at(new THREE.SphereGeometry(0.0058, 14, 10), ex, ey, 0.079), '#1f140e', 'eye']);
    const lid = new THREE.SphereGeometry(0.0118, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
    lid.rotateX(0.55).translate(ex, ey + 0.0005, 0.0718);
    parts.push([lid, skin(0, 0.25).getStyle(), 'skin']);
    parts.push([at(ellipsoid(0.017, 0.0035, 0.006, 12, 6).rotateZ(-s * 0.12), s * 0.03, 0.1175, 0.0835), HAIR, 'hair']);
    // Ears: outer rim and a darker hollow.
    const ear = ellipsoid(0.008, 0.026, 0.017, 12, 10);
    ear.rotateY(s * 0.35).translate(s * 0.078, 0.092, -0.006);
    parts.push([ear, skin(0.2).getStyle(), 'skin']);
    parts.push([at(ellipsoid(0.004, 0.015, 0.009, 8, 6).rotateY(s * 0.35), s * 0.083, 0.09, -0.003), skin(0, 0.6).getStyle(), 'skin']);
  }
  // Lips.
  parts.push([at(ellipsoid(0.019, 0.0045, 0.007, 16, 8), 0, 0.0275, 0.0835), LIP.getStyle(), 'skin']);
  parts.push([at(ellipsoid(0.017, 0.005, 0.0075, 16, 8), 0, 0.0195, 0.082), LIP.clone().lerp(SKIN, 0.3).getStyle(), 'skin']);
  // Thick, greying moustache drooping at the corners.
  parts.push([at(ellipsoid(0.026, 0.0065, 0.009, 16, 8).rotateX(0.25), 0, 0.0355, 0.0875), HAIR, 'hair']);
  for (const s of [-1, 1]) parts.push([at(ellipsoid(0.008, 0.009, 0.007, 10, 8), s * 0.023, 0.03, 0.083), GREY_HAIR, 'hair']);
  // Short grey-black hair showing below the head towel at the back and sides.
  const hair = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hair.scale(0.083, 0.117, 0.099).rotateX(-0.45).translate(0, 0.095, -0.006);
  // Greying at the temples only.
  parts.push([paint(hair, (x, y) => tmp.set(HAIR).lerp(new THREE.Color(GREY_HAIR), Math.min(0.45, smooth01((0.12 - y) / 0.05) * 0.3 * smooth01(Math.abs(x) / 0.07)))), null, 'hair']);
  // Head towel (thalapa): a rolled band with twists, a cloth crown and a knot with a short tail.
  const band = new THREE.TorusGeometry(0.092, 0.02, 14, 64);
  band.rotateX(Math.PI / 2);
  const bp = band.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const z = bp.getZ(i);
    const u = Math.atan2(z, x);
    const ring = Math.hypot(x, z);
    const off = ring - 0.094;
    const twist = 1 + 0.1 * Math.sin(u * 9 + bp.getY(i) * 50);
    const k = (0.094 + off * twist) / ring;
    bp.setXYZ(i, x * k, bp.getY(i) * twist, z * k);
  }
  band.computeVertexNormals();
  band.scale(0.98, 1, 1.1).translate(0, 0.17, -0.004);
  parts.push([band, TOWEL, 'cloth']);
  parts.push([at(ellipsoid(0.08, 0.028, 0.092, 18, 10), 0, 0.19, -0.006), '#ebe6d9', 'cloth']);
  parts.push([at(ellipsoid(0.026, 0.022, 0.022, 10, 8), 0.05, 0.175, 0.078), '#e8e3d5', 'cloth']);
  const tail = loft([
    { y: 0.17, rx: 0.016, rz: 0.006 },
    { y: 0.13, rx: 0.018, rz: 0.005, x: 0.006 },
    { y: 0.1, rx: 0.017, rz: 0.004, x: 0.01 },
  ], 12);
  tail.rotateY(-0.5).translate(0.06, 0, 0.082);
  parts.push([tail, '#ece7da', 'cloth']);
  return buildColored(parts, 'skin');
}

// ------------------------------------------------------------------ body

/** Chest, ribcage and shoulders with a pectoral swell, shoulder blades and a spine groove. */
function torsoRings(grow = 0): LoftRing[] {
  return [
    { y: -0.02, rx: 0.15 + grow, rz: 0.105 + grow },
    { y: 0.06, rx: 0.142 + grow, rz: 0.098 + grow, z: 0.004 },
    { y: 0.14, rx: 0.145 + grow, rz: 0.1 + grow, z: 0.008 },
    { y: 0.24, rx: 0.152 + grow, rz: 0.102 + grow, z: 0.006 },
    { y: 0.32, rx: 0.162 + grow, rz: 0.106 + grow, z: 0.006 },
    { y: 0.39, rx: 0.172 + grow, rz: 0.108 + grow, z: 0.008 },
    { y: 0.44, rx: 0.186 + grow, rz: 0.1 + grow, z: 0.004 },
    { y: 0.48, rx: 0.188 + grow, rz: 0.09 + grow },
    { y: 0.51, rx: 0.16 + grow, rz: 0.078 + grow, z: -0.006 },
    { y: 0.535, rx: 0.1, rz: 0.066, z: -0.004 },
    { y: 0.555, rx: 0.058, rz: 0.056 },
    { y: 0.6, rx: 0.052, rz: 0.054, z: 0.006 },
    { y: 0.66, rx: 0.05, rz: 0.052, z: 0.012 },
  ];
}

function torsoShape(th: number, y: number): number {
  const front = Math.max(0, Math.sin(th));
  const back = Math.max(0, -Math.sin(th));
  const side = Math.abs(Math.cos(th));
  let k = 1;
  // Pectorals and the lower edge of the ribcage.
  k += 0.05 * gauss(y - 0.37, 0.06) * front * (1 - gauss(Math.cos(th), 0.15) * 0.7);
  k -= 0.025 * gauss(y - 0.27, 0.03) * front;
  // Shoulder blades and the spine groove.
  k += 0.04 * gauss(y - 0.4, 0.08) * back * gauss(Math.abs(Math.cos(th)) - 0.45, 0.25);
  k -= 0.04 * back * gauss(Math.cos(th), 0.1) * (y < 0.5 ? 1 : 0);
  // Lean waist from the side.
  k -= 0.03 * gauss(y - 0.1, 0.08) * side;
  return k;
}

function torsoGeometry(look: FarmerLook): THREE.BufferGeometry {
  const parts: ColoredPart[] = [];
  const body = loft(torsoRings(), 40, torsoShape);
  // Collarbones and the hollow of the throat, painted.
  paint(body, (x, y, z) => {
    tmp.copy(skin(0.3 * gauss(y - 0.45, 0.05) * (z > 0 ? 1 : 0), 0.35 * gauss(y - 0.27, 0.025) * (z > 0 ? 1 : 0)));
    if (y > 0.52 && z > 0) tmp.lerp(SKIN_SHADE, 0.3 * gauss(x, 0.02));
    return tmp;
  });
  parts.push([body, null, 'skin']);
  if (look.shirt) {
    // Half-sleeve cotton shirt with loose folds, a collar and a button placket.
    const folds = (th: number, y: number) => torsoShape(th, y) * (1 + 0.012 * Math.sin(th * 13 + y * 25));
    // Follows the shoulder slope up to the collar, so the shoulders are rounded, not cut square.
    const shirt = loft(torsoRings(0.012).slice(0, 10), 40, folds, { top: true, bottom: true });
    parts.push([shirt, look.shirt, 'cloth']);
    parts.push([at(new THREE.TorusGeometry(0.06, 0.012, 8, 28).rotateX(Math.PI / 2 - 0.25), 0, 0.548, 0.004), look.shirt, 'cloth']);
    parts.push([at(new THREE.BoxGeometry(0.02, 0.48, 0.006), 0, 0.27, 0.115), new THREE.Color(look.shirt).multiplyScalar(0.92).getStyle(), 'cloth']);
    for (let i = 0; i < 4; i++) parts.push([at(new THREE.SphereGeometry(0.006, 8, 6), 0, 0.45 - i * 0.11, 0.119), '#e9e4d6', 'horn']);
  }
  // Towel (thundu) over the left shoulder: a draped strip with a woven border and fringed ends.
  parts.push([draped(), null, 'cloth']);
  return shadeY(buildColored(parts, 'skin'), -0.05, 0.6, 0.18);
}

/** A cloth strip lying over the left shoulder, hanging down front and back. */
function draped(): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.1, 0.12, 0.13),
    new THREE.Vector3(-0.11, 0.3, 0.125),
    new THREE.Vector3(-0.12, 0.44, 0.105),
    new THREE.Vector3(-0.13, 0.535, 0.045),
    new THREE.Vector3(-0.13, 0.54, -0.035),
    new THREE.Vector3(-0.12, 0.45, -0.1),
    new THREE.Vector3(-0.11, 0.3, -0.118),
    new THREE.Vector3(-0.1, 0.16, -0.122),
  ]);
  const segs = 60;
  const across = 6;
  const width = 0.085;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const white = new THREE.Color(TOWEL);
  const stripe = new THREE.Color('#9a3b2e');
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const out = new THREE.Vector3();
  const rand = mulberry32(17);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = path.getPointAt(t);
    path.getTangentAt(t, tan);
    // Width runs across the shoulder (roughly along x), lifted off the body along the outward normal.
    side.set(1, 0, 0).sub(tan.clone().multiplyScalar(tan.x)).normalize();
    out.crossVectors(tan, side).normalize();
    const ripple = Math.sin(t * 40) * 0.004;
    for (let j = 0; j <= across; j++) {
      const v = j / across - 0.5;
      const q = p.clone().addScaledVector(side, v * width * (1 + 0.15 * Math.sin(t * 9))).addScaledVector(out, ripple * (1 - Math.abs(v)));
      pos.push(q.x, q.y, q.z);
      // Two thin coloured stripes near each end of the towel.
      const end = Math.min(t, 1 - t);
      const c = Math.abs(end - 0.06) < 0.012 || Math.abs(end - 0.085) < 0.006 ? stripe : white;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j;
      const b = a + 1;
      const c = a + across + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Fringe: loose threads at both ends.
  const fringe: THREE.BufferGeometry[] = [];
  for (const t of [0, 1]) {
    const p = path.getPointAt(t);
    for (let k = 0; k < 14; k++) {
      const l = 0.025 + rand() * 0.015;
      const f = new THREE.CylinderGeometry(0.0012, 0.0008, l, 3);
      f.translate(-0.042 + k * (0.085 / 13) + p.x, p.y - l / 2, p.z);
      fringe.push(paint(f, (_x, _y, _z, o) => o.copy(white)));
    }
  }
  const parts: ColoredPart[] = [[g, null, 'cloth'], ...fringe.map((f) => [f, null, 'cloth'] as ColoredPart)];
  return buildColored(parts, 'cloth');
}

/** Knee-length white veshti: wrapped at the waist with a rolled tuck, vertical drape folds, a hem border. */
function veshtiGeometry(look: FarmerLook): THREE.BufferGeometry {
  const folds = (th: number, y: number) => {
    const depth = smooth01((0.05 - y) / 0.25);
    return 1 + depth * (0.03 * Math.sin(th * 9 + y * 4) + 0.015 * Math.sin(th * 23 + 1.3)) + 0.04 * gauss(Math.sin(th) - 1, 0.4) * depth;
  };
  const cloth = loft([
    { y: 0.12, rx: 0.165, rz: 0.118 },
    { y: 0.06, rx: 0.176, rz: 0.124, z: 0.004 },
    { y: -0.04, rx: 0.195, rz: 0.136, z: 0.006 },
    { y: -0.12, rx: 0.205, rz: 0.142, z: 0.006 },
    { y: -0.2, rx: 0.21, rz: 0.146, z: 0.008 },
    { y: -0.215, rx: 0.207, rz: 0.144, z: 0.008 },
  ], 56, folds, { bottom: true });
  const parts: ColoredPart[] = [[cloth, look.veshti, 'cloth']];
  // Hem border (a thin coloured band, as on a real veshti) and the rolled tuck at the waist.
  parts.push([loft([
    { y: -0.18, rx: 0.2115, rz: 0.1475, z: 0.008 },
    { y: -0.205, rx: 0.2125, rz: 0.1485, z: 0.008 },
  ], 56, folds, { top: true, bottom: true }), '#b9a77f', 'cloth']);
  const roll = new THREE.TorusGeometry(0.17, 0.016, 10, 56).rotateX(Math.PI / 2).scale(1, 1, 0.72);
  parts.push([at(roll, 0, 0.085, 0.003), '#e3dcc9', 'cloth']);
  // The front fold where the cloth overlaps and is tucked in.
  parts.push([at(new THREE.BoxGeometry(0.03, 0.27, 0.01, 1, 8, 1), 0.03, -0.075, 0.15), '#e6e0cf', 'cloth']);
  return shadeY(buildColored(parts, 'cloth'), -0.3, 0.12, 0.25);
}

function upperArmGeometry(look: FarmerLook): THREE.BufferGeometry {
  const muscle = (th: number, y: number) =>
    1 + 0.08 * gauss(y + 0.15, 0.06) * Math.max(0, Math.sin(th)) + 0.05 * gauss(y + 0.05, 0.05) * Math.max(0, Math.cos(th));
  const arm = loft([
    { y: 0.02, rx: 0.044, rz: 0.05 },
    { y: -0.03, rx: 0.052, rz: 0.055 },
    { y: -0.1, rx: 0.047, rz: 0.05 },
    { y: -0.16, rx: 0.042, rz: 0.046, z: 0.003 },
    { y: -0.23, rx: 0.036, rz: 0.038 },
    { y: -0.28, rx: 0.034, rz: 0.035 },
    { y: -0.3, rx: 0.03, rz: 0.03 },
  ], 24, muscle);
  const parts: ColoredPart[] = [[paint(arm, () => tmp.copy(skin())), null, 'skin']];
  if (look.shirt) {
    parts.push([loft([
      // Starts inside the shoulder and swells over the deltoid, so the sleeve is set in, not boxed on.
      { y: 0.05, rx: 0.02, rz: 0.03, x: -0.02 },
      { y: 0.03, rx: 0.045, rz: 0.054, x: -0.006 },
      { y: -0.02, rx: 0.056, rz: 0.06 },
      { y: -0.08, rx: 0.052, rz: 0.056 },
      { y: -0.14, rx: 0.049, rz: 0.053 },
    ], 24, (th, y) => 1 + 0.025 * Math.sin(th * 7 + y * 30), { bottom: true }), look.shirt, 'cloth']);
    // Rounded cap over the shoulder joint, blending the sleeve into the shirt's shoulder seam.
    parts.push([at(ellipsoid(0.058, 0.048, 0.062, 16, 12), -0.008, 0.012, 0), look.shirt, 'cloth']);
  }
  return buildColored(parts, 'skin');
}

/** Forearm, wrist and a relaxed hand: palm, knuckles, four slightly curled fingers and a thumb. */
function foreArmGeometry(): THREE.BufferGeometry {
  const arm = loft([
    { y: 0.01, rx: 0.033, rz: 0.035 },
    { y: -0.05, rx: 0.039, rz: 0.037 },
    { y: -0.12, rx: 0.033, rz: 0.03 },
    { y: -0.2, rx: 0.025, rz: 0.021 },
    { y: -0.245, rx: 0.019, rz: 0.024 },
    { y: -0.26, rx: 0.017, rz: 0.026 },
  ], 24, (th, y) => 1 + 0.06 * gauss(y + 0.06, 0.05) * Math.max(0, Math.cos(th)));
  const parts: ColoredPart[] = [[paint(arm, (_x, y) => tmp.copy(skin(0, 0.15 * gauss(y + 0.25, 0.02)))), null, 'skin']];
  // Palm: thin across x (it faces the thigh), broad along z.
  parts.push([paint(loft([
    { y: -0.255, rx: 0.016, rz: 0.026 },
    { y: -0.28, rx: 0.017, rz: 0.036 },
    { y: -0.31, rx: 0.016, rz: 0.039 },
    { y: -0.335, rx: 0.014, rz: 0.038 },
  ], 20), (x) => tmp.copy(skin(0.3)).lerp(PALM_COLOR, x < -0.004 ? 0.6 : 0)), null, 'skin']);
  const fingerZ = [0.026, 0.009, -0.008, -0.024];
  const fingerL = [0.026, 0.03, 0.028, 0.022];
  // Built as a right hand (palm toward -x); Farmer.tsx mirrors it for the left.
  fingerZ.forEach((z, i) => {
    let px = 0;
    let py = -0.335;
    let ang = 0;
    const len = fingerL[i]!;
    for (const [frac, r] of [[0.45, 0.0078], [0.32, 0.0068], [0.23, 0.006]] as const) {
      const l = len * frac * 2.2;
      // Each joint bends a little more toward the palm: a relaxed, slightly curled hand.
      ang += 0.24;
      const seg = new THREE.CapsuleGeometry(r, l, 4, 10);
      seg.translate(0, -l / 2, 0).rotateZ(-ang).translate(px, py, z);
      parts.push([seg, skin(0.25).getStyle(), 'skin']);
      px -= Math.sin(ang) * l;
      py -= Math.cos(ang) * l;
    }
  });
  const thumb = new THREE.CapsuleGeometry(0.0085, 0.038, 4, 10);
  thumb.translate(0, -0.019, 0).rotateX(-0.6).rotateZ(0.35).translate(-0.004, -0.275, 0.034);
  parts.push([thumb, skin(0.25).getStyle(), 'skin']);
  return buildColored(parts, 'skin');
}

/**
 * The veshti is folded up for field work (madichu kattu): below the waist wrap, the cloth around each
 * thigh is part of the thigh, so it swings with the leg instead of the leg pushing through it.
 */
function thighGeometry(look: FarmerLook): THREE.BufferGeometry {
  const folds = (th: number, y: number) => 1 + 0.05 * Math.sin(th * 7 + y * 20) * smooth01(-y / 0.25) + 0.03 * Math.sin(th * 15);
  const drape = loft([
    { y: 0.06, rx: 0.1, rz: 0.104 },
    { y: -0.1, rx: 0.106, rz: 0.11, z: 0.006 },
    { y: -0.22, rx: 0.1, rz: 0.104, z: 0.01 },
    { y: -0.29, rx: 0.094, rz: 0.098, z: 0.012 },
    { y: -0.3, rx: 0.088, rz: 0.092, z: 0.012 },
  ], 36, folds, { bottom: true });
  const hem = loft([
    { y: -0.265, rx: 0.0985, rz: 0.1025, z: 0.012 },
    { y: -0.288, rx: 0.0955, rz: 0.0995, z: 0.012 },
  ], 36, folds, { top: true, bottom: true });
  return buildColored([
    [shadeY(paint(drape, () => tmp.set(look.veshti)), -0.3, 0.06, 0.22), null, 'cloth'],
    [hem, '#b9a77f', 'cloth'],
    [thighSkin(), null, 'skin'],
  ], 'skin');
}

function thighSkin(): THREE.BufferGeometry {
  return paint(loft([
    { y: 0.03, rx: 0.08, rz: 0.084 },
    { y: -0.06, rx: 0.084, rz: 0.088, z: 0.004 },
    { y: -0.18, rx: 0.074, rz: 0.075, z: 0.006 },
    { y: -0.3, rx: 0.062, rz: 0.06, z: 0.004 },
    { y: -0.39, rx: 0.051, rz: 0.05 },
    { y: -0.44, rx: 0.049, rz: 0.052, z: 0.004 },
    { y: -0.46, rx: 0.045, rz: 0.046 },
  ], 28, (th, y) => 1 + 0.06 * gauss(y + 0.3, 0.08) * Math.max(0, Math.sin(th)) * gauss(Math.cos(th) - 0.3, 0.5)), (_x, y, z) =>
    tmp.copy(skin(0.35 * gauss(y + 0.42, 0.025) * (z > 0 ? 1 : 0))));
}

/** Shin with a calf muscle behind, a bony ankle, and a bare foot with toes. */
function shinGeometry(): THREE.BufferGeometry {
  const parts: ColoredPart[] = [];
  const leg = loft([
    { y: 0.02, rx: 0.047, rz: 0.05 },
    { y: -0.05, rx: 0.045, rz: 0.049 },
    { y: -0.11, rx: 0.048, rz: 0.054, z: -0.01 },
    { y: -0.17, rx: 0.046, rz: 0.05, z: -0.009 },
    { y: -0.26, rx: 0.035, rz: 0.035, z: -0.004 },
    { y: -0.34, rx: 0.026, rz: 0.027 },
    { y: -0.385, rx: 0.025, rz: 0.03, z: 0.002 },
    { y: -0.41, rx: 0.028, rz: 0.034, z: 0.004 },
  ], 28, (th, y) => 1 + 0.08 * gauss(y + 0.38, 0.02) * gauss(Math.abs(Math.cos(th)) - 1, 0.25));
  parts.push([paint(leg, (_x, y, z) => tmp.copy(skin(0.3 * gauss(y + 0.03, 0.03) * (z > 0 ? 1 : 0), 0.15 * gauss(y + 0.39, 0.02)))), null, 'skin']);
  // Foot: lofted along z from heel to the ball, then toes.
  const foot = loft([
    { y: -0.045, rx: 0.026, rz: 0.022, z: 0.428 },
    { y: -0.02, rx: 0.031, rz: 0.03, z: 0.425 },
    { y: 0.02, rx: 0.034, rz: 0.03, z: 0.43 },
    { y: 0.06, rx: 0.039, rz: 0.022, z: 0.438 },
    { y: 0.1, rx: 0.042, rz: 0.015, z: 0.445 },
    { y: 0.115, rx: 0.04, rz: 0.012, z: 0.447 },
  ], 24);
  foot.rotateX(Math.PI / 2);
  parts.push([paint(foot, (_x, y) => tmp.copy(skin(0, 0.25 * smooth01((-0.44 - y) / 0.015)))), null, 'skin']);
  const toes: Array<[number, number, number]> = [[0.026, 0.0085, 0.13], [0.012, 0.007, 0.128], [-0.001, 0.0065, 0.124], [-0.013, 0.006, 0.118], [-0.024, 0.0055, 0.11]];
  for (const [x, r, z] of toes) parts.push([at(new THREE.CapsuleGeometry(r, 0.012, 4, 8).rotateX(Math.PI / 2), x, -0.443, z), skin(0.2).getStyle(), 'skin']);
  return buildColored(parts, 'skin');
}

export function farmerGeometry(look: FarmerLook) {
  return {
    veshti: veshtiGeometry(look),
    torso: torsoGeometry(look),
    head: headGeometry(),
    upperArm: upperArmGeometry(look),
    foreArm: foreArmGeometry(),
    thigh: thighGeometry(look),
    shin: shinGeometry(),
  };
}
