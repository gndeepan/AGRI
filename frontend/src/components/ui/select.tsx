import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { dropdownChevron, dropdownVariants } from './native-select'

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & VariantProps<typeof dropdownVariants>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(dropdownVariants({ variant, size }), 'relative flex items-center data-[placeholder]:text-muted-foreground', className)}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden className={dropdownChevron({ variant, size })} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={6}
        className={cn('z-50 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl', className)}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-72">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center rounded-lg py-2 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-muted',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
