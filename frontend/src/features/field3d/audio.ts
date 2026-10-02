import { useEffect, useRef } from 'react';
import { mulberry32 } from './prng';

export interface AmbientMix {
  daylight: number; // 0..1
  night: number; // 0..1
  rain: number; // 0..1
  wind: number; // 0..1
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  wind: GainNode;
  windFilter: BiquadFilterNode;
  rain: GainNode;
  crickets: GainNode;
  birds: GainNode;
  timer: number;
}

function noiseBuffer(ctx: AudioContext, brown: boolean): AudioBuffer {
  const length = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = mulberry32(brown ? 1 : 2);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = rand() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

function loopNoise(ctx: AudioContext, brown: boolean): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, brown);
  src.loop = true;
  src.start();
  return src;
}

function build(): Graph | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2); // fade in

  // Wind: brown noise through a slowly breathing low-pass.
  const wind = ctx.createGain();
  wind.gain.value = 0;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 400;
  loopNoise(ctx, true).connect(windFilter).connect(wind).connect(master);

  // Rain: white noise, band-passed to a soft hiss.
  const rain = ctx.createGain();
  rain.gain.value = 0;
  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.value = 2400;
  rainFilter.Q.value = 0.6;
  loopNoise(ctx, false).connect(rainFilter).connect(rain).connect(master);

  // Crickets: a high tone gated by a pulse LFO.
  const crickets = ctx.createGain();
  crickets.gain.value = 0;
  const chirp = ctx.createOscillator();
  chirp.frequency.value = 4400;
  const gate = ctx.createGain();
  gate.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 14;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth).connect(gate.gain);
  chirp.connect(gate).connect(crickets).connect(master);
  chirp.start();
  lfo.start();

  // Birds: short frequency-swept chirps scheduled on a timer.
  const birds = ctx.createGain();
  birds.gain.value = 0;
  birds.connect(master);
  const rand = mulberry32(9);
  const timer = window.setInterval(() => {
    if (birds.gain.value < 0.01) return;
    const now = ctx.currentTime;
    const notes = 2 + Math.floor(rand() * 4);
    const base = 2200 + rand() * 1800;
    for (let n = 0; n < notes; n++) {
      const t0 = now + n * (0.09 + rand() * 0.05);
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.exponentialRampToValueAtTime(base * (1.3 + rand() * 0.5), t0 + 0.07);
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(0.12, t0 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      osc.connect(env).connect(birds);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    }
  }, 1700);

  return { ctx, master, wind, windFilter, rain, crickets, birds, timer };
}

/**
 * Procedural ambience (no audio files). Only runs while `enabled`; the
 * AudioContext is created lazily so turning sound on counts as the user gesture.
 */
export function useAmbientSound(enabled: boolean, mix: AmbientMix): void {
  const graph = useRef<Graph | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const g = build();
    graph.current = g;
    void g?.ctx.resume();
    return () => {
      if (!g) return;
      window.clearInterval(g.timer);
      g.master.gain.setTargetAtTime(0, g.ctx.currentTime, 0.2);
      const ctx = g.ctx;
      window.setTimeout(() => void ctx.close(), 600);
      graph.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    const g = graph.current;
    if (!g) return;
    const now = g.ctx.currentTime;
    const ease = 1.5;
    g.wind.gain.setTargetAtTime(0.05 + mix.wind * 0.35, now, ease);
    g.windFilter.frequency.setTargetAtTime(250 + mix.wind * 900, now, ease);
    g.rain.gain.setTargetAtTime(mix.rain * 0.4, now, ease);
    g.crickets.gain.setTargetAtTime(mix.night * (1 - mix.rain) * 0.03, now, ease);
    g.birds.gain.setTargetAtTime(mix.daylight * (1 - mix.rain) * 0.6, now, ease);
  }, [enabled, mix.daylight, mix.night, mix.rain, mix.wind]);
}
