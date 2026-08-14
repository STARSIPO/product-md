import { Skeleton, SkeletonCard, SkeletonProductCard } from '@/components/ui'

/**
 * Mirrors the storefront: heading, a row of shops, then the product grid — so the page
 * does not jump when the real data lands.
 */
export default function DeliveryLoading() {
  return (
    <div className="container py-8 pb-28 md:py-10 md:pb-24" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />

      <div className="mt-10">
        <Skeleton className="h-6 w-48" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </div>

      <div className="mt-10">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-[44px] w-full rounded-md" />

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonProductCard key={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
