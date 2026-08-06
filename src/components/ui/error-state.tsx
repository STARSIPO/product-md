import { AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from './button'

export interface ErrorStateProps {
  /** Already humanised copy — never a raw exception message. */
  title: string
  description: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
    >
      <span
        aria-hidden="true"
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft text-destructive"
      >
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {onRetry && retryLabel ? (
        <Button variant="outline" onClick={onRetry} className="mt-5">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
