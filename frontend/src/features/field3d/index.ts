import { lazy } from 'react';

export type { FieldVisualState, GrowthStageKey, VirtualFieldProps } from './types';
export { growthParams, STAGE_ORDER } from './growth';

/** Lazily loaded so three.js only ships on screens that show the field. */
export const VirtualField = lazy(() => import('./VirtualFieldCanvas'));

/** True when the browser can create a WebGL context. Callers should render a 2D fallback otherwise. */
export function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return gl !== null;
  } catch {
    return false;
  }
}
