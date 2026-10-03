import { AdaptiveDpr, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, DepthOfField, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { useAmbientSound } from './audio';
import { cropVisual, genericStageIndex } from './crops/cropGrowth';
import { specFor } from './crops/specs';
import { describeShape, fieldShapeFromPolygon, type FieldShape } from './fieldShape';
import { growthParams } from './growth';
import { damp, detectQuality, SceneSettingsContext, usePrefersReducedMotion, type ResolvedQuality } from './quality';
import { Atmosphere } from './scene/Atmosphere';
import { Backdrop } from './scene/Backdrop';
import { Landscape } from './scene/Landscape';
import { FieldContext, type FieldContextValue } from './scene/FieldContext';
import { Ground } from './scene/Ground';
import { Fireflies, Rain, Splashes } from './scene/Particles';
import { createWindUniforms } from './scene/plantMaterials';
import { Crop } from './scene/RicePlants';
import { bundSpot, ScaleFigures } from './scene/ScaleFigures';
import { LifeLayer } from './scene/LifeLayer';
import { sceneLightingFromSky } from './sky';
import { skyFromVisualState } from '@/features/sky/fromTimeline';
import type { VirtualFieldProps } from './types';
import { announceWebGLFailure, WebGLBoundary } from './WebGLBoundary';

// Non-paddy crops: plant generators, tilled soil and birds load only when needed.
const UplandScene = lazy(() => import('./crops/UplandScene'));

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

type ViewMode = 'orbit' | 'eye';

/** Pauses rendering while the canvas is scrolled off-screen or the tab is hidden. */
function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    const onChange = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return onScreen && tabVisible;
}

interface Framing {
  camera: [number, number, number];
  target: [number, number, number];
  minDistance: number;
  maxDistance: number;
  /** Where the viewer stands (x, z) — the scale figures go on the bund here. */
  viewFrom: [number, number];
}

/** Hero view from just outside the field's south-facing bund, adapted to field size. */
export function frameField(shape: FieldShape, mode: ViewMode): Framing {
  const south: [number, number] = [shape.center[0], shape.center[1] + shape.radius + 50];
  const spot = bundSpot(shape.ring, south);
  if (mode === 'eye') {
    // Standing on the bund at eye height, looking across the field.
    const eye: [number, number, number] = [spot.x + spot.nx * 0.35, 0.3 + 1.6, spot.z + spot.nz * 0.35];
    return {
      camera: eye,
      target: [eye[0] - spot.nx * 0.2, eye[1] - 0.04, eye[2] - spot.nz * 0.2],
      minDistance: 0.2,
      maxDistance: 0.2,
      viewFrom: [spot.x, spot.z],
    };
  }
  const back = Math.min(26, Math.max(7, shape.radius * 0.18));
  const inset = Math.min(14, Math.max(4, Math.min(shape.lengthM, shape.widthM) * 0.25));
  const camY = 2.2 + back * 0.32;
  // Look down only ~6° so the live sky fills the upper part of the frame.
  const targetY = Math.max(0.45, camY - (back + inset) * 0.105);
  return {
    camera: [spot.x + spot.nx * back, camY, spot.z + spot.nz * back],
    target: [spot.x - spot.nx * inset, targetY, spot.z - spot.nz * inset],
    minDistance: 3,
    maxDistance: Math.min(900, Math.max(45, shape.radius * 3.2)),
    viewFrom: [spot.x, spot.z],
  };
}

/** Applies the framing when the field or the view mode changes (not on every growth update). */
function CameraRig({ framing }: { framing: Framing }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    camera.position.set(...framing.camera);
    const far = Math.max(5000, framing.maxDistance * 12);
    if (camera instanceof THREE.PerspectiveCamera && camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    if (controls) {
      controls.target.set(...framing.target);
      controls.update();
    }
  }, [camera, controls, framing]);
  return null;
}

/** Post-processing detail: 'full' (AO + depth of field), 'lite' (depth of field only), 'low' (tone map only). */
export type FxLevel = 'full' | 'lite' | 'low';

interface DofHandle {
  circleOfConfusionMaterial: { focusDistance: number; focusRange: number };
  bokehScale: number;
}

