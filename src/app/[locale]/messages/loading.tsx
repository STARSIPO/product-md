import { Skeleton } from '@/components/ui'

/** Mirrors the inbox: title, list column, empty thread pane — so nothing shifts. */
export default function Loading() {
  return (
    <div className="container py-6" aria-busy="true">
      <Skeleton className="h-9 w-48" />

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3">
            <Skeleton className="h-[42px] w-full rounded-md" />
          </div>
          <ul className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="flex items-start gap-3 px-3 py-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="mt-2 h-3 w-24" />
                  <Skeleton className="mt-2 h-4 w-full" />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden rounded-lg border border-dashed border-border bg-card lg:block" />
      </div>
    </div>
  )
}
