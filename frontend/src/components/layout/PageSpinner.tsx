import { Sprout } from 'lucide-react'

export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center" role="status" aria-live="polite">
      <Sprout className="size-8 animate-pulse text-paddy-500" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
