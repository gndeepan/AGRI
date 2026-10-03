import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { lightProbe, skyPalette, type RGB } from '@/features/sky/palette';
import type { SkyParams } from '@/features/sky/params';
import { createSkyRendererForContext, type SkyRenderer, type Vec3 } from '@/features/sky/renderer';
import { weatherAudio } from '@/features/sky/thunder';
import { mulberry32 } from '../prng';
import { sceneTime, useSceneSettings } from '../quality';
import { useField } from './FieldContext';
import { createSoftSpriteTexture } from './textures';

/**
 * The field's sky is the same live sky as the dashboard card (features/sky), rendered inside
 * three.js's own WebGL context:
 * - every frame, the sky is drawn for the 3D camera's exact view into a texture shown behind the
 *   scene (sharp sun, moon, stars, clouds, distant rain, lightning bolts);
 * - every few seconds, a small sky cube map is rendered and turned (PMREM) into the scene's
 *   environment light, and mirrored views (paddy water) sample the same cube;
 * - the key light, ambient light and fog come from the sky's light probe, so the crop is lit by the
 *   sky the user sees; lightning flashes light the field and trigger thunder when sound is on.
 *
 * Scene axes: +x east, y up, -z north. Sky space: x east, y up, z north.
 */

interface AtmosphereProps {
  sky: SkyParams;
  soundEnabled: boolean;
}

/** Seconds between environment cube + PMREM refreshes (clouds drift slowly). */
const ENV_REFRESH_S = 3;
/** Scale of the sky view relative to the drawing buffer; soft sky texture, sharp enough for stars. */
const VIEW_SCALE = { high: 0.5, low: 0.4 } as const;
const MAX_VIEW_PIXELS = 600_000;

const toScene = (v: RGB | Vec3): THREE.Vector3 => new THREE.Vector3(v[0], v[1], -v[2]);
const skyVec = (x: number, y: number, z: number): Vec3 => [x, y, -z];
const tmpColor = new THREE.Color();

const BACKGROUND_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const BACKGROUND_FRAG = /* glsl */ `
uniform sampler2D uView;
uniform samplerCube uCube;
uniform float uMain;
uniform float uHasCube;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uGain;
varying vec2 vNdc;
vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
void main() {
  vec3 c;
  if (uMain > 0.5) {
    c = texture2D(uView, vNdc * 0.5 + 0.5).rgb;
  } else {
    // Mirrored/secondary cameras (water reflections) look up the sky cube by direction.
    vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
    vec3 d = normalize((uCamWorld * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
    c = uHasCube > 0.5 ? textureCube(uCube, vec3(d.x, d.y, -d.z)).rgb : vec3(0.5, 0.6, 0.7);
    c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.65);
  }
  gl_FragColor = vec4(toLinear(c) * uGain, 1.0);
  #include <colorspace_fragment>
}`;

const ENV_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ENV_FRAG = /* glsl */ `
uniform samplerCube uCube;
uniform vec3 uGround;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c = pow(max(textureCube(uCube, vec3(d.x, d.y, -d.z)).rgb, 0.0), vec3(2.2));
  // Below the horizon the field sees earth, not sky: bounce light from the ground.
  c = mix(c, uGround, smoothstep(0.0, -0.18, d.y));
  // Mild desaturation: the sky texture is tuned for display, the environment only for light.
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.8);
  gl_FragColor = vec4(c, 1.0);
}`;

/** A CubeTexture whose GPU texture is the sky renderer's own cube (never uploaded by three). */
function bindExternalCube(gl: THREE.WebGLRenderer, tex: THREE.CubeTexture, raw: WebGLTexture) {
  (gl.properties.get(tex) as { __webglTexture?: WebGLTexture }).__webglTexture = raw;
}

