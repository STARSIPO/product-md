import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDate, formatDateTime } from '@/lib/i18n/format'
import { buildQuery, parsePage } from '@/lib/utils'
import { DOCUMENT_STATUSES, DOCUMENT_TYPES, VERIFICATION_TYPES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { Badge, Pagination, Select, StatusBadge, buttonVariants } from '@/components/ui'

/**
 * Verification at platform level.
 *
 * Deciding a single document is a moderator's job and happens in the moderation queue —
 * this screen is the administrator's view *across* companies: how many of each badge are
 * out there, which ones lapse within the month, and what is still sitting unreviewed.
 *
 * The expiry list matters more than it looks: an ANSA certificate that quietly expires
 * leaves a buyer trusting a badge that no longer means anything.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

/** How far ahead the "about to lapse" list looks. */
const EXPIRY_WINDOW_DAYS = 30

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.verification} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminVerificationPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'verification')
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const type = typeof searchParams.type === 'string' ? searchParams.type : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  // Unreviewed documents first when no explicit filter is chosen — that is the queue an
  // operator opens this page to drain.
  const where: Prisma.DocumentWhereInput = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  }

  const horizon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [total, rows, badgeCounts, expiring] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        number: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        company: { select: { id: true, displayName: true } },
      },
    }),
    db.verificationBadge.groupBy({
      by: ['type'],
      where: { status: 'APPROVED' },
      _count: { _all: true },
    }),
    db.verificationBadge.findMany({
      where: { status: 'APPROVED', expiresAt: { not: null, lte: horizon } },
      orderBy: { expiresAt: 'asc' },
      take: 20,
      select: {
        id: true,
        type: true,
        expiresAt: true,
        company: { select: { id: true, displayName: true } },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const docTypes = t.verification.docTypes as Record<string, string | undefined>
  const docStatuses = t.verification.statuses as Record<string, string | undefined>
  const badgeTypes = t.verification.types as Record<string, string | undefined>

  const countByType = new Map(badgeCounts.map((row) => [row.type, row._count._all]))

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'document',
      header: t.verification.documentType,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-medium">{docTypes[row.type] ?? row.type}</span>
          <p className="text-caption text-muted-foreground">{row.number ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'company',
      header: t.company.displayName,
      cell: (row) => (
        <Link
          href={localePath(locale, 'admin', 'companies', row.company.id)}
          className="rounded text-sm text-primary hover:text-primary-hover"
        >
          {row.company.displayName}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <StatusBadge status={row.status} label={docStatuses[row.status] ?? row.status} />
      ),
    },
    {
      key: 'expires',
      header: t.verification.expiresAt,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.expiresAt ? formatDate(row.expiresAt, locale) : '—'}
        </span>
      ),
    },
    {
      key: 'created',
      header: t.verification.uploadedAt,
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
        <Link
          href={`${localePath(locale, 'moderation', 'documents')}?id=${encodeURIComponent(row.id)}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {t.moderation.review}
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------- badges summary */}
      <section>
        <h2 className="text-h3">{t.admin.badgesIssued}</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {VERIFICATION_TYPES.map((value) => (
            // Badges are `whitespace-nowrap` by default, and «Проверенный поставщик
            // Product.md» is wider than a 320px screen — here they are allowed to wrap.
            <li key={value} className="max-w-full">
              <Badge
                variant={countByType.get(value) ? 'success' : 'neutral'}
                className="max-w-full whitespace-normal text-left"
              >
                {badgeTypes[value] ?? value}
                <span className="tnum ml-1 font-semibold">{countByType.get(value) ?? 0}</span>
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------ expiry watch */}
      <section>
        <h2 className="text-h3">{t.admin.expiringSoon}</h2>
        <ul className="surface mt-3 divide-y divide-border">
          {expiring.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t.admin.allClear}
            </li>
          ) : (
            expiring.map((badge) => (
              <li key={badge.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Link
                  href={localePath(locale, 'admin', 'companies', badge.company.id)}
                  className="rounded text-sm font-medium text-primary hover:text-primary-hover"
                >
                  {badge.company.displayName}
                </Link>
                <span className="text-caption text-muted-foreground">
                  {badgeTypes[badge.type] ?? badge.type}
                </span>
                <span className="ml-auto text-caption text-warning">
                  {badge.expiresAt ? formatDate(badge.expiresAt, locale) : ''}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* ---------------------------------------------------------- documents */}
      <section className="space-y-5">
        <h2 className="text-h3">{t.admin.documentsPending}</h2>

        <TableToolbar
          action={basePath}
          label={t.common.filters}
          submitLabel={t.filters.apply}
          resetHref={basePath}
          resetLabel={t.filters.reset}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
            <Select name="status" defaultValue={status ?? ''}>
              <option value="">{t.admin.filterAll}</option>
              {DOCUMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {docStatuses[value] ?? value}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              {t.verification.documentType}
            </span>
            <Select name="type" defaultValue={type ?? ''}>
              <option value="">{t.admin.filterAll}</option>
              {DOCUMENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {docTypes[value] ?? value}
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
            caption={t.admin.verification}
          />

          <Pagination
            className="mt-6"
            page={page}
            pageCount={pageCount}
            buildHref={(target) =>
              `${basePath}${buildQuery({ status, type, page: target > 1 ? target : undefined })}`
            }
            labels={{
              previous: t.a11y.previousPage,
              next: t.a11y.nextPage,
              pagination: t.a11y.pagination,
            }}
          />
        </div>
      </section>
    </div>
  )
}
