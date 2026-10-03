import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hash01 } from '../../prng';
import { sceneTime, useSceneSettings } from '../../quality';
import { useField } from '../FieldContext';
import { BUND_H } from '../Ground';
import { at, buildColored, ellipsoid, limb, shadeY } from './geo';
import { buildPathRing, farmerPoseAt, nearestArc, planFarmer } from './farmerPath';

const SKIN = '#5b3a27';
const SKIN_DARK = '#4a2e1f';
const VESHTI = '#eee8d6';
const TOWEL = '#f4f1e8';
const HAIR = '#1c1512';

interface Look {
  shirt: string | null;
  veshti: string;
  checked: boolean;
}

/** Per-farmer look: bare-chested with a towel, or a light half-sleeve shirt; white veshti or a checked lungi. */
function lookFor(seed: number): Look {
  const r = hash01(seed * 7.13);
  const shirts = ['#d9d4c3', '#8fb2c9', '#c9b27a'];
  return {
    shirt: r < 0.55 ? shirts[Math.floor(hash01(seed * 3.1) * shirts.length)]! : null,
    veshti: hash01(seed * 5.7) < 0.4 ? '#e2d9bf' : VESHTI,
    checked: false,
  };
}

function useFarmerGeometry(look: Look) {
  return useMemo(() => {
    const torsoColor = look.shirt ?? SKIN;
    // Pelvis + folded veshti (knee length, tucked up for field work) with a belt fold at the waist.
    const veshti = shadeY(buildColored([
      [at(new THREE.CylinderGeometry(0.19, 0.235, 0.46, 14, 1, true), 0, -0.15, 0), look.veshti],
      [at(new THREE.CylinderGeometry(0.236, 0.236, 0.03, 14, 1, true), 0, -0.395, 0), '#b9a77f'], // hem border
      [at(new THREE.CylinderGeometry(0.205, 0.205, 0.06, 14), 0, 0.1, 0), '#d8d0b8'],
      [at(new THREE.TorusGeometry(0.2, 0.022, 6, 14).rotateX(Math.PI / 2), 0, 0.07, 0), '#bba98a'],
    ]), -0.5, 0.12, 0.3);

    const torso = shadeY(buildColored([
      [at(ellipsoid(0.165, 0.27, 0.1, 12, 9), 0, 0.27, 0), torsoColor],
      [at(ellipsoid(0.2, 0.09, 0.105, 12, 8), 0, 0.46, 0), torsoColor],
      [at(limb(0.05, 0.06, 0.1, 8).rotateX(0), 0, 0.56, 0), SKIN], // neck
      // Towel (thundu) draped over the left shoulder.
      [at(new THREE.BoxGeometry(0.1, 0.46, 0.012).rotateZ(-0.12), -0.13, 0.33, 0.1), TOWEL],
      [at(new THREE.BoxGeometry(0.11, 0.07, 0.2), -0.2, 0.5, 0), TOWEL],
      [at(new THREE.BoxGeometry(0.1, 0.4, 0.012).rotateZ(-0.12), -0.15, 0.33, -0.1), '#e8e4d6'],
    ]), -0.05, 0.6, 0.25);

    const head = buildColored([
      [at(ellipsoid(0.088, 0.112, 0.098, 12, 10), 0, 0.09, 0), SKIN],
      [at(ellipsoid(0.02, 0.026, 0.026, 6, 5), 0, 0.075, 0.1), SKIN_DARK], // nose
      [at(ellipsoid(0.03, 0.01, 0.012, 6, 4), 0, 0.045, 0.092), HAIR], // moustache
      [at(ellipsoid(0.014, 0.008, 0.01, 5, 4), -0.034, 0.105, 0.088), '#16100c'],
      [at(ellipsoid(0.014, 0.008, 0.01, 5, 4), 0.034, 0.105, 0.088), '#16100c'],
      [at(ellipsoid(0.014, 0.03, 0.018, 5, 5), -0.088, 0.09, 0), SKIN_DARK], // ears
      [at(ellipsoid(0.014, 0.03, 0.018, 5, 5), 0.088, 0.09, 0), SKIN_DARK],
      // Head towel (thalapa): a wrapped band with a knot at the front.
      [at(new THREE.TorusGeometry(0.093, 0.032, 7, 16).rotateX(Math.PI / 2), 0, 0.178, 0), TOWEL],
      [at(ellipsoid(0.095, 0.045, 0.1, 10, 6), 0, 0.2, -0.005), TOWEL],
      [at(ellipsoid(0.03, 0.026, 0.026, 6, 5), 0.03, 0.18, 0.1), '#e6e1d2'],
    ]);

    const upperArm = buildColored([[limb(0.043, 0.036, 0.29, 7), look.shirt ?? SKIN]]);
    const foreArm = buildColored([
      [limb(0.034, 0.027, 0.26, 7), SKIN],
      [at(ellipsoid(0.03, 0.045, 0.02, 6, 5), 0, -0.29, 0), SKIN_DARK], // hand
    ]);
    const thigh = buildColored([[limb(0.075, 0.055, 0.44, 8), SKIN]]);
    const shin = buildColored([
      [limb(0.052, 0.036, 0.43, 8), SKIN],
      [at(ellipsoid(0.04, 0.025, 0.1, 7, 5), 0, -0.45, 0.04), SKIN_DARK], // foot
    ]);
    // Mamatti (spade): origin at the blade tip, handle along +y with a D-grip.
    const mk = () => buildColored([
      [at(new THREE.BoxGeometry(0.2, 0.26, 0.012), 0, 0.13, 0), '#8c8f93'],
      [at(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 6), 0, 0.72, 0), '#7a5a3a'],
      [at(new THREE.TorusGeometry(0.05, 0.011, 5, 10), 0, 1.2, 0), '#7a5a3a'],
    ]);
    const spade = mk();
    const spadeStuck = mk();
    return { veshti, torso, head, upperArm, foreArm, thigh, shin, spade, spadeStuck };
  }, [look]);
}

