import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { LiveSky } from './LiveSky'
import { PRESETS, presetParams } from './presets'
import { weatherAudio } from './thunder'
import { eventInSlot } from './lightning'

/** A renderer time at which a ground strike is mid-flash, for `?bolt=1` stills. */
function boltTime(seed: number): number | undefined {
  for (let slot = 0; slot < 200; slot++) {
    const e = eventInSlot(seed, 1, slot)
    if (e?.kind === 'bolt') return e.t0 + 0.012
  }
  return undefined
}

/** Dev-only gallery of every sky state (synthetic inputs). Route: /dev/sky[?only=<key>][&bolt=1] */
export default function SkyGallery() {
  const [search] = useSearchParams()
  const only = search.get('only')
  const bolt = search.get('bolt') === '1'
  const [sound, setSound] = useState(false)
  const list = only ? PRESETS.filter((p) => p.key === only) : PRESETS
  return (
    <div className="min-h-dvh bg-neutral-950 p-4 text-neutral-100">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span>Live sky gallery · synthetic conditions, Thanjavur</span>
        <button
          type="button"
          className="rounded-full border border-white/30 px-3 py-1"
          onClick={() => {
            if (!sound) weatherAudio()?.resume()
            else weatherAudio()?.suspend()
            setSound(!sound)
          }}
        >
          Sound: {sound ? 'on' : 'off'}
        </button>
      </div>
      <div className={only ? '' : 'grid grid-cols-2 gap-3 lg:grid-cols-5'}>
        {list.map((p) => (
          <div key={p.key} className="relative overflow-hidden rounded-2xl">
            <LiveSky params={presetParams(p.key)} glass sound={sound} fixedTime={bolt && p.key === 'thunderstorm' ? boltTime(presetParams(p.key).seed) : undefined} className={only ? 'h-[80dvh] w-full' : 'aspect-[3/4] w-full'} />
            <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-xs backdrop-blur">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
