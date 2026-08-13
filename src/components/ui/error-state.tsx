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
      className={cn('flex flex-col items-center px-6 py-14 text-center', className)}
    >
      <span
        aria-hidden="true"
        className="icon-chip mb-5 h-12 w-12 bg-destructive-soft text-destructive"
      >
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h2 className="text-h3">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {onRetry && retryLabel ? (
        <Button variant="outline" onClick={onRetry} className="mt-6">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
