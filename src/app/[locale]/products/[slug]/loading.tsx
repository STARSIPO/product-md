import { Skeleton, SkeletonText } from '@/components/ui'

/** Gallery + buy panel, in the proportions the real page uses. */
export default function ProductLoading() {
  return (
    <div className="container py-8 pb-28 md:py-10 md:pb-10" aria-busy="true">
      <Skeleton className="h-3.5 w-72 max-w-full" />
      <Skeleton className="mt-4 h-8 w-2/3" />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
        {/* Mirrors the real column: a stack of surfaces with one gap between them. */}
        <div className="min-w-0 space-y-4">
          <div>
            <Skeleton className="aspect-[4/3] w-full rounded-lg" />
            <div className="mt-3 flex gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-20 shrink-0 rounded-md" />
              ))}
            </div>
          </div>

          <div className="surface p-5">
            <Skeleton className="h-6 w-40" />
            <SkeletonText lines={4} className="mt-4" />
          </div>

          <div className="surface p-5">
            <Skeleton className="h-6 w-48" />
            <SkeletonText lines={5} className="mt-4" />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="surface space-y-3 p-5">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-[50px] w-full rounded-md" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
          <div className="surface space-y-3 p-5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-[44px] w-full rounded-md" />
            <SkeletonText lines={3} />
          </div>
        </div>
      </div>
    </div>
  )
}