/**
 * Depth of field that follows the camera: the focus plane sits where the viewer is looking
 * (orbit: the orbit target; bund view: the crop a few metres ahead), eased so it pulls rather than
 * snaps. The farmer's field stays sharp while the distant village, trees and horizon blur.
 */
function FocusedDepthOfField({ shape, mode }: { shape: FieldShape; mode: ViewMode }) {
  const ref = useRef<DofHandle | null>(null);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const focus = useRef(0);
  // A generous in-focus zone: only the far village, groves and horizon go soft.
  const sharp = Math.max(45, shape.radius * 1.6);
  useFrame((_, dt) => {
    const dof = ref.current;
    if (!dof) return;
    const want = mode === 'eye'
      ? 7
      : controls ? Math.min(shape.radius * 2.5, Math.max(6, camera.position.distanceTo(controls.target))) : 20;
    focus.current = focus.current === 0 ? want : damp(focus.current, want, 3.5, Math.min(dt, 0.1));
    const m = dof.circleOfConfusionMaterial;
    m.focusDistance = focus.current;
    // Everything within the field's own extent stays in focus; blur grows beyond it.
    m.focusRange = mode === 'eye' ? 34 : sharp;
  });
  return <DepthOfField ref={ref as never} focusDistance={20} focusRange={sharp} bokehScale={mode === 'eye' ? 1.7 : 1.4} resolutionScale={0.5} />;
}

function Effects({ fx, shape, mode, depthOfField }: { fx: FxLevel; shape: FieldShape; mode: ViewMode; depthOfField: boolean }) {
  // ACES keeps the saturated greens of a paddy; AgX greyed them out.
  if (fx === 'low') {
    return (
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.25} luminanceThreshold={0.9} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.3} darkness={0.45} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {fx === 'full' ? <N8AO aoRadius={0.6} distanceFalloff={0.6} intensity={2.2} quality="low" halfRes /> : <></>}
      {depthOfField ? <FocusedDepthOfField shape={shape} mode={mode} /> : <></>}
      <Bloom intensity={0.35} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.5} />
      <SMAA />
    </EffectComposer>
  );
}

