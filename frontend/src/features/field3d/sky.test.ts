import { describe, expect, it } from 'vitest';
import { computeLighting, hourFromTime, sceneLightingFromSky } from './sky';

describe('hourFromTime', () => {
  it('parses ISO datetimes and plain times', () => {
    expect(hourFromTime('2026-10-02T06:30')).toBeCloseTo(6.5);
    expect(hourFromTime('18:15')).toBeCloseTo(18.25);
    expect(hourFromTime(null)).toBeNull();
    expect(hourFromTime('garbage')).toBeNull();
  });
});

describe('computeLighting', () => {
  const rise = '2026-10-02T06:00';
  const set = '2026-10-02T18:00';

  it('puts the sun highest at solar noon', () => {
    const noon = computeLighting(12, rise, set);
    expect(noon.phase).toBe('day');
    expect(noon.sunElevationDeg).toBeGreaterThan(60);
    expect(noon.daylight).toBeCloseTo(1, 2);
  });

  it('is night at midnight', () => {
    const midnight = computeLighting(0, rise, set);
    expect(midnight.phase).toBe('night');
    expect(midnight.night).toBeGreaterThan(0.9);
    expect(midnight.sunDir[1]).toBeLessThan(0);
  });

  it('has golden phases just after sunrise and before sunset', () => {
    expect(computeLighting(6.5, rise, set).phase).toBe('golden_morning');
    expect(computeLighting(17.5, rise, set).phase).toBe('golden_evening');
  });

  it('dims the sun under heavy cloud and rain', () => {
    const clear = computeLighting(12, rise, set, 0, 0);
    const storm = computeLighting(12, rise, set, 1, 1);
    expect(storm.sunIntensity).toBeLessThan(clear.sunIntensity * 0.4);
  });
});

describe('sceneLightingFromSky', () => {
  const rad = (d: number) => (d * Math.PI) / 180;
  it('classifies day, golden hours and night from the real sun position', () => {
    expect(sceneLightingFromSky({ sunElevation: rad(60), sunAzimuth: rad(170) }).phase).toBe('day');
    expect(sceneLightingFromSky({ sunElevation: rad(6), sunAzimuth: rad(95) }).phase).toBe('golden_morning');
    expect(sceneLightingFromSky({ sunElevation: rad(6), sunAzimuth: rad(265) }).phase).toBe('golden_evening');
    const night = sceneLightingFromSky({ sunElevation: rad(-30), sunAzimuth: rad(0) });
    expect(night.phase).toBe('night');
    expect(night.night).toBeCloseTo(1, 2);
    expect(night.daylight).toBeCloseTo(0, 2);
  });
});