export function Atmosphere({ sky, soundEnabled }: AtmosphereProps) {
  const { quality, reducedMotion } = useSceneSettings();
  const high = quality === 'high';
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const mainCamera = useThree((s) => s.camera);
  const keyLight = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const flashLight = useRef<THREE.AmbientLight>(null);
  const { shape, focus } = useField();
  const span = Math.max(60, shape.radius * 2.2);
  const shadowR = high ? 14 : 8;

  const live = useRef({ sky, soundEnabled });
  live.current = { sky, soundEnabled };

  // three.js objects (safe to dispose and reuse: three re-uploads them on next use).
  const res = useMemo(() => {
    const view = new THREE.ExternalTexture(null);
    const cube = new THREE.CubeTexture();
    const background = new THREE.ShaderMaterial({
      uniforms: {
        uView: { value: view },
        uCube: { value: cube },
        uMain: { value: 1 },
        uHasCube: { value: 0 },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uGain: { value: 1.1 },
      },
      vertexShader: BACKGROUND_VERT,
      fragmentShader: BACKGROUND_FRAG,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    const envMaterial = new THREE.ShaderMaterial({
      uniforms: { uCube: { value: cube }, uGround: { value: new THREE.Color() } },
      vertexShader: ENV_VERT,
      fragmentShader: ENV_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), envMaterial));
    return { view, cube, background, envMaterial, envScene };
  }, []);

  /**
   * Raw GL resources on three's context: the sky renderer and its view target. Created lazily in the
   * frame loop and released in cleanup, so effect re-runs (Fast Refresh, StrictMode) never use a
   * disposed renderer.
   */
  type Gpu = { raw: WebGL2RenderingContext; renderer: SkyRenderer | null; viewTex: WebGLTexture | null; viewFbo: WebGLFramebuffer | null; pmrem: THREE.PMREMGenerator; viewW: number; viewH: number };
  const gpuRef = useRef<Gpu | null>(null);
  const getGpu = (): Gpu => {
    if (gpuRef.current) return gpuRef.current;
    const raw = gl.getContext() as WebGL2RenderingContext;
    let renderer: SkyRenderer | null;
    try {
      renderer = createSkyRendererForContext(raw);
    } catch {
      // Shader compile failure: the scene keeps its lights, only the sky backdrop is missing.
      renderer = null;
    }
    const viewTex = raw.createTexture();
    res.view.sourceTexture = viewTex;
    gpuRef.current = { raw, renderer, viewTex, viewFbo: raw.createFramebuffer(), pmrem: new THREE.PMREMGenerator(gl), viewW: 0, viewH: 0 };
    lastEnv.current = { t: -1e9, key: '' };
    return gpuRef.current;
  };

  const envTarget = useRef<THREE.WebGLRenderTarget | null>(null);
  /** The sky changes slowly: redraw it every other frame unless lightning is active. */
  const frameNo = useRef(0);
  const lastFlash = useRef(0);
  const lastEnv = useRef({ t: -1e9, key: '' });

  useEffect(() => {
    scene.fog = new THREE.Fog('#c8d6dc', 30, 260);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useEffect(() => () => {
    scene.environment = null;
    envTarget.current?.dispose();
    envTarget.current = null;
    const g = gpuRef.current;
    gpuRef.current = null;
    if (g) {
      g.pmrem.dispose();
      g.renderer?.dispose();
      g.raw.deleteTexture(g.viewTex);
      g.raw.deleteFramebuffer(g.viewFbo);
    }
    res.view.sourceTexture = null;
    res.background.uniforms.uHasCube.value = 0;
    // The cube's GPU texture belonged to the sky renderer: detach so three never deletes it twice.
    gl.properties.remove(res.cube);
    res.background.dispose();
    res.envMaterial.dispose();
  }, [gl, res, scene]);

  // The background quad runs in every pass: the main camera samples the sharp view, others the cube.
  const quad = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, res.background);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    mesh.onBeforeRender = (_r, _s, camera) => {
      const u = res.background.uniforms;
      u.uMain.value = camera === mainCamera ? 1 : 0;
      // Reflections (muddy paddy water) see a dimmer, greyer sky than the eye does.
      u.uGain.value = camera === mainCamera ? 1.1 : 0.72;
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      res.background.uniformsNeedUpdate = true;
    };
    return mesh;
  }, [res, mainCamera]);
  useEffect(() => () => quad.geometry.dispose(), [quad]);

  useFrame(({ clock, camera }, dt) => {
    const { sky: p, soundEnabled: sound } = live.current;
    const t = sceneTime(clock.elapsedTime, reducedMotion);
    const probe = lightProbe(p);
    const pal = skyPalette(p);
    let flash = 0;

    const gpu = getGpu();
    const r = gpu.renderer;
    if (r && !r.lost) {
      const raw = gpu.raw;
      const scale = high ? VIEW_SCALE.high : VIEW_SCALE.low;
      let w = Math.max(2, Math.round(gl.domElement.width * scale));
      let h = Math.max(2, Math.round(gl.domElement.height * scale));
      const over = (w * h) / MAX_VIEW_PIXELS;
      if (over > 1) {
        w = Math.round(w / Math.sqrt(over));
        h = Math.round(h / Math.sqrt(over));
      }
      const resized = w !== gpu.viewW || h !== gpu.viewH;
      if (resized) {
        raw.bindTexture(raw.TEXTURE_2D, gpu.viewTex);
        raw.texImage2D(raw.TEXTURE_2D, 0, raw.RGBA8, w, h, 0, raw.RGBA, raw.UNSIGNED_BYTE, null);
        raw.texParameteri(raw.TEXTURE_2D, raw.TEXTURE_MIN_FILTER, raw.LINEAR);
        raw.texParameteri(raw.TEXTURE_2D, raw.TEXTURE_MAG_FILTER, raw.LINEAR);
        raw.texParameteri(raw.TEXTURE_2D, raw.TEXTURE_WRAP_S, raw.CLAMP_TO_EDGE);
        raw.texParameteri(raw.TEXTURE_2D, raw.TEXTURE_WRAP_T, raw.CLAMP_TO_EDGE);
        raw.bindFramebuffer(raw.FRAMEBUFFER, gpu.viewFbo);
        raw.framebufferTexture2D(raw.FRAMEBUFFER, raw.COLOR_ATTACHMENT0, raw.TEXTURE_2D, gpu.viewTex, 0);
        gpu.viewW = w;
        gpu.viewH = h;
      }

      const skip = (frameNo.current++ & 1) === 1 && lastFlash.current === 0 && !resized && !reducedMotion;
      // The sky as seen by the 3D camera.
      camera.updateMatrixWorld();
      const e = camera.matrixWorld.elements;
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
      const frame = skip ? { lightning: null, flash: 0 } : r.render(p, t, {
        still: reducedMotion,
        quality: high ? 1 : 0.6,
        screenFlash: false,
        // Streaks come from the 3D rain (with depth); the sky keeps its rain veils and darkening.
        rain: false,
        view: {
          right: skyVec(e[0], e[1], e[2]),
          up: skyVec(e[4], e[5], e[6]),
          fwd: skyVec(-e[8], -e[9], -e[10]),
          tanHalfFov: Math.tan(((fov * Math.PI) / 180) / 2),
        },
        output: { framebuffer: gpu.viewFbo, width: w, height: h },
      });
      flash = frame.flash;
      if (!skip) lastFlash.current = flash > 0 || frame.lightning ? 1 : 0;
      if (sound && frame.lightning) weatherAudio()?.thunder(frame.lightning.t0 + p.seed, frame.lightning.distanceKm);

      // Environment: refresh on a timer, or at once when the weather or hour changes.
      const key = `${p.seed}|${Math.round(p.sunElevation * 40)}|${Math.round(p.cloudLow * 10)}|${Math.round(p.rainIntensity * 10)}|${Math.round(p.fog * 10)}`;
      const due = key !== lastEnv.current.key || (!reducedMotion && t - lastEnv.current.t > ENV_REFRESH_S);
      let cubeRaw: WebGLTexture | null = null;
      if (due) cubeRaw = r.renderCube(p, t, high ? 128 : 64, { still: reducedMotion, quality: 0.5 });
      gl.resetState();

      if (cubeRaw) {
        lastEnv.current = { t, key };
        bindExternalCube(gl, res.cube, cubeRaw);
        res.background.uniforms.uHasCube.value = 1;
        tmpColor.setRGB(0.32, 0.27, 0.18, THREE.SRGBColorSpace).multiplyScalar(0.15 + 0.85 * pal.daylight);
        (res.envMaterial.uniforms.uGround.value as THREE.Color).copy(tmpColor);
        const next = gpu.pmrem.fromScene(res.envScene, 0, 0.1, 10, { size: high ? 128 : 64 });
        envTarget.current?.dispose();
        envTarget.current = next;
        scene.environment = next.texture;
      }
    }

    // Lighting from the same sky.
    const k = reducedMotion ? 1 : 1 - Math.exp(-3 * Math.min(dt, 0.1));
    const night = pal.daylight < 0.15;
    // Under a rain deck the ground sees far less light than the bright grey cloud base suggests.
    const dim = 1 - 0.45 * pal.gloom;
    scene.environmentIntensity = (0.32 + 0.33 * pal.daylight) * dim;
    if (keyLight.current) {
      const dir = toScene(probe.keyDirection).normalize();
      keyLight.current.position.set(focus.x + dir.x * 40, Math.max(dir.y, 0.05) * 40, focus.y + dir.z * 40);
      keyLight.current.target.position.set(focus.x, 0, focus.y);
      keyLight.current.target.updateMatrixWorld();
      tmpColor.setRGB(...probe.keyColor, THREE.SRGBColorSpace);
      keyLight.current.color.lerp(tmpColor, k);
      // Storm afternoons are dim, not black: keep a daylight floor so the crop stays readable.
      const target = night ? probe.keyIntensity * 9 : Math.max(probe.keyIntensity * 3.1 * dim, 0.55 * pal.daylight);
      keyLight.current.intensity += (target - keyLight.current.intensity) * k;
      keyLight.current.castShadow = high && pal.daylight > 0.05;
    }
    if (hemi.current) {
      // Use the sky's hue but a fixed brightness: how bright it is comes from the intensity below.
      const sky = pal.zenith.map((v, i) => v * 0.6 + pal.horizon[i] * 0.4) as RGB;
      const lum = sky[0] * 0.2126 + sky[1] * 0.7152 + sky[2] * 0.0722;
      const norm = Math.max(1, 0.6 / Math.max(lum, 0.02));
      if (night) tmpColor.setRGB(0.42, 0.5, 0.72, THREE.SRGBColorSpace);
      else tmpColor.setRGB(sky[0] * norm, sky[1] * norm, sky[2] * norm, THREE.SRGBColorSpace);
      hemi.current.color.lerp(tmpColor, k);
      tmpColor.setRGB(0.3, 0.26, 0.16, THREE.SRGBColorSpace).multiplyScalar(0.2 + 0.8 * pal.daylight);
      hemi.current.groundColor.lerp(tmpColor, k);
      // Night: starlight and village skyglow keep silhouettes readable even without a moon.
      const ambient = Math.max(probe.ambientIntensity * 1.1 * (0.6 + 0.4 * dim), 0.5 * pal.daylight, 0.22);
      hemi.current.intensity += (ambient - hemi.current.intensity) * k;
    }
    if (flashLight.current) flashLight.current.intensity = reducedMotion ? 0 : flash * 3.5;
    if (scene.fog instanceof THREE.Fog) {
      // Fog takes the horizon's colour (already darkened by rain/storm); real fog greys it further.
      const fogRgb = pal.horizon.map((h, i) => h + (pal.fogColor[i] * (1 - pal.gloom * 0.6) - h) * Math.min(1, p.fog * 0.8)) as RGB;
      tmpColor.setRGB(...fogRgb, THREE.SRGBColorSpace);
      scene.fog.color.lerp(tmpColor, k);
      const haze = Math.min(1, p.cloudLow * 0.25 + p.overcast * 0.2 + p.rainIntensity * 0.75 + p.mist * 0.5 + p.fog);
      scene.fog.far = (span * 6 + 450) * (1 - haze * 0.8);
      scene.fog.near = (span * 0.8 + 40) * (1 - haze * 0.85);
    }
  });

  return (
    <>
      <primitive object={quad} />
      <hemisphereLight ref={hemi} intensity={0.6} />
      <directionalLight
        ref={keyLight}
        intensity={2}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-shadowR}
        shadow-camera-right={shadowR}
        shadow-camera-top={shadowR}
        shadow-camera-bottom={-shadowR}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <ambientLight ref={flashLight} color="#dfe8ff" intensity={0} />
      {sky.mist > 0.05 && <GroundMist amount={sky.mist} sky={sky} />}
    </>
  );
}

/** Low-lying morning mist: a few large soft sheets hugging the field. Purely visual. */
function GroundMist({ amount, sky }: { amount: number; sky: SkyParams }) {
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
    const pal = skyPalette(sky);
    material.opacity = 0.32 * amount;
    material.color.setRGB(...pal.horizon, THREE.SRGBColorSpace).lerp(tmpColor.setRGB(1, 0.95, 0.88), 0.5);
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
