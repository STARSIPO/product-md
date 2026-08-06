import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor?: string
  children: ReactNode
  className?: string
}

/**
 * The single form row used everywhere. Ids follow `${htmlFor}-hint` / `${htmlFor}-error`
 * so the control can point at them with aria-describedby without this component
 * needing a hook (which would force it to become a client component).
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  children,
  className,
}: FieldProps) {
  const hintId = htmlFor !== undefined && hint !== undefined ? `${htmlFor}-hint` : undefined
  const errorId = htmlFor !== undefined && error !== undefined ? `${htmlFor}-error` : undefined

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error !== undefined ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="mt-1.5 flex items-start gap-1.5 text-caption text-destructive"
        >
          <AlertCircle aria-hidden="true" className="mt-[2px] h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint !== undefined ? (
        <p id={hintId} className="mt-1.5 text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export interface FieldSetProps {
  legend: string
  description?: string
  children: ReactNode
  className?: string
}

export function FieldSet({ legend, description, children, className }: FieldSetProps) {
  return (
    <fieldset className={cn('min-w-0 border-0 p-0', className)}>
      <legend className="mb-1 p-0 text-sm font-medium text-foreground">{legend}</legend>
      {description ? (
        <p className="mb-3 text-caption text-muted-foreground">{description}</p>
      ) : null}
      <div className={cn('space-y-3', description ? undefined : 'mt-2')}>{children}</div>
    </fieldset>
  )
}
