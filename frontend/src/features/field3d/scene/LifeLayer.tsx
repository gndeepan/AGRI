import { useMemo } from 'react';
import { useSceneSettings } from '../quality';
import { useField } from './FieldContext';
import { Wildlife } from './Wildlife';
import { Bees } from './wildlife/Bees';
import { Egrets } from './wildlife/Egrets';
import { Farmer } from './wildlife/Farmer';
import { Drongo, Mynas, Parakeets } from './wildlife/Perchers';

export interface LifeLayerProps {
  /** 0..1 daylight × fair weather: animals and people are out. */
  activity: number;
  canopyHeight: number;
  /** Standing water / wet paddy: egrets wade and feed. */
  wading: boolean;
  /** 0..1 open flowers (non-paddy crops): more butterflies and bees. */
  flowers?: number;
  /** 0..1 maturity: parakeets and mynas come for ripe grain. */
  ripeness?: number;
  /** 'paddy' (flooded/wet) or 'upland' (dry crops). */
  crop?: 'paddy' | 'upland';
  /** Where the viewer stands (scene metres): the farmer first appears near here. */
  viewFrom?: [number, number];
}

/** All living things in the field scene: the farmer, birds and insects. */
export function LifeLayer({ activity, canopyHeight, wading, flowers = 0, ripeness = 0, viewFrom }: LifeLayerProps) {
  const { quality } = useSceneSettings();
  const { shape } = useField();
  // Same field → same farmer and animals on every visit.
  const seed = useMemo(() => 1 + (Math.floor(Math.abs(shape.center[0] * 13.7 + shape.center[1] * 7.3) * 10) % 9973), [shape]);
  // Birds roost at night and shelter in rain; the farmer has his own (lower) threshold in Farmer.
  const birdsOut = activity >= 0.08;
  // Dev-only A/B switch for profiling: window.__bhoomiNoLife = true (needs a re-mount, e.g. toggling quality).
  if (import.meta.env.DEV && (window as unknown as { __bhoomiNoLife?: boolean }).__bhoomiNoLife) return null;
  return (
    <>
      <Wildlife activity={activity} canopyHeight={canopyHeight} butterflies={flowers} />
      {birdsOut && flowers > 0.15 && <Bees count={quality === 'high' ? 6 : 2} canopyHeight={canopyHeight} />}
      {birdsOut && wading && canopyHeight < 0.6 && <Egrets count={quality === 'high' ? 5 : 3} seed={seed % 97} />}
      {birdsOut && <Mynas count={quality === 'high' ? 3 : 1} seed={seed % 89} />}
      {birdsOut && <Parakeets count={quality === 'high' ? 3 : 1} seed={seed % 83} canopyHeight={canopyHeight} ripeness={ripeness} />}
      {birdsOut && quality === 'high' && <Drongo seed={seed % 31} />}
      {quality === 'high' && <Farmer seed={seed} activity={activity} viewFrom={viewFrom} />}
    </>
  );
}