export default function VirtualFieldCanvas({
  state, quality = 'auto', soundEnabled = false, className, boundary, cropSlug, irrigationMethod, sky: skyProp,
}: VirtualFieldProps) {
  const container = useRef<HTMLDivElement>(null);
  const visible = useOnScreen(container);
  const reducedMotion = usePrefersReducedMotion();
  const [autoQuality, setAutoQuality] = useState<ResolvedQuality>(() => detectQuality());
  const resolved: ResolvedQuality = quality === 'auto' ? autoQuality : quality;
  const [mode, setMode] = useState<ViewMode>('orbit');

  const shape = useMemo(() => fieldShapeFromPolygon(boundary), [boundary]);
  const framing = useMemo(() => frameField(shape, mode), [shape, mode]);
  const wind = useMemo(() => createWindUniforms(), []);
  const field = useMemo<FieldContextValue>(
    () => ({ shape, wind, focus: new THREE.Vector2(shape.center[0], shape.center[1]), waterY: { value: 0 } }),
    [shape, wind],
  );

  const cloudCover = clamp01(state.cloudCover);
  const rain = clamp01(state.rainIntensity);
  const windKmh = Math.max(0, Number.isFinite(state.windSpeedKmh) ? state.windSpeedKmh : 0);
  const groundWet = clamp01(Math.max(state.groundWetness ?? 0, rain));

  const growth = useMemo(() => growthParams(state.stageKey, state.stageProgress), [state.stageKey, state.stageProgress]);
  const upland = useMemo(() => specFor(cropSlug), [cropSlug]);
  const uplandVisual = useMemo(
    () => (upland ? cropVisual(upland, genericStageIndex(state.rawStageKey, state.stageKey), state.stageProgress) : null),
    [upland, state.rawStageKey, state.stageKey, state.stageProgress],
  );
  const sky = useMemo(() => skyProp ?? skyFromVisualState(state), [skyProp, state]);
  const lighting = useMemo(() => sceneLightingFromSky(sky), [sky]);

  // Meteorological direction is where wind comes FROM; plants bend the other way.
  const windDirection = useMemo(() => {
    const rad = ((state.windDirectionDeg + 180) * Math.PI) / 180;
    return new THREE.Vector2(Math.sin(rad), -Math.cos(rad));
  }, [state.windDirectionDeg]);
  // ~40 km/h reads as a strong wind across a paddy canopy.
  const windStrength = Math.min(1, windKmh / 40);

  const waterLevel = state.standingWater ? Math.max(growth.waterLevel, 0.3) : 0;
  const soilWetness = Math.max(growth.soilWetness, state.standingWater ? 0.9 : 0);
  // Dew on leaves in the early morning, rain wetness otherwise.
  const dew = lighting.phase === 'dawn' || lighting.phase === 'golden_morning' ? 0.35 : 0;
  const leafWet = Math.max(groundWet, dew);
  const flowering = uplandVisual ? Math.min(1, Math.max(0, uplandVisual.flower - uplandVisual.flowerDrop) * 2) : 0;
  const anthesis = state.stageKey === 'flowering' && state.hourOfDay > 8 && state.hourOfDay < 13 ? 1 - Math.abs(state.stageProgress - 0.4) : 0;
  const wildlife = lighting.daylight * (1 - rain) * (1 - cloudCover * 0.4);
  const fireflies = lighting.night * (1 - rain) * (resolved === 'high' ? 1 : 0.7);

  useAmbientSound(soundEnabled, { daylight: lighting.daylight, night: lighting.night, rain, wind: windStrength });

  const settings = useMemo(() => ({ quality: resolved, reducedMotion }), [resolved, reducedMotion]);
  // Staged fallback when the frame rate drops: drop AO first, then depth of field, then go low.
  const [fxStep, setFxStep] = useState(0);
  // Dev-only profiling override: ?fx=full|lite|low|nodof (never read in production builds).
  const devFx = import.meta.env.DEV ? new URLSearchParams(location.search).get('fx') : null;
  const fx: FxLevel = devFx === 'full' || devFx === 'lite' || devFx === 'low' ? devFx
    : devFx === 'nodof' ? 'full'
    : resolved === 'low' ? 'low' : fxStep === 0 ? 'full' : fxStep === 1 ? 'lite' : 'low';
  const depthOfField = devFx === 'nodof' ? false : resolved === 'high' && !reducedMotion && (devFx ? fx !== 'low' : fxStep < 2);

  return (
    <div ref={container} className={className} style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'pan-y' }}>
      <WebGLBoundary>
        <Canvas
          shadows={resolved === 'high' ? 'percentage' : false}
          dpr={resolved === 'high' ? [1, 1.75] : [0.75, 1.25]}
          frameloop={visible ? 'always' : 'never'}
          camera={{ position: framing.camera, fov: mode === 'eye' ? 62 : 42, near: 0.05, far: 5000 }}
          gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
          onCreated={({ gl, scene }) => {
            // Tone mapping happens in the post-processing chain (AgX).
            gl.toneMapping = THREE.NoToneMapping;
            if (import.meta.env.DEV) Object.assign(window, { __bhoomiGl: gl, __bhoomiScene: scene });
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              announceWebGLFailure('context_lost');
            });
          }}
          aria-label={upland ? `Simulated ${upland.slug.replace('-', ' ')} field visualisation` : 'Simulated paddy field visualisation'}
        >
          <SceneSettingsContext.Provider value={settings}>
            <FieldContext.Provider value={field}>
              <PerformanceMonitor
                onDecline={() => {
                  if (quality !== 'auto') return;
                  setFxStep((n) => {
                    if (n >= 2) { setAutoQuality('low'); return n; }
                    return n + 1;
                  });
                }}
                flipflops={3}
              >
                <AdaptiveDpr pixelated={false} />
              </PerformanceMonitor>
              <Atmosphere sky={sky} soundEnabled={soundEnabled} />
              {upland && uplandVisual ? (
                <Suspense fallback={null}>
                  <UplandScene
                    spec={upland}
                    visual={uplandVisual}
                    windStrength={windStrength}
                    windDirection={windDirection}
                    leafWet={leafWet}
                    groundWet={groundWet}
                    irrigationMethod={irrigationMethod}
                    activity={wildlife}
                  />
                </Suspense>
              ) : (
                <>
                  <Ground waterLevel={waterLevel} soilWetness={soilWetness} surfaceWet={groundWet} growth={growth} windStrength={windStrength} />
                  <Crop growth={growth} windStrength={windStrength} windDirection={windDirection} wet={leafWet} anthesis={anthesis} />
                </>
              )}
              <ScaleFigures viewFrom={framing.viewFrom} />
              <Backdrop />
              <Landscape />
              <Rain intensity={rain} windDirection={windDirection} windSpeedKmh={windKmh} />
              {!upland && <Splashes intensity={rain} />}
              <Fireflies visibility={fireflies} />
              <LifeLayer
                activity={wildlife}
                canopyHeight={upland && uplandVisual ? upland.heightM * uplandVisual.scale * uplandVisual.presence : growth.heightM * growth.presence}
                wading={!upland && (state.standingWater || growth.soilWetness > 0.8)}
                flowers={flowering}
                ripeness={state.stageKey === 'maturity' ? 1 : state.stageKey === 'grain_filling' ? state.stageProgress * 0.6 : 0}
                crop={upland ? 'upland' : 'paddy'}
                viewFrom={framing.viewFrom}
              />
              <OrbitControls
                makeDefault
                enablePan={mode === 'orbit'}
                screenSpacePanning={false}
                enableZoom={mode === 'orbit'}
                enableDamping
                minDistance={framing.minDistance}
                maxDistance={framing.maxDistance}
                minPolarAngle={mode === 'eye' ? 0.7 : 0.35}
                maxPolarAngle={mode === 'eye' ? 1.8 : 1.45}
                autoRotate={!reducedMotion && mode === 'orbit'}
                autoRotateSpeed={0.12}
                rotateSpeed={mode === 'eye' ? -0.35 : 0.6}
                zoomSpeed={0.8}
              />
              <CameraRig framing={framing} />
              <Effects fx={fx} shape={shape} mode={mode} depthOfField={depthOfField} />
            </FieldContext.Provider>
          </SceneSettingsContext.Provider>
        </Canvas>
      </WebGLBoundary>
      <ScaleLabel shape={shape} mode={mode} onToggle={() => setMode((m) => (m === 'orbit' ? 'eye' : 'orbit'))} />
    </div>
  );
}

