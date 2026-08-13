import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { controlBaseClasses, controlInvalidClasses } from './input'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  /** Classes for the positioning wrapper that holds the chevron. */
  wrapperClassName?: string
}

/**
 * Deliberately a native <select>: it gives the correct mobile picker, the right
 * keyboard on every platform and complete assistive-technology support for free.
 * Only the chevron is ours — the popup stays the operating system's.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, wrapperClassName, invalid = false, children, ...props },
  ref,
) {
  return (
    <span className={cn('relative block w-full', wrapperClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          controlBaseClasses,
          'h-11 appearance-none py-0 pl-3.5 pr-10',
          invalid && controlInvalidClasses,
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  )
})
