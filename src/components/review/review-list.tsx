import Link from 'next/link'
import { MessageSquareQuote, Star } from 'lucide-react'
import { localePath, type Locale } from '@/lib/i18n/config'
import { fmt, type Dictionary } from '@/lib/i18n'
import { formatDate } from '@/lib/i18n/format'
import { Avatar, Badge, EmptyState, Rating } from '@/components/ui'
import { ReviewReplyForm } from './review-form'
import { ReportButton } from '@/components/complaint/report-button'

/**
 * Published reviews about one company.
 *
 * Each entry names the deal it came from, which is the whole point: on this platform
 * a review cannot exist without a completed transaction behind it, and showing the
 * deal number is what makes that claim checkable rather than a marketing line.
 */

export interface ReviewListItemView {
  id: string
  direction: string
  overall: number
  criteria: Record<string, number>
  comment: string | null
  createdAt: Date
  dealNumber: string | null
  author: { slug: string; displayName: string; logoKey: string | null }
  reply: { body: string; createdAt: Date } | null
  /** The reviewed company may answer once; everyone else sees the answer only. */
  canReply: boolean
}

export function ReviewList({
  reviews,
  locale,
  t,
}: {
  reviews: readonly ReviewListItemView[]
  locale: Locale
  t: Dictionary
}) {
  const labels = t.review.criteria as Record<string, string | undefined>

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<Star aria-hidden />}
        title={t.review.empty}
        description={t.review.emptyText}
      />
    )
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <Avatar
              src={review.author.logoKey ?? undefined}
              name={review.author.displayName}
              size="md"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Link
                  href={localePath(locale, 'suppliers', review.author.slug)}
                  className="rounded text-sm font-medium hover:text-primary"
                >
                  {review.author.displayName}
                </Link>
                <Badge variant="neutral" size="sm">
                  {review.direction === 'BUYER_TO_SELLER' ? t.review.asBuyer : t.review.asSeller}
                </Badge>
                <time
                  dateTime={review.createdAt.toISOString()}
                  className="ml-auto shrink-0 text-caption text-muted-foreground"
                >
                  {formatDate(review.createdAt, locale)}
                </time>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Rating
                  value={review.overall}
                  size="sm"
                  showValue
                  label={fmt(t.a11y.rating, { value: review.overall.toFixed(1) })}
                />
                {review.dealNumber ? (
                  <span className="tnum text-caption text-muted-foreground">
                    {fmt(t.review.aboutDeal, { number: review.dealNumber })}
                  </span>
                ) : null}
              </div>

              {Object.keys(review.criteria).length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(review.criteria).map(([code, score]) => (
                    <li key={code}>
                      <Badge variant="outline" size="sm">
                        <span className="tnum">
                          {labels[code] ?? code} {score}
                        </span>
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}

              {review.comment ? (
                <p className="mt-2.5 whitespace-pre-line text-sm">{review.comment}</p>
              ) : null}

              {review.reply ? (
                <div className="mt-3 rounded-md border-l-2 border-primary bg-muted/60 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
                    <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden />
                    {t.review.replyTitle}
                    <time
                      dateTime={review.reply.createdAt.toISOString()}
                      className="ml-auto font-normal"
                    >
                      {formatDate(review.reply.createdAt, locale)}
                    </time>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{review.reply.body}</p>
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-1">
                {review.canReply && !review.reply ? (
                  <ReviewReplyForm reviewId={review.id} />
                ) : null}
                <ReportButton
                  entityType="REVIEW"
                  entityId={review.id}
                  label={t.review.report}
                  variant="ghost"
                  size="sm"
                />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