const fmt = (n: number, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

/** Dimensions of the drawn field so the scale is explicit, plus the eye-level toggle. */
function ScaleLabel({ shape, mode, onToggle }: { shape: FieldShape; mode: ViewMode; onToggle: () => void }) {
  const d = describeShape(shape);
  return (
    <div
      style={{ position: 'absolute', right: 12, bottom: 52, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, pointerEvents: 'none' }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={mode === 'eye'}
        style={{
          pointerEvents: 'auto', font: '600 11px/1 system-ui, sans-serif', color: '#fbf7ee', background: 'rgba(20,28,18,0.55)',
          border: '1px solid rgba(255,255,255,0.25)', borderRadius: 999, padding: '7px 11px', backdropFilter: 'blur(6px)', cursor: 'pointer',
        }}
      >
        {mode === 'eye' ? '⟲ Orbit view' : '👁 Stand on the bund'}
      </button>
      <div
        data-testid="field-scale"
        style={{
          font: '500 11px/1.35 system-ui, sans-serif', color: '#fbf7ee', background: 'rgba(20,28,18,0.55)', borderRadius: 10,
          padding: '6px 10px', textAlign: 'right', backdropFilter: 'blur(6px)',
        }}
      >
        {shape.synthetic ? (
          <>Demo plot · {fmt(d.length)} m × {fmt(d.width)} m</>
        ) : (
          <>
            ≈ {fmt(d.length)} m × {fmt(d.width)} m · {fmt(d.hectares, 2)} ha ({fmt(d.acres, 2)} ac)
            <br />
            <span style={{ opacity: 0.75 }}>True shape &amp; scale of your drawn boundary · figures 1.7 m</span>
          </>
        )}
      </div>
    </div>
  );
}
