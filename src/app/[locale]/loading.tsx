import { Skeleton } from '@/components/ui'

/**
 * Route-level loading skeleton. The layout is deliberately generic — it mirrors the
 * common "heading + card grid" shape so the page does not visibly jump when real
 * content replaces it.
 */
export default function Loading() {
  return (
    <div className="container py-10" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80" />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="surface p-4">
            <Skeleton className="aspect-[4/3] w-full rounded-md" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
            <Skeleton className="mt-4 h-6 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
