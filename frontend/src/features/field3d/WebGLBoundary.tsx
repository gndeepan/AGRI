import { Component, type ReactNode } from 'react';

export const WEBGL_FAILED_EVENT = 'bhoomi:webgl-failed';

export function announceWebGLFailure(reason: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WEBGL_FAILED_EVENT, { detail: { reason } }));
}

/**
 * Reports a lost WebGL context as a failure only when it is a real one. React Three Fiber deliberately
 * drops the context of a canvas it unmounts (closing the single-plant view, leaving the page): that
 * canvas is no longer in the document. A context the browser restores within a few seconds (GPU reset,
 * memory pressure while a second canvas was open) is not a failure either.
 */
export function watchContextLoss(canvas: HTMLCanvasElement, restoreWaitMs = 3000): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (canvas.isConnected) announceWebGLFailure('context_lost');
    }, restoreWaitMs);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (timer) clearTimeout(timer);
    timer = null;
  });
}

interface State { failed: boolean }

/** Renders nothing if the 3D scene throws, and tells the app to show its 2D fallback. */
export class WebGLBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    announceWebGLFailure(error instanceof Error ? error.message : 'unknown');
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
