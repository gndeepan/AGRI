import { useSearchParams } from 'react-router'
import Login3D from './Login3D'
import type { Tier } from './tier'

/** Dev-only: /dev/login-scene?season=0.1&tier=high renders the 3D scene frozen at one moment. */
export default function LoginScenePreview() {
  const [q] = useSearchParams()
  const season = q.get('season')
  const tier = q.get('tier') as Tier | null
  return (
    <div className="relative h-dvh w-full bg-black">
      <Login3D fixedSeason={season === null ? undefined : Number(season)} tier={tier ?? undefined} />
    </div>
  )
}
