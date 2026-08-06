import * as React from 'react'

import { cn } from '@/lib/utils'
import { controlBaseClasses, controlInvalidClasses } from './input'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid ? true : undefined}
      className={cn(
        controlBaseClasses,
        'min-h-[96px] resize-y px-3 py-2.5 leading-relaxed',
        invalid && controlInvalidClasses,
        className,
      )}
      {...props}
    />
  )
})
