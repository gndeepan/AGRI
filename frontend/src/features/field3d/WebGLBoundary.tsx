import { Component, type ReactNode } from 'react';

export const WEBGL_FAILED_EVENT = 'bhoomi:webgl-failed';

export function announceWebGLFailure(reason: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WEBGL_FAILED_EVENT, { detail: { reason } }));
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
