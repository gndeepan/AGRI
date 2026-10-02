import { setWorkerUrl } from 'maplibre-gl'
// MapLibre v6 resolves its worker relative to its own module URL, which breaks once Vite
// pre-bundles the library into .vite/deps. Hand it a Vite-built module worker instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
