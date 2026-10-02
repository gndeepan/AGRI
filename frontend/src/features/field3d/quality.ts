import { createContext, useContext, useEffect, useState } from 'react';

export type ResolvedQuality = 'low' | 'high';

interface NavigatorWithMemory extends Navigator { deviceMemory?: number }

/** Picks a render tier from device hints. Errs towards 'low' on phones and modest hardware. */
export function detectQuality(): ResolvedQuality {
  if (typeof window === 'undefined') return 'low';
  const nav = navigator as NavigatorWithMemory;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const fewCores = (nav.hardwareConcurrency ?? 4) <= 4;
  const lowMemory = (nav.deviceMemory ?? 8) <= 4;
  const lowDpr = (window.devicePixelRatio ?? 1) < 1;
  return (coarse && small) || fewCores || lowMemory || lowDpr ? 'low' : 'high';
}

export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && (window.matchMedia?.(query).matches ?? false),
  );
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export interface SceneSettings {
  quality: ResolvedQuality;
  reducedMotion: boolean;
}

export const SceneSettingsContext = createContext<SceneSettings>({ quality: 'low', reducedMotion: false });
export const useSceneSettings = () => useContext(SceneSettingsContext);

/** Scene time that stands still when the user prefers reduced motion. */
export function sceneTime(elapsed: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : elapsed;
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
