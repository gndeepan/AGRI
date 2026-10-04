import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCropMaterials } from './crops/material';
import { buildPlant } from './crops/plants';
import { shedsLeaves } from './crops/cropGrowth';
import { MAX_TILLERS } from './growth';
import { plantFacts, type PlantFacts } from './plantFacts';
import { damp, sceneTime, usePrefersReducedMotion } from './quality';
import { createBladeMaterials, createPanicleMaterials, createWindUniforms, setSrgb, type WindUniforms } from './scene/plantMaterials';
import { createClumpGeometry, createPanicleGeometry } from './scene/riceGeometry';
import { createLeafTexture, createSoilTexture } from './scene/textures';
import type { FieldVisualState } from './types';
import { WebGLBoundary, watchContextLoss } from './WebGLBoundary';

export interface PlantViewProps {
  state: FieldVisualState;
  cropSlug?: string;
  className?: string;
  /** Accessible name of the canvas (the page passes a translated one). */
  label?: string;
}

/**
 * One plant of the farmer's crop at the current point of the season, close up, in soft daylight so it
 * is readable at any hour. The plant is the same model and shader as the field scene (rice hill or
 * the upland crop's plant), so the close-up always matches the field. Drag to turn, scroll to zoom.
 */
export default function PlantViewCanvas({ state, cropSlug, className, label }: PlantViewProps) {
  const facts = useMemo(() => plantFacts(state, cropSlug), [state, cropSlug]);
  const reducedMotion = usePrefersReducedMotion();
  const h = Math.max(0.08, facts.heightM);
  const rulerTop = Math.max(0.3, Math.ceil((h + 0.08) * 10) / 10);
  return (
    <div
      className={className}
      style={{
        position: 'relative', width: '100%', height: '100%', touchAction: 'pan-y',
        background: 'radial-gradient(ellipse at 50% 35%, #f3efe2 0%, #d9dccb 55%, #a9b39a 100%)',
      }}
    >
      <WebGLBoundary>
        <Canvas
          shadows="soft"
          dpr={[1, 2]}
          camera={{ fov: 32, near: 0.01, far: 100, position: [h * 1.6 + 0.5, h * 0.75 + 0.2, h * 2 + 0.6] }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            watchContextLoss(gl.domElement);
          }}
          aria-label={label}
        >
          <StudioLight />
          <Ground facts={facts} />
          {facts.present && (facts.kind === 'paddy' ? <PaddyPlant facts={facts} reducedMotion={reducedMotion} /> : <UplandPlant facts={facts} reducedMotion={reducedMotion} />)}
          <Ruler top={rulerTop} heightM={facts.present ? facts.heightM : 0} />
          <ContactShadows position={[0, 0.002, 0]} opacity={0.45} scale={Math.max(1.2, h * 1.6)} blur={2.4} far={Math.max(1, h * 1.2)} />
          <FitCamera heightM={h} />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            minDistance={0.15}
            maxDistance={Math.max(3, h * 6)}
            minPolarAngle={0.15}
            maxPolarAngle={1.62}
            autoRotate={!reducedMotion}
            autoRotateSpeed={0.6}
          />
        </Canvas>
      </WebGLBoundary>
    </div>
  );
}

/** Soft daylight: an image-based fill from a neutral room, a warm key sun with soft shadows, and sky/ground bounce. */
function StudioLight() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene]);
  return (
    <>
      <hemisphereLight args={['#dfeaff', '#7a6a4a', 0.7]} />
      <directionalLight
        position={[1.8, 3.2, 1.4]}
        intensity={2.4}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-1.6}
        shadow-camera-right={1.6}
        shadow-camera-top={3.6}
        shadow-camera-bottom={-0.4}
        shadow-camera-near={0.5}
        shadow-camera-far={8}
        shadow-bias={-0.0003}
        shadow-normalBias={0.01}
        shadow-radius={4}
      />
      {/* Rim light from behind: thin leaves glow at their edges, as in the field at golden hour. */}
      <directionalLight position={[-1.5, 1.2, -2.2]} intensity={0.9} color="#fff6e0" />
    </>
  );
}

/** Frames the plant when it is first shown and whenever it changes size a lot (not on every scrub step). */
function FitCamera({ heightM }: { heightM: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const bucket = Math.round(Math.log2(Math.max(heightM, 0.05)) * 2);
  const h = useRef(heightM);
  h.current = heightM;
  useEffect(() => {
    const hh = h.current;
    const dir = camera.position.clone().setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0.6, 0, 0.8);
    dir.normalize();
    // Pulled back far enough for the whole hill and the stick, and aimed a little above the plant's
    // middle so it sits in the lower part of the frame, clear of the page title over the scene.
    const dist = hh * 2.5 + 0.6;
    camera.position.set(dir.x * dist, hh * 0.9 + 0.2, dir.z * dist);
    if (controls) {
      controls.target.set(0, hh * 0.68 + 0.05, 0);
      controls.update();
    }
  }, [bucket, camera, controls]);
  return null;
}

