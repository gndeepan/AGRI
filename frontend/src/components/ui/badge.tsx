import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide', {
  variants: {
    variant: {
      default: 'border-transparent bg-paddy-100 text-paddy-800 dark:bg-paddy-800 dark:text-paddy-100',
      gold: 'border-transparent bg-sun-300/50 text-soil-800 dark:bg-sun-600/30 dark:text-sun-300',
      sky: 'border-transparent bg-sky-soft text-sky-deep dark:bg-sky-deep/30 dark:text-sky-soft',
      soil: 'border-transparent bg-soil-100 text-soil-700 dark:bg-soil-800 dark:text-soil-100',
      outline: 'border-border text-muted-foreground',
      warn: 'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
      danger: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
