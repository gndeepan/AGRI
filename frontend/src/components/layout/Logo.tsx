import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2.5', className)} aria-label="Bhoomi AI">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#1f3a2b" />
        <path d="M32 50c0-14 6-24 18-28-2 12-8 22-18 28z" fill="#c9a24a" />
        <path d="M32 50c0-12-5-20-15-24 1 10 6 19 15 24z" fill="#7fb069" />
        <path d="M32 52V20" stroke="#f3ead2" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className={cn('font-display text-xl font-semibold tracking-tight', light && 'text-soil-50')}>
        Bhoomi<span className="text-sun-500"> AI</span>
      </span>
    </Link>
  )
}
