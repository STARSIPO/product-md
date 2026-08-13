import * as React from 'react'
import { AlertCircle, Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        aria-invalid={invalid ? true : undefined}
        className={cn(
          'peer h-5 w-5 cursor-pointer appearance-none rounded-sm border border-input bg-card transition-colors duration-150 checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted',
          invalid && 'border-destructive',
          className,
        )}
        {...props}
      />
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute h-3.5 w-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100"
      />
    </span>
  )
})

export interface CheckboxFieldProps extends CheckboxProps {
  label: string
  hint?: string
  error?: string
  /** Wrapper classes; `className` still targets the input itself. */
  rowClassName?: string
}

export const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(
  function CheckboxField(
    {
      label,
      hint,
      error,
      id,
      rowClassName,
      className,
      invalid,
      'aria-describedby': describedBy,
      ...props
    },
    ref,
  ) {
    const hintId = id && hint && !error ? `${id}-hint` : undefined
    const errorId = id && error ? `${id}-error` : undefined
    const description = [describedBy, hintId, errorId].filter(Boolean).join(' ') || undefined

    return (
      <div className={cn('w-full', rowClassName)}>
        <label
          htmlFor={id}
          className="flex min-h-[44px] cursor-pointer items-center gap-3 py-1.5 text-sm text-foreground"
        >
          <Checkbox
            ref={ref}
            id={id}
            className={className}
            invalid={invalid === true || error !== undefined}
            aria-describedby={description}
            {...props}
          />
          <span className="min-w-0">
            <span className="block font-medium">{label}</span>
            {hint && !error ? (
              <span id={hintId} className="mt-0.5 block text-caption text-muted-foreground">
                {hint}
              </span>
            ) : null}
          </span>
        </label>
        {error ? (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="mt-1 flex items-start gap-1.5 text-caption text-destructive"
          >
            <AlertCircle aria-hidden="true" className="mt-[2px] h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    )
  },
)
