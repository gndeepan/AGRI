import { create } from 'zustand'

/** Shared simulation clock for the virtual field + timeline. Position is a fractional day index. */
interface SimState {
  position: number // days from timeline start, fractional part = time of day
  playing: boolean
  speed: number // simulated days per real second
  setPosition: (p: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
}

export const useSimulation = create<SimState>((set) => ({
  position: 0,
  playing: false,
  // Must be one of the timeline's speed options (0.25, 1, 3, 7), or the menu shows one speed while playback uses another.
  speed: 0.25,
  setPosition: (position) => set({ position }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
}))
