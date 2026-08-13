import { fmt, type Dictionary } from '@/lib/i18n'
import { Rating } from '@/components/ui'

/**
 * The reputation block: one headline number, and the breakdown that explains it.
 *
 * The breakdown matters more than the average in wholesale. "4.6 overall" tells a
 * buyer very little; "documents 3.1" tells them exactly which risk to plan around,
 * and it is the reason the criteria are stored per review rather than collapsed into
 * a single score at write time.
 */

export interface RatingSummaryView {
  average: number
  count: number
  criteria: { code: string; average: number; count: number }[]
}

export function RatingSummary({
  summary,
  t,
  className,
}: {
  summary: RatingSummaryView
  t: Dictionary
  className?: string
}) {
  const labels = t.review.criteria as Record<string, string | undefined>

  if (summary.count === 0) {
    return (
      <div className={className ?? 'surface p-5'}>
        <p className="text-sm text-muted-foreground">{t.review.noRatingYet}</p>
      </div>
    )
  }

  return (
    <div className={className ?? 'surface p-5'}>
      <div className="flex items-center gap-3">
        <p className="tnum text-h1 leading-none">{summary.average.toFixed(1)}</p>
        <div>
          <Rating
            value={summary.average}
            size="md"
            label={fmt(t.a11y.rating, { value: summary.average.toFixed(1) })}
          />
          <p className="mt-1 text-caption text-muted-foreground">
            {fmt(t.review.basedOn, { count: summary.count })}
          </p>
        </div>
      </div>

      {summary.criteria.length > 0 ? (
        <>
          <h3 className="mt-4 text-sm font-medium">{t.review.breakdown}</h3>
          <dl className="mt-2 space-y-2">
            {summary.criteria.map((criterion) => (
              <div key={criterion.code} className="flex items-center gap-3">
                <dt className="w-40 shrink-0 truncate text-caption text-muted-foreground">
                  {labels[criterion.code] ?? criterion.code}
                </dt>
                <dd className="flex min-w-0 flex-1 items-center gap-2">
                  {/* The bar repeats the number it visualises, never replaces it. */}
                  <span
                    aria-hidden
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(criterion.average / 5) * 100}%` }}
                    />
                  </span>
                  <span className="tnum w-9 shrink-0 text-right text-caption font-medium">
                    {criterion.average.toFixed(1)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </div>
  )
}
