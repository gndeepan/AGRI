import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { SkyParams } from './params'
import { fallbackGradient } from './palette'
import { createSkyRenderer } from './renderer'
import { weatherAudio } from './thunder'

export interface LiveSkyProps {
  params: SkyParams
  /** Raindrops on glass when it is raining (or just has). */
  glass?: boolean
  /** Thunder + rain audio. Only audible after the user enabled it with a click. */
  sound?: boolean
  /** Freeze the animation at this renderer time in seconds (previews, screenshots). */
  fixedTime?: number
  className?: string
}

/** Fraction of device resolution to render at; the sky is soft, so this is invisible but ~3x cheaper. */
const RESOLUTION = 0.6
const MAX_PIXELS = 900_000

/**
 * Live weather sky. One rAF loop draws the WebGL scene; rendering pauses when the element is
 * off-screen or the tab is hidden. Falls back to a CSS gradient of the same colours when WebGL2
 * is unavailable or the context is lost.
 */
export function LiveSky({ params, glass = true, sound = false, fixedTime, className }: LiveSkyProps) {
  const reduce = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({ params, glass, sound })
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    live.current = { params, glass, sound }
  }, [params, glass, sound])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: ReturnType<typeof createSkyRenderer> = null
    try {
      renderer = createSkyRenderer(canvas)
    } catch (err) {
      console.warn('[sky] renderer unavailable, using gradient fallback', err)
    }
    if (!renderer) {
      setFailed(true)
      return
    }
    const r = renderer
    const frozen = !!reduce || fixedTime !== undefined
    let raf = 0
    let visible = true
    let quality = 1
    let slow = 0
    let last = performance.now()
    const start = last

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * RESOLUTION
      let w = Math.max(2, Math.round(canvas.clientWidth * dpr))
      let h = Math.max(2, Math.round(canvas.clientHeight * dpr))
      const over = (w * h) / MAX_PIXELS
      if (over > 1) {
        w = Math.round(w / Math.sqrt(over))
        h = Math.round(h / Math.sqrt(over))
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    const draw = (now: number) => {
      const { params: p, glass: g, sound: s } = live.current
      if (r.lost) {
        setFailed(true)
        return
      }
      resize()
      const frame = r.render(p, fixedTime ?? (now - start) / 1000, { glass: g, still: !!reduce, quality })
      if (s && frame.lightning) weatherAudio()?.thunder(frame.lightning.t0, frame.lightning.distanceKm)
      // Adaptive particle budget: back off if frames are consistently slow.
      const dt = now - last
      last = now
      slow = dt > 34 ? slow + 1 : Math.max(0, slow - 1)
      if (slow > 30 && quality > 0.4) {
        quality -= 0.2
        slow = 0
      }
    }

    const loop = (now: number) => {
      draw(now)
      if (visible && !frozen) raf = requestAnimationFrame(loop)
    }
    const startLoop = () => {
      cancelAnimationFrame(raf)
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const sync = (onScreen: boolean) => {
      const next = onScreen && document.visibilityState === 'visible'
      if (next && !visible) {
        visible = true
        startLoop()
      } else if (!next) {
        visible = false
        cancelAnimationFrame(raf)
      }
    }
    let onScreen = true
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      sync(onScreen)
    })
    io.observe(canvas)
    const onVis = () => sync(onScreen)
    document.addEventListener('visibilitychange', onVis)
    const ro = new ResizeObserver(() => {
      if (frozen) startLoop()
    })
    ro.observe(canvas)
    canvas.addEventListener('bhoomi:sky-redraw', startLoop)
    startLoop()

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      canvas.removeEventListener('bhoomi:sky-redraw', startLoop)
      document.removeEventListener('visibilitychange', onVis)
      r.dispose()
    }
  }, [reduce, fixedTime])

  // With reduced motion there is no loop, so redraw the still frame when inputs change.
  useEffect(() => {
    if (!reduce && fixedTime === undefined) return
    const canvas = canvasRef.current
    if (canvas) canvas.dispatchEvent(new Event('bhoomi:sky-redraw'))
  }, [reduce, fixedTime, params, glass])

  // Rain bed follows intensity while sound is on.
  useEffect(() => {
    if (!sound) return
    const audio = weatherAudio()
    audio?.resume()
    audio?.setRain(reduce ? 0 : params.rainIntensity)
    return () => audio?.setRain(0)
  }, [sound, params.rainIntensity, reduce])

  return (
    <div className={cn('overflow-hidden', className)} style={{ background: fallbackGradient(params) }} aria-hidden>
      {!failed && <canvas ref={canvasRef} className="block h-full w-full" />}
    </div>
  )
}
