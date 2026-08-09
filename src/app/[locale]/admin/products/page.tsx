import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { PRODUCT_STATUSES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import {
  DataTable,
  ExportLink,
  TableToolbar,
  type DataColumn,
} from '@/components/admin/data-table'
import { ListingAdminActions } from '@/components/admin/decision-dialog'
import { Badge, Input, Pagination, Select, StatusBadge } from '@/components/ui'

/**
 * Listing administration.
 *
 * The status select here bypasses the moderation flow deliberately — it exists for the
 * cases moderation cannot express: unblocking after an appeal, archiving the listings of
 * a company that has left, pulling something dangerous immediately. Each override is
 * audited with its reason.
 *
 * Alongside it sit the editorial levers that have no moderation equivalent at all: a
 * free bump, a pin on the home page, and the escape hatch for a listing the nightly job
 * paused because the balance ran out but the money arrived by bank transfer.
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
    title: `${t.admin.products} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminProductsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'products')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q } } : {}),
  }

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        priceBani: true,
        unit: true,
        viewsCount: true,
        createdAt: true,
        isHomepagePinned: true,
        pausedForBalance: true,
        bumpedAt: true,
        company: { select: { id: true, displayName: true } },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const productStatuses = t.productStatus as Record<string, string | undefined>
  const units = t.units as Record<string, string | undefined>
  const statusOptions = PRODUCT_STATUSES.map((value) => ({
    value,
    label: productStatuses[value] ?? value,
  }))

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'title',
      header: t.product.single,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={localePath(locale, 'products', row.slug)}
            className="rounded font-medium text-primary hover:text-primary-hover"
          >
            {row.title}
          </Link>
          <p className="text-caption text-muted-foreground">{row.company.displayName}</p>
        </div>
      ),
    },
    {
      key: 'price',
      header: t.product.price,
      align: 'right',
      cell: (row) => (
        <span className="tnum text-sm">
          {fmt(t.product.pricePerUnit, {
            price: formatMoney(row.priceBani, locale),
            unit: units[row.unit] ?? row.unit,
          })}
        </span>
      ),
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusBadge status={row.status} label={productStatuses[row.status] ?? row.status} />
          {row.isHomepagePinned ? (
            <Badge variant="primary" size="sm">
              {t.admin.homepagePinned}
            </Badge>
          ) : null}
          {row.pausedForBalance ? (
            <Badge variant="warning" size="sm">
              {t.admin.pausedForBalance}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'views',
      header: t.analytics.views,
      align: 'right',
      cell: (row) => <span className="tnum text-sm text-muted-foreground">{row.viewsCount}</span>,
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
        <ListingAdminActions
          productId={row.id}
          status={row.status}
          statusOptions={statusOptions}
          pinned={row.isHomepagePinned}
          pausedForBalance={row.pausedForBalance}
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
          <Input name="q" defaultValue={q ?? ''} placeholder={t.product.single} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {PRODUCT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {productStatuses[value] ?? value}
              </option>
            ))}
          </Select>
        </label>
      </TableToolbar>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="tnum text-sm text-muted-foreground">
            {fmt(t.admin.totalRows, { count: total })}
          </p>
          <ExportLink
            className="ml-auto"
            href={`${localePath(locale, 'admin', 'export')}${buildQuery({
              entity: 'products',
              q,
              status,
            })}`}
            label={t.admin.exportCsv}
          />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty={t.admin.empty}
          caption={t.admin.products}
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
