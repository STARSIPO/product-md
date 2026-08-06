import * as React from 'react'

import { cn } from '@/lib/utils'

export const controlBaseClasses =
  'w-full rounded-md border border-input bg-card text-base text-foreground transition-colors duration-150 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'

export const controlInvalidClasses = 'border-destructive focus-visible:border-destructive'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid ? true : undefined}
      className={cn(
        controlBaseClasses,
        'h-[42px] px-3',
        invalid && controlInvalidClasses,
        className,
      )}
      {...props}
    />
  )
})
