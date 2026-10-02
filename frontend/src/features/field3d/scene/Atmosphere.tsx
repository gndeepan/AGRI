import { Environment, Lightformer, Sky, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hash01, mulberry32 } from '../prng';
import { sceneTime, useSceneSettings } from '../quality';
import type { Lighting } from '../sky';
import { useField } from './FieldContext';
import { createSoftSpriteTexture } from './textures';

interface AtmosphereProps {
  lighting: Lighting;
  cloudCover: number;
  rainIntensity: number;
  windDirection: THREE.Vector2;
  windSpeedKmh: number;
  /** Mean relative humidity — humid dawns get ground mist. */
  humidityPct?: number | null;
}

const tmpColor = new THREE.Color();
const cloudGrey = new THREE.Color();

export function Atmosphere({ lighting, cloudCover, rainIntensity, windDirection, windSpeedKmh, humidityPct }: AtmosphereProps) {
  const { quality, reducedMotion } = useSceneSettings();
  const high = quality === 'high';
  const scene = useThree((s) => s.scene);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const flash = useRef<THREE.AmbientLight>(null);
  const { shape, focus } = useField();
  // Fog and shadows scale with the drawn field so a 5 ha plot isn't swallowed by haze.
  const span = Math.max(60, shape.radius * 2.2);
  const shadowR = high ? 14 : 8;

  useEffect(() => {
    scene.fog = new THREE.Fog('#c8d6dc', 30, 260);
    return () => { scene.fog = null; };
  }, [scene]);

  const sunPosition = useMemo<[number, number, number]>(
    () => [lighting.sunDir[0] * 100, lighting.sunDir[1] * 100, lighting.sunDir[2] * 100],
    [lighting.sunDir],
  );

  const storm = rainIntensity > 0.8 && cloudCover > 0.85;
  // Radiation mist over wet paddies on calm, humid mornings around sunrise.
  const dawnness = lighting.phase === 'dawn' || lighting.phase === 'golden_morning' ? 1 - Math.min(1, Math.max(0, lighting.sunElevationDeg) / 14) : 0;
  const mist = dawnness * Math.min(1, Math.max(0, ((humidityPct ?? 75) - 60) / 30)) * (1 - Math.min(1, windSpeedKmh / 25));

  useFrame(({ clock }, dt) => {
    const k = reducedMotion ? 1 : 1 - Math.exp(-3 * Math.min(dt, 0.1));
    if (sun.current) {
      // Below the horizon the "sun" light becomes faint moonlight from above.
      // The light (and its shadow box) follows the detailed plant patch.
      const dir = lighting.sunDir[1] > 0 ? lighting.sunDir : [-0.3, 0.8, -0.4];
      sun.current.position.set(focus.x + (dir[0] ?? 0) * 40, (dir[1] ?? 1) * 40, focus.y + (dir[2] ?? 0) * 40);
      sun.current.target.position.set(focus.x, 0, focus.y);
      sun.current.target.updateMatrixWorld();
      tmpColor.setRGB(...lighting.sunColor, THREE.SRGBColorSpace);
      sun.current.color.lerp(tmpColor, k);
      sun.current.intensity += (lighting.sunIntensity - sun.current.intensity) * k;
    }
    if (hemi.current) {
      tmpColor.setRGB(...lighting.skyColor, THREE.SRGBColorSpace);
      hemi.current.color.lerp(tmpColor, k);
      tmpColor.setRGB(...lighting.groundColor, THREE.SRGBColorSpace);
      hemi.current.groundColor.lerp(tmpColor, k);
      hemi.current.intensity += (lighting.hemiIntensity - hemi.current.intensity) * k;
    }
    if (scene.fog instanceof THREE.Fog) {
      tmpColor.setRGB(...lighting.fogColor, THREE.SRGBColorSpace);
      scene.fog.color.lerp(tmpColor, k);
      const haze = Math.min(1, cloudCover * 0.35 + rainIntensity * 0.75 + mist * 0.5);
      scene.fog.far = (span * 6 + 450) * (1 - haze * 0.7);
      scene.fog.near = (span * 0.8 + 40) * (1 - haze * 0.75);
    }
    if (flash.current) {
      // Lightning: only in storms. Deterministic per 0.25 s bucket so it is not a random-number fountain.
      let intensity = 0;
      if (storm && !reducedMotion) {
        const t = sceneTime(clock.elapsedTime, reducedMotion);
        const bucket = Math.floor(t * 4);
        if (hash01(bucket) > 0.985) intensity = 6 * (1 - ((t * 4) % 1));
      }
      flash.current.intensity = intensity;
    }
  });

  return (
    <>
      <Sky
        distance={4500}
        sunPosition={sunPosition}
        turbidity={lighting.turbidity}
        rayleigh={lighting.rayleigh}
        mieCoefficient={0.006 + cloudCover * 0.01}
        mieDirectionalG={0.85}
      />
      {lighting.night > 0.15 && (
        <Stars radius={300} depth={60} count={high ? 4000 : 1500} factor={4} saturation={0} fade speed={reducedMotion ? 0 : 0.4} />
      )}
      <hemisphereLight ref={hemi} intensity={0.8} />
      <directionalLight
        ref={sun}
        castShadow={high && lighting.daylight > 0.05}
        intensity={2}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowR}
        shadow-camera-right={shadowR}
        shadow-camera-top={shadowR}
        shadow-camera-bottom={-shadowR}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <ambientLight ref={flash} color="#dfe8ff" intensity={0} />
      {/* Image-based light from a procedural environment: soft sky dome + warm sun-side card. No HDR download. */}
      <Environment key={`${Math.round(lighting.daylight * 8)}-${Math.round(cloudCover * 4)}`} resolution={high ? 128 : 32} frames={1} environmentIntensity={0.12 + 0.33 * lighting.daylight}>
        <color attach="background" args={[lighting.skyColor[0] * 0.8, lighting.skyColor[1] * 0.8, lighting.skyColor[2] * 0.85]} />
        <Lightformer form="ring" intensity={1.6 * lighting.daylight + 0.05} color={new THREE.Color().setRGB(...lighting.skyColor)} scale={40} position={[0, 30, 0]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={2.4 * lighting.daylight} color={new THREE.Color().setRGB(...lighting.sunColor)} scale={[18, 6, 1]} position={[lighting.sunDir[0] * 25, Math.max(2, lighting.sunDir[1] * 25), lighting.sunDir[2] * 25]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.5 * lighting.daylight} color="#5b6b3a" scale={[60, 4, 1]} position={[0, -4, 0]} rotation-x={-Math.PI / 2} />
      </Environment>
      {mist > 0.05 && <GroundMist amount={mist} lighting={lighting} />}
      <Clouds cover={cloudCover} rain={rainIntensity} lighting={lighting} windDirection={windDirection} windSpeedKmh={windSpeedKmh} />
    </>
  );
}

