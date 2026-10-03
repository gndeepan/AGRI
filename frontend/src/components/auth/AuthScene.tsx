import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { SeasonScene } from './SeasonScene'

const Login3D = lazy(() => import('./login3d/Login3D'))

function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

/** Idle-time gate: the 3D chunk is only requested on wide screens, after first paint. */
function useWants3D() {
  const reduce = useReducedMotion()
  const [wants, setWants] = useState(false)
  useEffect(() => {
    if (reduce || !window.matchMedia('(min-width: 1024px)').matches || !webglOk()) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = idle(() => setWants(true))
    return () => cancel(id as number)
  }, [reduce])
  return wants
}

/**
 * Login-panel scene. The SVG season loop renders immediately as the poster (and permanent fallback
 * for small screens, reduced motion and no-WebGL); the 3D scene loads lazily and cross-fades in.
 */
export function AuthScene({ className }: { className?: string }) {
  const wants3D = useWants3D()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const backdrop = wants3D && !failed ? (
    <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`} aria-hidden>
      <Suspense fallback={null}>
        <ErrorCatch onError={() => setFailed(true)}>
          <Login3D onReady={() => setReady(true)} />
        </ErrorCatch>
      </Suspense>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
    </div>
  ) : null
  return <SeasonScene className={className} backdrop={backdrop} svgHidden={ready && !failed} />
}

class ErrorCatch extends Component<{ children: ReactNode; onError: () => void }, { bad: boolean }> {
  state = { bad: false }
  static getDerivedStateFromError() { return { bad: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.bad ? null : this.props.children }
}
