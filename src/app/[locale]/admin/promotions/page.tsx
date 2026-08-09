import type { Metadata } from 'next'
import Link from 'next/link'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { PROMOTION_TYPES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { Badge, Pagination, Select } from '@/components/ui'

/**
 * Purchased promotions.
 *
 * Read-only by design. A promotion is a paid position, so granting one from here would
 * be giving away inventory without a ledger entry to show for it; the free editorial
 * levers — a bump, a pin on the home page — live on the listings screen instead, where
 * they are audited as what they are.
 *
 * What this screen answers: is anybody actually buying promotion, and what is currently
 * occupying the paid slots.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.promotion} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminPromotionsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'promotions')
  const type = typeof searchParams.type === 'string' ? searchParams.type : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where = type ? { type } : {}

  const [total, rows] = await Promise.all([
    db.promotion.count({ where }),
    db.promotion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        startsAt: true,
        endsAt: true,
        priceBani: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            slug: true,
            title: true,
            company: { select: { id: true, displayName: true } },
          },
        },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const promos = t.pricing.promos as Record<string, string | undefined>
  const now = Date.now()

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'product',
      header: t.product.single,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={localePath(locale, 'products', row.product.slug)}
            className="rounded font-medium text-primary hover:text-primary-hover"
          >
            {row.product.title}
          </Link>
          <p className="text-caption text-muted-foreground">
            {row.product.company.displayName}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: t.admin.promotionType,
      cell: (row) => <span className="text-sm">{promos[row.type] ?? row.type}</span>,
    },
    {
      key: 'window',
      header: t.admin.promotionStarts,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.startsAt, locale)} → {formatDateTime(row.endsAt, locale)}
        </span>
      ),
    },
    {
      key: 'state',
      header: t.common.status,
      cell: (row) => (
        <Badge variant={row.endsAt.getTime() > now ? 'success' : 'neutral'} size="sm">
          {row.endsAt.getTime() > now ? t.admin.promotionActive : t.admin.promotionFinished}
        </Badge>
      ),
    },
    {
      key: 'price',
      header: t.admin.promotionPrice,
      align: 'right',
      cell: (row) => (
        <span className="tnum text-sm font-medium">{formatMoney(row.priceBani, locale)}</span>
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
          <span className="mb-1.5 block text-sm font-medium">{t.admin.promotionType}</span>
          <Select name="type" defaultValue={type ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {PROMOTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {promos[value] ?? value}
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
          caption={t.admin.promotion}
        />

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({ type, page: target > 1 ? target : undefined })}`
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
