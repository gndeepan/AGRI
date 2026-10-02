import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MapLayer = 'satellite' | 'street' | 'terrain'

interface UiState {
  mapLayer: MapLayer
  soundEnabled: boolean
  sceneQuality: 'auto' | 'low' | 'high'
  setMapLayer: (l: MapLayer) => void
  setSoundEnabled: (v: boolean) => void
  setSceneQuality: (q: 'auto' | 'low' | 'high') => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      mapLayer: 'street',
      soundEnabled: false,
      sceneQuality: 'auto',
      setMapLayer: (mapLayer) => set({ mapLayer }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setSceneQuality: (sceneQuality) => set({ sceneQuality }),
    }),
    { name: 'bhoomi-ui' },
  ),
)
