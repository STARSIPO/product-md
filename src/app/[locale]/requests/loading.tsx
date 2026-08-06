import { Skeleton } from '@/components/ui'

/** Mirrors the board layout — heading, filter bar, card grid — so nothing jumps. */
export default function Loading() {
  return (
    <div className="container py-8" aria-busy="true">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />

      <Skeleton className="mt-6 h-[136px] w-full rounded-lg md:h-[104px]" />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-5 w-24 rounded-sm" />
            <Skeleton className="mt-3 h-5 w-full" />
            <Skeleton className="mt-2 h-5 w-2/3" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
            <Skeleton className="mt-4 h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  )
}
