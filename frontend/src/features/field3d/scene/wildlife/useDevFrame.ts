import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type * as THREE from 'three';

/**
 * Dev-only helper (stripped from production builds): registers `window[name](index, dist, height, azimuthDeg)`,
 * which puts the orbit camera beside one animated group so it can be checked up close.
 */
export function useDevFrame(name: string, groups: React.MutableRefObject<Array<THREE.Group | null>>) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w[name] = (i = 0, dist = 1.2, height = 0.3, az = 40) => {
      const rig = groups.current[i]?.children[0];
      if (!rig || !controls) return;
      const a = rig.rotation.y + (az * Math.PI) / 180;
      camera.position.set(rig.position.x + Math.sin(a) * dist, rig.position.y + height, rig.position.z + Math.cos(a) * dist);
      controls.target.copy(rig.position);
      controls.update();
    };
    return () => { delete w[name]; };
  }, [camera, controls, groups, name]);
}
