import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, MessageSquareWarning } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { parsePage, buildQuery } from '@/lib/utils'
import { requireModerator } from '@/server/auth/guards'
import { getReviewForReview, listModerationReviews } from '@/server/services/moderation'
import { listAudit } from '@/server/services/audit'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { ReviewDecisionPanel } from '@/components/admin/decision-dialog'
import {
  EmptyState,
  Input,
  Pagination,
  Rating,
  Select,
  StatusBadge,
  buttonVariants,
} from '@/components/ui'

/**
 * Review moderation.
 *
 * Hiding is reversible and always reasoned: a review is a company's reputation, and an
 * unexplained disappearance is indistinguishable from censorship on the seller's side.
 * Nothing here edits the text — only its visibility.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.moderation.reviews} — ${t.moderation.title}`,
    robots: { index: false, follow: false },
  }
}

const REVIEW_STATUSES = ['PUBLISHED', 'HIDDEN', 'PENDING'] as const

type ReviewRow = Awaited<ReturnType<typeof listModerationReviews>>['items'][number]

export default async function ModerationReviewsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireModerator(locale)

  const basePath = localePath(locale, 'moderation', 'reviews')
  const id = typeof searchParams.id === 'string' ? searchParams.id : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const q = typeof searchParams.q === 'string' ? searchParams.q : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const reviewStatuses = t.moderation.reviewStatuses as Record<string, string | undefined>
  // --- single review ---------------------------------------------------------
  if (id) {
    const [review, history] = await Promise.all([
      getReviewForReview(id),
      listAudit({ entityType: 'REVIEW', entityId: id, pageSize: 10 }),
    ])

    if (!review) {
      return (
        <EmptyState
          className="rounded-lg border border-border bg-card"
          title={t.states.notFoundTitle}
          description={t.states.notFoundText}
          action={
            <Link href={basePath} className={buttonVariants({ variant: 'outline' })}>
              {t.moderation.backToList}
            </Link>
          }
        />
      )
    }

    return (
      <div className="space-y-4">
        <Link
          href={basePath}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-sm text-primary hover:text-primary-hover"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.moderation.backToList}
        </Link>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4">
            <header className="flex flex-wrap items-center gap-3">
              <StatusBadge
                status={review.status}
                label={reviewStatuses[review.status] ?? review.status}
              />
              <Rating value={review.overall} label={fmt(t.a11y.rating, { value: review.overall })} />
            </header>

            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-caption text-muted-foreground">{t.review.asBuyer}</dt>
                <dd className="text-sm font-medium">{review.authorCompany.displayName}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">{t.review.asSeller}</dt>
                <dd className="text-sm font-medium">{review.targetCompany.displayName}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">{t.deal.single}</dt>
                <dd className="text-sm font-medium">{review.deal.number}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">{t.common.date}</dt>
                <dd className="text-sm font-medium">{formatDateTime(review.createdAt, locale)}</dd>
              </div>
            </dl>

            {review.comment ? (
              <p className="whitespace-pre-line rounded-md border border-border bg-muted p-3 text-sm">
                {review.comment}
              </p>
            ) : null}

            {review.reply ? (
              <p className="rounded-md border border-border p-3 text-sm">
                <span className="block text-caption text-muted-foreground">
                  {t.review.replyTitle}
                </span>
                {review.reply.body}
              </p>
            ) : null}
          </article>

          <div className="space-y-4">
            <ReviewDecisionPanel reviewId={review.id} hidden={review.status === 'HIDDEN'} />

            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-h3">{t.moderation.decisionLog}</h2>
              <ol className="mt-2 space-y-2">
                {history.items.length === 0 ? (
                  <li className="text-sm text-muted-foreground">{t.admin.auditEmpty}</li>
                ) : (
                  history.items.map((entry) => (
                    <li key={entry.id} className="text-sm">
                      <span className="font-mono text-caption text-primary">{entry.action}</span>
                      <span className="ml-2 text-caption text-muted-foreground">
                        {formatDateTime(entry.createdAt, locale)}
                        {entry.actor ? ` · ${entry.actor.name}` : ''}
                      </span>
                      {entry.reason ? (
                        <p className="text-muted-foreground">{entry.reason}</p>
                      ) : null}
                    </li>
                  ))
                )}
              </ol>
            </section>
          </div>
        </div>
      </div>
    )
  }

  // --- worklist --------------------------------------------------------------
  const result = await listModerationReviews({ status, q, page })

  const columns: DataColumn<ReviewRow>[] = [
    {
      key: 'comment',
      header: t.moderation.item,
      primary: true,
      cell: (row) => (
        <Link
          href={`${basePath}?id=${encodeURIComponent(row.id)}`}
          className="rounded font-medium text-primary hover:text-primary-hover"
        >
          {row.comment ?? `${row.overall}/5`}
        </Link>
      ),
    },
    {
      key: 'rating',
      header: t.company.rating,
      cell: (row) => <span className="tnum text-sm">{row.overall}/5</span>,
    },
    {
      key: 'target',
      header: t.moderation.target,
      cell: (row) => <span className="text-sm">{row.targetCompany.displayName}</span>,
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <StatusBadge status={row.status} label={reviewStatuses[row.status] ?? row.status} />
      ),
    },
    {
      key: 'created',
      header: t.common.date,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.createdAt, locale)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      align: 'right',
      cell: (row) => (
        <Link
          href={`${basePath}?id=${encodeURIComponent(row.id)}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {t.moderation.review}
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <TableToolbar
        action={basePath}
        label={t.common.filters}
        submitLabel={t.filters.apply}
        resetHref={basePath}
        resetLabel={t.filters.reset}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.search}</span>
          <Input name="q" defaultValue={q ?? ''} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {REVIEW_STATUSES.map((value) => (
              <option key={value} value={value}>
                {reviewStatuses[value] ?? value}
              </option>
            ))}
          </Select>
        </label>
      </TableToolbar>

      <div>
        <p className="mb-3 tnum text-sm text-muted-foreground">
          {fmt(t.admin.totalRows, { count: result.total })}
        </p>

        {result.items.length === 0 ? (
          <EmptyState
            className="rounded-lg border border-border bg-card"
            icon={<MessageSquareWarning aria-hidden />}
            title={t.moderation.empty}
            description={t.moderation.emptyText}
          />
        ) : (
          <>
            <DataTable
              rows={result.items}
              columns={columns}
              rowKey={(row) => row.id}
              empty={t.moderation.empty}
              caption={t.moderation.reviews}
            />
            <Pagination
              className="mt-6"
              page={result.page}
              pageCount={result.pageCount}
              buildHref={(target) =>
                `${basePath}${buildQuery({ q, status, page: target > 1 ? target : undefined })}`
              }
              labels={{
                previous: t.a11y.previousPage,
                next: t.a11y.nextPage,
                pagination: t.a11y.pagination,
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
