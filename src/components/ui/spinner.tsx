import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SpinnerSize = 'sm' | 'md' | 'lg'

const SIZES: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
}

export interface SpinnerProps {
  size?: SpinnerSize
  /** Announced while the region is busy, e.g. "Loading offers". */
  label?: string
  className?: string
}

export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-flex text-muted-foreground', className)}
    >
      <Loader2 aria-hidden="true" className={cn('animate-spin', SIZES[size])} />
    </span>
  )
}
