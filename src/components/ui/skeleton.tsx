import { cn } from '@/lib/utils'

export interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('skeleton h-4 w-full', className)} />
}

export interface SkeletonTextProps extends SkeletonProps {
  lines?: number
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div aria-hidden="true" className={cn('space-y-2', className)}>
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full'} />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-lg border border-border bg-card p-5 shadow-card', className)}
    >
      <Skeleton className="h-5 w-2/5" />
      <SkeletonText lines={3} className="mt-4" />
    </div>
  )
}

export function SkeletonProductCard({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card shadow-card',
        className,
      )}
    >
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-5 w-4/5" />
        <div className="flex items-center justify-between gap-3 pt-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  )
}

export interface SkeletonTableProps extends SkeletonProps {
  rows?: number
  cols?: number
}

export function SkeletonTable({ rows = 5, cols = 4, className }: SkeletonTableProps) {
  const columns = Math.max(1, cols)

  return (
    <div
      aria-hidden="true"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card shadow-card',
        className,
      )}
    >
      <div className="flex gap-4 border-b border-border px-4 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: Math.max(1, rows) }, (_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-border px-4 py-3.5 last:border-0">
          {Array.from({ length: columns }, (_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn('h-4 flex-1', colIndex === 0 && 'max-w-[40%]')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
