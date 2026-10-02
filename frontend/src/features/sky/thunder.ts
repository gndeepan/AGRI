/**
 * Procedural weather audio with WebAudio — no sound files. Thunder arrives after a delay set by
 * the simulated strike distance (speed of sound ≈ 343 m/s); a soft rain bed follows rain intensity.
 * The AudioContext is only created from a user gesture (browser autoplay policy).
 */

const STORAGE_KEY = 'bhoomi.sky.sound'

export function loadSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveSoundPreference(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    /* storage unavailable: keep the in-memory choice only */
  }
}

let shared: WeatherAudio | null = null

/** One audio engine for the page, created on first use (call from a click handler). */
export function weatherAudio(): WeatherAudio | null {
  if (shared) return shared
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  shared = new WeatherAudio(new Ctx())
  return shared
}

export class WeatherAudio {
  private master: GainNode
  private rainGain: GainNode
  private rainSource: AudioBufferSourceNode | null = null
  private noise: AudioBuffer
  private brown: AudioBuffer
  private scheduled = new Set<number>()

  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(ctx.destination)
    this.rainGain = ctx.createGain()
    this.rainGain.gain.value = 0
    this.noise = this.makeNoise(false)
    this.brown = this.makeNoise(true)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 900
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 7000
    this.rainGain.connect(hp).connect(lp).connect(this.master)
  }

  private makeNoise(brown: boolean): AudioBuffer {
    const len = this.ctx.sampleRate * 4
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      if (brown) {
        last = (last + 0.02 * white) / 1.02
        d[i] = last * 3.5
      } else d[i] = white
    }
    return buf
  }

  resume() {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  suspend() {
    this.setRain(0)
    if (this.ctx.state === 'running') void this.ctx.suspend()
  }

  /** Continuous rain bed, 0..1. */
  setRain(intensity: number) {
    const now = this.ctx.currentTime
    if (intensity > 0 && !this.rainSource) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      src.connect(this.rainGain)
      src.start()
      this.rainSource = src
    }
    this.rainGain.gain.setTargetAtTime(intensity * 0.16, now, 0.8)
    if (intensity === 0 && this.rainSource) {
      const src = this.rainSource
      this.rainSource = null
      src.stop(now + 3)
    }
  }

  /** Thunder for a lightning event; `key` de-duplicates repeated frames of the same event. */
  thunder(key: number, distanceKm: number, strength = 1) {
    if (this.scheduled.has(key)) return
    this.scheduled.add(key)
    if (this.scheduled.size > 64) this.scheduled.clear()
    const delay = Math.min(4, Math.max(0.5, (distanceKm * 1000) / 343))
    const t0 = this.ctx.currentTime + delay
    const near = 1 - Math.min(1, distanceKm / 1.5)

    // Crack: short bright burst, only for close strikes.
    if (near > 0.35) {
      const crack = this.ctx.createBufferSource()
      crack.buffer = this.noise
      const f = this.ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1800
      f.Q.value = 0.7
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.5 * near * strength, t0 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35)
      crack.connect(f).connect(g).connect(this.master)
      crack.start(t0, Math.random() * 3, 0.4)
    }

    // Rumble: low brown noise with a rolling envelope.
    const rumble = this.ctx.createBufferSource()
    rumble.buffer = this.brown
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(260 + near * 300, t0)
    lp.frequency.exponentialRampToValueAtTime(90, t0 + 4)
    const g = this.ctx.createGain()
    const peak = (0.55 + 0.45 * near) * strength
    const dur = 3.5 + (1 - near) * 3
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.08 + (1 - near) * 0.5)
    for (let i = 1; i < 6; i++) g.gain.linearRampToValueAtTime(peak * (0.4 + Math.random() * 0.6) * (1 - i / 7), t0 + (dur * i) / 6)
    g.gain.linearRampToValueAtTime(0, t0 + dur)
    rumble.connect(lp).connect(g).connect(this.master)
    rumble.start(t0, Math.random() * 2, dur + 0.2)
  }
}