interface CloudsProps {
  cover: number;
  rain: number;
  lighting: Lighting;
  windDirection: THREE.Vector2;
  windSpeedKmh: number;
}

/** Billboarded soft cloud puffs; how many are visible follows cloud cover. */
function Clouds({ cover, rain, lighting, windDirection, windSpeedKmh }: CloudsProps) {
  const { quality, reducedMotion } = useSceneSettings();
  const max = quality === 'high' ? 40 : 18;
  const texture = useMemo(() => createSoftSpriteTexture(128, 6, 12), []);
  useEffect(() => () => texture?.dispose(), [texture]);

  const clouds = useMemo(() => {
    const rand = mulberry32(55);
    return Array.from({ length: max }, () => ({
      x: (rand() - 0.5) * 500,
      y: 55 + rand() * 45,
      z: -60 - rand() * 260,
      s: 50 + rand() * 70,
      order: rand(),
    }));
  }, [max]);

  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }),
    [texture],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    const drift = (windSpeedKmh / 3.6) * 0.4 * t;
    const day = lighting.daylight;
    const grey = 1 - rain * 0.55;
    tmpColor.setRGB(...lighting.skyColor, THREE.SRGBColorSpace).lerp(cloudGrey.setRGB(grey, grey, grey * 1.02), day * 0.85);
    material.color.copy(tmpColor);
    material.opacity = 0.55 + cover * 0.35;
    group.current?.children.forEach((child, i) => {
      const c = clouds[i];
      if (!c) return;
      child.visible = c.order < cover;
      const x = ((c.x + windDirection.x * drift + 250) % 500 + 500) % 500 - 250;
      child.position.set(x, c.y, c.z + windDirection.y * drift * 0.2);
    });
  });

  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <sprite key={i} material={material} scale={[c.s, c.s * 0.45, 1]} position={[c.x, c.y, c.z]} />
      ))}
    </group>
  );
}

/** Low-lying morning mist: a few large soft sheets hugging the field. Purely visual. */
function GroundMist({ amount, lighting }: { amount: number; lighting: Lighting }) {
  const { shape } = useField();
  const { reducedMotion } = useSceneSettings();
  const texture = useMemo(() => createSoftSpriteTexture(128, 8, 31), []);
  useEffect(() => () => texture?.dispose(), [texture]);
  const sheets = useMemo(() => {
    const rand = mulberry32(64);
    const r = Math.max(20, shape.radius * 1.3);
    return Array.from({ length: 14 }, () => ({
      x: shape.center[0] + (rand() - 0.5) * r * 2,
      z: shape.center[1] + (rand() - 0.5) * r * 2,
      y: 0.4 + rand() * 0.9,
      s: r * (0.5 + rand() * 0.6),
      phase: rand() * 6,
    }));
  }, [shape]);
  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }),
    [texture],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    material.opacity = 0.32 * amount;
    material.color.setRGB(...lighting.fogColor, THREE.SRGBColorSpace).lerp(new THREE.Color(1, 0.95, 0.88), 0.5);
    group.current?.children.forEach((c, i) => {
      const sh = sheets[i];
      if (sh) c.position.x = sh.x + Math.sin(t * 0.05 + sh.phase) * 3;
    });
  });
  return (
    <group ref={group}>
      {sheets.map((sh, i) => (
        <mesh key={i} material={material} position={[sh.x, sh.y, sh.z]} rotation-x={-Math.PI / 2} scale={[sh.s, sh.s * 0.6, 1]}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}
