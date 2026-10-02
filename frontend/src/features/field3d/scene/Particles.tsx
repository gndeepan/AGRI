import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '../prng';
import { sceneTime, useSceneSettings } from '../quality';
import { useField } from './FieldContext';

const RAIN_HEIGHT = 22;
const RAIN_SPREAD = 44;

function useThreeCamera() {
  return useThree((st) => st.camera);
}

/** GPU rain: each drop is a short streak whose fall is computed entirely in the vertex shader. */
export function Rain({ intensity, windDirection, windSpeedKmh }: { intensity: number; windDirection: THREE.Vector2; windSpeedKmh: number }) {
  const { quality, reducedMotion } = useSceneSettings();
  const maxDrops = quality === 'high' ? 9000 : 2500;

  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(77);
    const start = new Float32Array(maxDrops * 2 * 3);
    const end = new Float32Array(maxDrops * 2);
    for (let i = 0; i < maxDrops; i++) {
      const x = (rand() - 0.5) * RAIN_SPREAD;
      const y = rand() * RAIN_HEIGHT;
      const z = (rand() - 0.5) * RAIN_SPREAD;
      start.set([x, y, z, x, y, z], i * 6);
      end.set([0, 1], i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(start, 3));
    geo.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, RAIN_HEIGHT / 2, 0), RAIN_SPREAD);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSlant: { value: new THREE.Vector2() },
        uOpacity: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uSlant;
        attribute float aEnd;
        varying float vEnd;
        varying float vFade;
        void main() {
          vEnd = aEnd;
          float y = mod(position.y - uTime * 9.0, ${RAIN_HEIGHT.toFixed(1)});
          vec3 p = vec3(position.x, y, position.z);
          p.xz += uSlant * y * 0.25;
          // ~9 m/s over a 1/60 s exposure: streaks are a few centimetres to ~15 cm, not half a metre.
          p += vec3(uSlant.x * 0.25, 1.0, uSlant.y * 0.25) * 0.2 * aEnd;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // Drops right in front of the lens would be huge out-of-focus blobs: fade them out,
          // and let distant ones thin out into the rain veil the sky already draws.
          float d = -mv.z;
          vFade = smoothstep(2.0, 6.0, d) * (1.0 - smoothstep(26.0, 40.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vEnd;
        varying float vFade;
        // Brighter head, fading tail: reads as a motion-blurred drop.
        void main() { gl_FragColor = vec4(0.8, 0.85, 0.92, vFade * uOpacity * (0.25 + 0.75 * (1.0 - vEnd))); }`,
    });
    return { geometry: geo, material: mat };
  }, [maxDrops]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ clock }) => {
    material.uniforms.uTime!.value = sceneTime(clock.elapsedTime, reducedMotion);
    (material.uniforms.uSlant!.value as THREE.Vector2).copy(windDirection).multiplyScalar(Math.min(1.2, windSpeedKmh / 30));
    material.uniforms.uOpacity!.value = 0.2 + intensity * 0.32;
    geometry.setDrawRange(0, Math.floor(maxDrops * Math.min(1, intensity)) * 2);
    // Rain is only drawn in a volume around the viewer; the whole sky darkens elsewhere.
    if (group.current) group.current.position.set(camera.position.x, 0, camera.position.z);
  });
  const group = useRef<THREE.Group>(null);
  const camera = useThreeCamera();

  if (intensity < 0.02) return null;
  return (
    <group ref={group}>
      <lineSegments geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

/** Fireflies drifting over the bunds at night. */
export function Fireflies({ visibility }: { visibility: number }) {
  const { quality, reducedMotion } = useSceneSettings();
  const count = quality === 'high' ? 160 : 60;

  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(13);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([(rand() - 0.5) * 34, 0.3 + rand() * 1.6, (rand() - 0.5) * 26], i * 3);
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSeed;
        varying float vBlink;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.6 + aSeed * 13.0) * 0.8;
          p.y += sin(uTime * 0.9 + aSeed * 7.0) * 0.3;
          p.z += cos(uTime * 0.45 + aSeed * 5.0) * 0.8;
          vBlink = pow(max(0.0, sin(uTime * 1.8 + aSeed * 31.0)), 4.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 70.0 * uPixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vBlink;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float glow = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * glow, glow * vBlink * uOpacity);
        }`,
    });
    return { geometry: geo, material: mat };
  }, [count]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ clock, gl }) => {
    // With reduced motion fireflies hold a steady soft glow instead of blinking.
    material.uniforms.uTime!.value = reducedMotion ? 0.9 : clock.elapsedTime;
    material.uniforms.uOpacity!.value = visibility;
    material.uniforms.uPixelRatio!.value = gl.getPixelRatio();
  });

  if (visibility < 0.02) return null;
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/** Expanding rings where drops hit standing water (or wet mud), around the viewer. */
export function Splashes({ intensity }: { intensity: number }) {
  const { quality, reducedMotion } = useSceneSettings();
  const { waterY } = useField();
  const camera = useThree((st) => st.camera);
  const count = quality === 'high' ? 900 : 250;
  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(88);
    const base = new THREE.PlaneGeometry(1, 1);
    base.rotateX(-Math.PI / 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const offs = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) offs.set([(rand() - 0.5) * 24, rand(), (rand() - 0.5) * 24], i * 3);
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 3));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uCenter: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCenter;
        attribute vec3 aOff;
        varying vec2 vUv;
        varying float vAge;
        void main() {
          float cycle = uTime * 1.6 + aOff.y * 7.0;
          vAge = fract(cycle);
          // Each ring re-spawns somewhere new every cycle.
          float k = floor(cycle);
          vec2 jitter = vec2(fract(sin(k * 12.9898 + aOff.y * 78.2) * 43758.5), fract(sin(k * 4.1414 + aOff.y * 3.7) * 24634.6)) - 0.5;
          vec2 xz = uCenter.xz + mod(aOff.xz + jitter * 6.0 + 12.0, 24.0) - 12.0;
          float s = 0.03 + vAge * 0.16;
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4(xz.x + position.x * s, uCenter.y + 0.003, xz.y + position.z * s, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vAge;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float ring = smoothstep(0.75, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
          gl_FragColor = vec4(vec3(0.85, 0.9, 0.95), ring * (1.0 - vAge) * uOpacity);
        }`,
    });
    return { geometry: geo, material: mat };
  }, [count]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ clock }) => {
    material.uniforms.uTime!.value = sceneTime(clock.elapsedTime, reducedMotion);
    material.uniforms.uOpacity!.value = Math.min(1, intensity * 1.4) * (waterY.value > 0 ? 0.8 : 0.35);
    (material.uniforms.uCenter!.value as THREE.Vector3).set(camera.position.x, waterY.value || 0.005, camera.position.z);
    geometry.instanceCount = Math.floor(count * Math.min(1, intensity * 1.2));
  });
  if (intensity < 0.02 || reducedMotion) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