/** A disc of soil (puddled mud with a film of water for paddy) that fades into the backdrop. */
function Ground({ facts }: { facts: PlantFacts }) {
  const paddy = facts.kind === 'paddy';
  const tex = useMemo(() => createSoilTexture(256, 41), []);
  const fade = useMemo(() => radialFade(), []);
  useEffect(() => () => { tex.map.dispose(); tex.normalMap.dispose(); fade?.dispose(); }, [tex, fade]);
  useEffect(() => {
    for (const t of [tex.map, tex.normalMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 3);
      t.needsUpdate = true;
    }
  }, [tex]);
  const wetness = paddy ? facts.growth.soilWetness : 0.25;
  const water = paddy && !facts.seedling ? facts.growth.waterLevel : paddy ? 0.6 : 0;
  const soilColor = paddy ? new THREE.Color().setRGB(0.5, 0.42, 0.33).multiplyScalar(1 - 0.35 * wetness)
    : facts.spec.soil === 'red' ? new THREE.Color('#b0745a') : facts.spec.soil === 'black' ? new THREE.Color('#5a5048') : new THREE.Color('#8f7457');
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[1.6, 64]} />
        <meshStandardMaterial
          map={tex.map}
          normalMap={tex.normalMap}
          normalScale={new THREE.Vector2(0.9, 0.9)}
          color={soilColor}
          roughness={THREE.MathUtils.lerp(0.95, 0.5, wetness)}
          alphaMap={fade}
          transparent
          depthWrite={false}
        />
      </mesh>
      {water > 0.1 && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.012 + water * 0.03}>
          <circleGeometry args={[1.5, 64]} />
          <meshPhysicalMaterial color="#4b4a36" roughness={0.04} metalness={0} transparent opacity={0.55} alphaMap={fade} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Radial alpha so the soil disc dissolves into the backdrop instead of ending at a hard edge. */
