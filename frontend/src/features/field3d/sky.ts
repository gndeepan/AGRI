import type { RGB } from './growth';

export type DayPhase = 'night' | 'dawn' | 'golden_morning' | 'day' | 'golden_evening' | 'dusk';

export interface Lighting {
  phase: DayPhase;
  /** Unit vector pointing *towards* the sun (y up). */
  sunDir: [number, number, number];
  sunElevationDeg: number;
  /** 0 at night, 1 at full day. */
  daylight: number;
  /** 0 during day, 1 in deep night. */
  night: number;
  sunColor: RGB;
  sunIntensity: number;
  skyColor: RGB;
  groundColor: RGB;
  hemiIntensity: number;
  fogColor: RGB;
  /** drei <Sky> tuning */
  turbidity: number;
  rayleigh: number;
}

const MAX_ELEVATION_DEG = 68; // near-overhead noon sun in the Indian tropics
const DEFAULT_SUNRISE = 6.1;
const DEFAULT_SUNSET = 18.1;

/** Reads the local clock hour from an ISO-like string ("2026-10-02T06:04" or "06:04"). */
export function hourFromTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /(?:T|^)(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h + m / 60;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const SUN_NOON: RGB = [1.0, 0.97, 0.9];
const SUN_GOLD: RGB = [1.0, 0.68, 0.36];
const SUN_LOW: RGB = [1.0, 0.45, 0.25];
const MOON: RGB = [0.55, 0.65, 0.95];
const SKY_DAY: RGB = [0.62, 0.78, 0.96];
const SKY_GOLD: RGB = [0.98, 0.76, 0.56];
const SKY_NIGHT: RGB = [0.05, 0.08, 0.18];
const GROUND_DAY: RGB = [0.42, 0.36, 0.22];
const GROUND_NIGHT: RGB = [0.04, 0.05, 0.08];
const FOG_DAY: RGB = [0.78, 0.85, 0.9];
const FOG_GOLD: RGB = [0.95, 0.78, 0.62];
const FOG_NIGHT: RGB = [0.06, 0.08, 0.14];
const STORM: RGB = [0.42, 0.46, 0.5];

/**
 * Approximate sun path from the local hour and the day's sunrise/sunset.
 * This drives visuals only; it is not an astronomical ephemeris.
 */
export function computeLighting(
  hourOfDay: number,
  sunrise?: string | null,
  sunset?: string | null,
  cloudCover = 0,
  rainIntensity = 0,
): Lighting {
  const rise = hourFromTime(sunrise) ?? DEFAULT_SUNRISE;
  let set = hourFromTime(sunset) ?? DEFAULT_SUNSET;
  if (set <= rise + 1) set = rise + 12;
  const hour = ((hourOfDay % 24) + 24) % 24;
  const dayLength = set - rise;

  // Elevation follows a sine over the daylight period and dips below the horizon at night.
  let elevationDeg: number;
  let azimuth: number; // radians, 0 = east, PI = west
  if (hour >= rise && hour <= set) {
    const f = (hour - rise) / dayLength;
    elevationDeg = Math.sin(Math.PI * f) * MAX_ELEVATION_DEG;
    azimuth = Math.PI * f;
  } else {
    const nightLength = 24 - dayLength;
    const sinceSet = (hour - set + 24) % 24;
    const f = sinceSet / nightLength;
    elevationDeg = -Math.sin(Math.PI * f) * 40;
    azimuth = Math.PI + Math.PI * f;
  }

  const el = (elevationDeg * Math.PI) / 180;
  const sunDir: [number, number, number] = [Math.cos(azimuth) * Math.cos(el), Math.sin(el), -0.35 * Math.cos(el)];
  const len = Math.hypot(...sunDir);
  sunDir[0] /= len; sunDir[1] /= len; sunDir[2] /= len;

  const morning = hour < (rise + set) / 2;
  let phase: DayPhase;
  if (elevationDeg < -6) phase = 'night';
  else if (elevationDeg < 0) phase = morning ? 'dawn' : 'dusk';
  else if (elevationDeg < 12) phase = morning ? 'golden_morning' : 'golden_evening';
  else phase = 'day';

  const daylight = smooth(-8, 10, elevationDeg);
  const night = 1 - smooth(-12, -2, elevationDeg);
  const golden = smooth(-4, 3, elevationDeg) * (1 - smooth(8, 22, elevationDeg));

  const overcast = clamp01(cloudCover * 0.75 + rainIntensity * 0.6);

  let sunColor = mix(SUN_NOON, SUN_GOLD, golden);
  if (elevationDeg < 3) sunColor = mix(sunColor, SUN_LOW, smooth(3, -2, elevationDeg));
  if (daylight < 0.05) sunColor = MOON;
  const sunIntensity = daylight > 0.05 ? lerp(0.15, 2.5, daylight) * (1 - 0.75 * overcast) : 0.85 * night;

  let skyColor = mix(mix(SKY_NIGHT, SKY_DAY, daylight), SKY_GOLD, golden * 0.7);
  skyColor = mix(skyColor, mix(SKY_NIGHT, STORM, daylight), overcast * 0.7);
  const groundColor = mix(GROUND_NIGHT, GROUND_DAY, daylight);
  let fogColor = mix(mix(FOG_NIGHT, FOG_DAY, daylight), FOG_GOLD, golden * 0.8);
  fogColor = mix(fogColor, mix(FOG_NIGHT, STORM, daylight), overcast * 0.6);

  return {
    phase,
    sunDir,
    sunElevationDeg: elevationDeg,
    daylight,
    night,
    sunColor,
    sunIntensity,
    skyColor,
    groundColor,
    hemiIntensity: lerp(0.32, 0.85, daylight) * (1 - 0.3 * overcast),
    fogColor,
    turbidity: lerp(4, 14, overcast) + golden * 4,
    rayleigh: lerp(0.6, 3, golden) * (1 - 0.6 * overcast) + 0.2,
  };
}
