import { Skeleton, SkeletonText } from '@/components/ui'

/** Gallery + buy panel, in the proportions the real page uses. */
export default function ProductLoading() {
  return (
    <div className="container py-6 pb-28 md:pb-10" aria-busy="true">
      <Skeleton className="h-3.5 w-72 max-w-full" />
      <Skeleton className="mt-4 h-8 w-2/3" />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <div className="mt-3 flex gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-20 shrink-0 rounded-md" />
            ))}
          </div>

          <Skeleton className="mt-8 h-6 w-40" />
          <SkeletonText lines={4} className="mt-3" />

          <Skeleton className="mt-8 h-6 w-48" />
          <Skeleton className="mt-3 h-40 w-full rounded-lg" />
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-[42px] w-full rounded-md" />
            <SkeletonText lines={3} />
          </div>
        </div>
      </div>
    </div>
  )
}