/** A slim Tamil Nadu farmer (about 1.7 m) who strolls the bund, looks over the field and crouches to inspect the crop. */
export function Farmer({ seed, activity, viewFrom }: { seed: number; activity: number; viewFrom?: [number, number] }) {
  const { shape } = useField();
  const { reducedMotion } = useSceneSettings();
  const look = useMemo(() => lookFor(seed), [seed]);
  const geos = useFarmerGeometry(look);
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }),
  }), []);
  useEffect(() => () => {
    Object.values(geos).forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => m.dispose());
  }, [geos, mats]);

  const path = useMemo(() => buildPathRing(shape), [shape]);
  // First appearance a few metres along the bund from where the viewer is standing.
  const startS = useMemo(() => (viewFrom ? nearestArc(path, viewFrom[0], viewFrom[1]) + 5 : undefined), [path, viewFrom]);
  const plan = useMemo(() => planFarmer(seed, path.length, startS), [seed, path, startS]);

  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const thighL = useRef<THREE.Group>(null);
  const shinL = useRef<THREE.Group>(null);
  const thighR = useRef<THREE.Group>(null);
  const shinR = useRef<THREE.Group>(null);
  const spade = useRef<THREE.Group>(null);
  const spadeStuck = useRef<THREE.Group>(null);
  const carries = plan.carriesSpade;
  const camera = useThree((st) => st.camera);
  const controls = useThree((st) => st.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  // Dev-only: __bhoomiFrameFarmer(dist, height, azimuthDeg) puts the camera on the farmer; __bhoomiFarmerT pins time.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bhoomiFrameFarmer = (dist = 3.5, height = 1.3, az = 0) => {
      const r = root.current;
      if (!r || !controls) return;
      const a = r.rotation.y + (az * Math.PI) / 180;
      camera.position.set(r.position.x + Math.sin(a) * dist, r.position.y + height, r.position.z + Math.cos(a) * dist);
      controls.target.set(r.position.x, r.position.y + 0.9, r.position.z);
      controls.update();
    };
    return () => { delete w.__bhoomiFrameFarmer; };
  }, [camera, controls]);

  useFrame(({ clock }) => {
    const r = root.current;
    if (!r) return;
    const pinned = import.meta.env.DEV ? (window as unknown as { __bhoomiFarmerT?: number }).__bhoomiFarmerT : undefined;
    const t = typeof pinned === 'number' ? pinned : sceneTime(clock.elapsedTime, reducedMotion) + 3;
    // Reduced motion: hold the first idle pose (a stop, standing, looking at the field).
    const stillT = plan.segments[1] ? plan.segments[1].t0 + 1.2 : 0;
    const p = farmerPoseAt(plan, path, reducedMotion ? stillT : t);
    const w = p.walk;
    const g = p.gait;
    const c = p.crouch;
    const lookAmt = p.action === 'look' ? p.faceField : 0;
    const tt = t;

    if (import.meta.env.DEV) (window as unknown as { __bhoomiFarmer?: unknown }).__bhoomiFarmer = { ...p, t, plan };
    r.position.set(p.x, BUND_H, p.z);
    r.rotation.y = p.yaw;

    const sg = Math.sin(g);
    const cg = Math.cos(g);
    const sway = Math.sin(tt * 1.3) * 0.012 * (1 - w);
    if (hips.current) {
      hips.current.position.set(sway, 0.9 - 0.4 * c + Math.abs(sg) * 0.022 * w, -0.2 * c);
      hips.current.rotation.y = sg * 0.1 * w;
    }
    if (torso.current) {
      torso.current.rotation.x = 0.07 * w + 0.58 * c + Math.sin(tt * 0.9) * 0.01;
      torso.current.rotation.y = -sg * 0.12 * w + lookAmt * Math.sin(tt * 0.45) * 0.25;
      torso.current.rotation.z = sway * 2;
    }
    if (head.current) {
      head.current.rotation.x = 0.05 - 0.3 * c - lookAmt * 0.08;
      head.current.rotation.y = lookAmt * Math.sin(tt * 0.5 + 1) * 0.5 + (p.action === 'inspect' ? Math.sin(tt * 0.7) * 0.12 : 0);
    }
    // Legs: negative rotation.x swings the foot forward (+z).
    if (thighL.current) thighL.current.rotation.x = -sg * 0.52 * w - 1.3 * c;
    if (thighR.current) thighR.current.rotation.x = sg * 0.52 * w - 1.3 * c;
    if (shinL.current) shinL.current.rotation.x = (0.12 + 0.62 * Math.max(0, cg)) * w + 1.85 * c;
    if (shinR.current) shinR.current.rotation.x = (0.12 + 0.62 * Math.max(0, -cg)) * w + 1.85 * c;

    // Arms: opposite swing to the legs, elbows soft; spade carried on the right shoulder when walking.
    const carry = carries ? 1 - c : 0;
    if (armL.current) {
      armL.current.rotation.x = sg * 0.42 * w - 0.75 * c;
      armL.current.rotation.z = -0.06 - 0.4 * lookAmt;
    }
    if (foreL.current) foreL.current.rotation.x = -0.25 - 0.3 * w - 0.9 * c - 1.7 * lookAmt;
    if (armR.current) {
      const swing = -sg * 0.42 * w * (1 - carry);
      armR.current.rotation.x = swing - 0.7 * carry * (1 - lookAmt) - 1.0 * c - 1.95 * lookAmt * (1 - carry) - 0.5 * carry * lookAmt;
      armR.current.rotation.z = 0.06 + 0.1 * lookAmt;
    }
    if (foreR.current) {
      foreR.current.rotation.x = -0.25 - 0.3 * w * (1 - carry) - 1.1 * carry - 0.55 * c - 1.7 * lookAmt * (1 - carry);
    }
    // Carried on the right shoulder (child of the torso, so it sways with him) or planted blade-down beside him.
    const planted = carries && (c > 0.5 || lookAmt > 0.5);
    if (spade.current) {
      spade.current.visible = carries && !planted;
      spade.current.position.set(0.2, 0.12, -0.5);
      spade.current.rotation.set(1.16, 0, -0.04);
    }
    if (spadeStuck.current) {
      spadeStuck.current.visible = planted;
      spadeStuck.current.position.set(0.34, 0, 0.12);
      spadeStuck.current.rotation.set(0.08, 0, -0.04);
    }
  });

  if (activity < 0.12) return null;
  return (
    <group ref={root} scale={1}>
      <group ref={hips} position={[0, 0.9, 0]}>
        <mesh geometry={geos.veshti} material={mats.cloth} castShadow />
        <group ref={thighL} position={[-0.09, -0.02, 0]}>
          <mesh geometry={geos.thigh} material={mats.body} castShadow />
          <group ref={shinL} position={[0, -0.43, 0]}>
            <mesh geometry={geos.shin} material={mats.body} castShadow />
          </group>
        </group>
        <group ref={thighR} position={[0.09, -0.02, 0]}>
          <mesh geometry={geos.thigh} material={mats.body} castShadow />
          <group ref={shinR} position={[0, -0.43, 0]}>
            <mesh geometry={geos.shin} material={mats.body} castShadow />
          </group>
        </group>
        <group ref={torso} position={[0, 0.08, 0]}>
          <mesh geometry={geos.torso} material={mats.cloth} castShadow />
          <group ref={spade}>
            <mesh geometry={geos.spade} material={mats.body} castShadow />
          </group>
          <group ref={head} position={[0, 0.6, 0]}>
            <mesh geometry={geos.head} material={mats.body} castShadow />
          </group>
          <group ref={armL} position={[-0.2, 0.47, 0]}>
            <mesh geometry={geos.upperArm} material={mats.body} castShadow />
            <group ref={foreL} position={[0, -0.28, 0]}>
              <mesh geometry={geos.foreArm} material={mats.body} castShadow />
            </group>
          </group>
          <group ref={armR} position={[0.2, 0.47, 0]}>
            <mesh geometry={geos.upperArm} material={mats.body} castShadow />
            <group ref={foreR} position={[0, -0.28, 0]}>
              <mesh geometry={geos.foreArm} material={mats.body} castShadow />
            </group>
          </group>
        </group>
      </group>
      <group ref={spadeStuck}>
        <mesh geometry={geos.spadeStuck} material={mats.body} castShadow />
      </group>
    </group>
  );
}
