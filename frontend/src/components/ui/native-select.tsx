import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shared dropdown look. Every dropdown (native <select>, Radix Select trigger, combobox trigger)
 * uses these classes so height, padding and the chevron's inset stay identical across screens.
 */
export const dropdownVariants = cva(
  'w-full min-w-0 appearance-none truncate border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
  {
    variants: {
      variant: {
        default: 'border-input bg-card text-foreground focus-visible:ring-ring',
        // Translucent dark control for use over imagery (weather sky, 3D scene, maps).
        glass: 'border-white/25 bg-black/30 text-white backdrop-blur-md focus-visible:ring-white/60 [&>option]:text-black',
      },
      size: {
        default: 'h-11 rounded-xl pl-3.5 pr-10 text-sm',
        sm: 'h-9 rounded-lg pl-3 pr-9 text-sm',
        xs: 'h-8 rounded-full pl-3 pr-8 text-xs font-medium',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

/** Chevron position per size; always 16px and vertically centred. */
export const dropdownChevron = cva('pointer-events-none absolute top-1/2 size-4 -translate-y-1/2', {
  variants: {
    variant: { default: 'text-muted-foreground', glass: 'text-white/80' },
    size: { default: 'right-3.5', sm: 'right-3', xs: 'right-2.5' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export interface NativeSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof dropdownVariants> {
  /** Classes for the outer wrapper (width, margins). */
  className?: string
  /** Classes for the <select> itself. */
  selectClassName?: string
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, selectClassName, variant, size, children, ...props }, ref) => (
    <div className={cn('relative w-full min-w-0', className)}>
      <select ref={ref} className={cn(dropdownVariants({ variant, size }), selectClassName)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className={dropdownChevron({ variant, size })} />
    </div>
  ),
)
NativeSelect.displayName = 'NativeSelect'
