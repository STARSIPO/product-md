import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { buildQuery, parsePage } from '@/lib/utils'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { ReviewAdminActions } from '@/components/admin/decision-dialog'
import { Input, Pagination, Rating, Select, StatusBadge } from '@/components/ui'

/**
 * Every review on the platform, published or hidden.
 *
 * The moderation queue holds the ones that need a first verdict; this is the archive an
 * operator opens when a company disputes a rating months later, so hidden reviews stay
 * visible here with the reason attached.
 *
 * Two different powers sit in the actions column. Hiding a review is a moderation
 * decision and goes through the moderation action, which notifies the author. Deleting a
 * company's *reply* is an admin one: the reply has no hidden state in the schema, so the
 * text is gone for good and the old body is copied into the audit row first.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const REVIEW_STATUSES = ['PUBLISHED', 'HIDDEN', 'PENDING'] as const

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.reviews} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminReviewsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'reviews')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.ReviewWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { comment: { contains: q } } : {}),
  }

  const [total, rows] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        overall: true,
        comment: true,
        status: true,
        createdAt: true,
        deal: { select: { number: true } },
        authorCompany: { select: { id: true, displayName: true } },
        targetCompany: { select: { id: true, displayName: true } },
        reply: { select: { id: true, body: true } },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const reviewStatuses = t.moderation.reviewStatuses as Record<string, string | undefined>

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'review',
      header: t.review.title,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Rating value={row.overall} size="sm" label={fmt(t.a11y.rating, { value: row.overall })} />
            <span className="tnum text-caption text-muted-foreground">{row.deal.number}</span>
          </div>
          {row.comment ? <p className="mt-1 text-sm">{row.comment}</p> : null}
          {row.reply ? (
            <p className="mt-1 border-l-2 border-border pl-2 text-caption text-muted-foreground">
              {t.admin.reviewReply}: {row.reply.body}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'author',
      header: t.admin.reviewAuthor,
      cell: (row) => (
        <Link
          href={localePath(locale, 'admin', 'companies', row.authorCompany.id)}
          className="rounded text-sm text-primary hover:text-primary-hover"
        >
          {row.authorCompany.displayName}
        </Link>
      ),
    },
    {
      key: 'target',
      header: t.admin.reviewTarget,
      cell: (row) => (
        <Link
          href={localePath(locale, 'admin', 'companies', row.targetCompany.id)}
          className="rounded text-sm text-primary hover:text-primary-hover"
        >
          {row.targetCompany.displayName}
        </Link>
      ),
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
      hideOnMobile: true,
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
        <ReviewAdminActions
          reviewId={row.id}
          hidden={row.status === 'HIDDEN'}
          hasReply={row.reply !== null}
        />
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
          <Input name="q" defaultValue={q ?? ''} placeholder={t.review.comment} />
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
          {fmt(t.admin.totalRows, { count: total })}
        </p>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty={t.admin.empty}
          caption={t.admin.reviews}
        />

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({ q, status, page: target > 1 ? target : undefined })}`
          }
          labels={{
            previous: t.a11y.previousPage,
            next: t.a11y.nextPage,
            pagination: t.a11y.pagination,
          }}
        />
      </div>
    </div>
  )
}