function radialFade(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.55, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** A bamboo measuring stick beside the plant, banded every 10 cm, with the plant's height marked (the number is in the page's panel). */
function Ruler({ top, heightM }: { top: number; heightM: number }) {
  const bands = Math.round(top * 10);
  const x = -Math.max(0.16, Math.min(0.6, heightM * 0.45 + 0.08));
  return (
    <group position={[x, 0, 0.05]}>
      {Array.from({ length: bands }, (_, i) => (
        <mesh key={i} position-y={i * 0.1 + 0.05} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.1, 10]} />
          <meshStandardMaterial color={i % 2 ? '#c9a86a' : '#efe2bd'} roughness={0.55} />
        </mesh>
      ))}
      {heightM > 0.02 && (
        <group position-y={heightM}>
          <mesh rotation-z={Math.PI / 2} position-x={Math.abs(x) * 0.5}>
            <cylinderGeometry args={[0.0018, 0.0018, Math.abs(x), 6]} />
            <meshBasicMaterial color="#2f5d2a" transparent opacity={0.7} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Gentle constant breeze so leaves move a little; still when the user prefers reduced motion. */
function useBreeze(wind: WindUniforms, reducedMotion: boolean) {
  useFrame(({ clock }) => {
    wind.uTime.value = sceneTime(clock.elapsedTime, reducedMotion);
    wind.uWind.value = reducedMotion ? 0 : 0.12;
  });
}

function singleInstance(geometry: THREE.BufferGeometry, material: THREE.Material, depth: THREE.Material): THREE.InstancedMesh {
  const geo = geometry.clone();
  // aRand: x height multiplier (1 = the model's plant), y colour jitter, z/w mid values (always visible).
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array([1, 0.5, 0.5, 0.5]), 4));
  const mesh = new THREE.InstancedMesh(geo, material, 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

const scratch = new THREE.Color();
const lerpSrgb = (target: THREE.Color, rgb: readonly [number, number, number], k: number) => {
  setSrgb(scratch, rgb);
  target.lerp(scratch, k);
};

/** One rice hill: every tiller, leaf and panicle, from the same shaders as the field. */
function PaddyPlant({ facts, reducedMotion }: { facts: Extract<PlantFacts, { kind: 'paddy' }>; reducedMotion: boolean }) {
  const wind = useMemo(() => createWindUniforms(), []);
  const leafTex = useMemo(() => createLeafTexture(), []);
  const blades = useMemo(() => createBladeMaterials(wind, leafTex), [wind, leafTex]);
  const panicles = useMemo(() => createPanicleMaterials(wind), [wind]);
  const meshes = useMemo(() => {
    const clump = createClumpGeometry({ blades: MAX_TILLERS, segments: 10, folded: true, seed: 7 });
    const pan = createPanicleGeometry({ panicles: 4, branches: 7, grainsPerBranch: 6, seed: 11 });
    const out = { blade: singleInstance(clump, blades.material, blades.depth), panicle: singleInstance(pan, panicles.material, panicles.depth) };
    clump.dispose();
    pan.dispose();
    return out;
  }, [blades, panicles]);
  useEffect(() => () => {
    meshes.blade.geometry.dispose();
    meshes.panicle.geometry.dispose();
    blades.material.dispose(); blades.depth.dispose(); panicles.material.dispose(); panicles.depth.dispose(); leafTex.dispose();
  }, [meshes, blades, panicles, leafTex]);
  useBreeze(wind, reducedMotion);

  const first = useRef(true);
  useFrame((_, dt) => {
    const g = facts.growth;
    const k = first.current || reducedMotion ? 1 : 1 - Math.exp(-6 * Math.min(dt, 0.1));
    first.current = false;
    const ease = (cur: number, target: number) => cur + (target - cur) * k;
    const b = blades.uniforms;
    b.uHeight.value = ease(b.uHeight.value, facts.heightM);
    b.uTillers.value = ease(b.uTillers.value, facts.tillers / MAX_TILLERS);
    b.uPresence.value = 1;
    b.uStubble.value = ease(b.uStubble.value, g.stubble);
    b.uSenescence.value = ease(b.uSenescence.value, g.senescence);
    b.uTranslucency.value = 0.4;
    lerpSrgb(b.uBaseColor.value, g.leafColor, k);
    lerpSrgb(b.uTipColor.value, g.leafTipColor, k);
    const p = panicles.uniforms;
    p.uHeight.value = b.uHeight.value;
    p.uPresence.value = 1;
    p.uEmerge.value = ease(p.uEmerge.value, facts.panicle);
    p.uDroop.value = ease(p.uDroop.value, g.panicleDroop);
    lerpSrgb(p.uPanicleColor.value, g.panicleColor, k);
    meshes.panicle.visible = p.uEmerge.value > 0.02;
  });
  return (
    <group>
      <primitive object={meshes.blade} />
      <primitive object={meshes.panicle} />
    </group>
  );
}

/** One plant of an upland crop (maize, groundnut, tomato, banana…) from the field's plant generator. */
function UplandPlant({ facts, reducedMotion }: { facts: Extract<PlantFacts, { kind: 'upland' }>; reducedMotion: boolean }) {
  const { spec, visual } = facts;
  const wind = useMemo(() => createWindUniforms(), []);
  const mats = useMemo(() => createCropMaterials(wind), [wind]);
  const mesh = useMemo(() => {
    const geo = buildPlant(spec, 'near', 1000);
    const m = singleInstance(geo, mats.material, mats.depth);
    geo.dispose();
    return m;
  }, [spec, mats]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  useEffect(() => () => { mats.material.dispose(); mats.depth.dispose(); }, [mats]);
  useEffect(() => {
    const u = mats.uniforms;
    u.uStiff.value = spec.stiffness;
    u.uShed.value = shedsLeaves(spec.profile) ? 1 : 0;
    u.uRipeSwell.value = spec.model === 'cotton' ? 0.55 : 0;
    setSrgb(u.uLeafDead.value, spec.colors.leafDead);
    setSrgb(u.uStemRipe.value, spec.colors.stemRipe);
  }, [mats, spec]);
  useBreeze(wind, reducedMotion);

  const first = useRef(true);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    const snap = first.current || reducedMotion;
    first.current = false;
    const ease = (cur: number, target: number) => (snap ? target : damp(cur, target, 6, step));
    const u = mats.uniforms;
    u.uScale.value = ease(u.uScale.value, visual.scale);
    u.uLeaves.value = ease(u.uLeaves.value, visual.leaves);
    u.uSen.value = ease(u.uSen.value, visual.senescence);
    u.uFlower.value = ease(u.uFlower.value, visual.flower);
    u.uFlowerDrop.value = ease(u.uFlowerDrop.value, visual.flowerDrop);
    u.uFruit.value = ease(u.uFruit.value, visual.fruit);
    u.uFruitSize.value = ease(u.uFruitSize.value, visual.fruitSize);
    u.uRipe.value = ease(u.uRipe.value, visual.ripe);
    u.uHead.value = ease(u.uHead.value, visual.head);
    u.uDroop.value = ease(u.uDroop.value, visual.droop);
    u.uPresence.value = 1;
    u.uTranslucency.value = 0.35;
    lerpSrgb(u.uLeafColor.value, visual.leafColor, snap ? 1 : 1 - Math.exp(-6 * step));
  });
  return <primitive object={mesh} />;
}
