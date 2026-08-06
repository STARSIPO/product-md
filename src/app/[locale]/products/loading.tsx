import { Skeleton, SkeletonProductCard } from '@/components/ui'

/**
 * Mirrors the catalogue's sidebar + grid so the layout does not jump when the real
 * results arrive.
 */
export default function ProductsLoading() {
  return (
    <div className="container py-6 md:py-8" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <div className="space-y-4 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-[42px] w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-[42px] w-28 rounded-md lg:hidden" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-[42px] w-44 rounded-md" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <SkeletonProductCard key={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
