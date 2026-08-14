import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney, formatQuantity } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { RETAIL_ORDER_STATUSES, type RetailOrderStatus } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import {
  DataTable,
  ExportLink,
  TableToolbar,
  type DataColumn,
} from '@/components/admin/data-table'
import { RetailOrderActions } from '../_components/retail-controls'
import { Badge, Input, Pagination, Select } from '@/components/ui'

/**
 * Every retail order on the platform, across all shops.
 *
 * The seller's own list in the cabinet answers "what do I have to pack today"; this one
 * answers the questions only the platform can: a shopper writes in that nobody called
 * back, a shop goes quiet with three orders stuck in PREPARING, somebody has to see the
 * whole picture. So the filters here are the ones a support conversation starts from —
 * an order number, a phone number, a status — and the shop is a link into its company
 * card rather than a name in a cell.
 *
 * Money is shown and never touched. Product.md does not take the payment for a retail
 * order: the shopper pays the shop. The totals below are a record of what was agreed,
 * not a balance the panel can move.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

/**
 * The lifecycle colours, kept here rather than in the shared `StatusBadge` map: NEW and
 * DELIVERING are retail-only states, and NEW in particular has to read as "waiting for
 * somebody" rather than as the neutral grey an unknown status falls back to.
 */
const STATUS_VARIANTS: Record<RetailOrderStatus, 'neutral' | 'primary' | 'success' | 'warning' | 'accent'> = {
  NEW: 'warning',
  CONFIRMED: 'primary',
  PREPARING: 'primary',
  DELIVERING: 'accent',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.retail.sellerOrdersTitle} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminRetailOrdersPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'orders')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  // Checked against the tuple: an unrecognised value would return nothing and read as
  // "no orders" rather than "that filter does not exist".
  const statusParam = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const status = (RETAIL_ORDER_STATUSES as readonly string[]).includes(statusParam ?? '')
    ? statusParam
    : undefined
  const company = typeof searchParams.company === 'string' ? searchParams.company : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.RetailOrderWhereInput = {
    ...(status ? { status } : {}),
    ...(company ? { sellerCompanyId: company } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q } },
            { customerName: { contains: q } },
            { customerPhone: { contains: q } },
          ],
        }
      : {}),
  }

  const [total, rows, sellerCompany] = await Promise.all([
    db.retailOrder.count({ where }),
    db.retailOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        status: true,
        cancelReason: true,
        customerName: true,
        customerPhone: true,
        deliveryAddress: true,
        itemsTotalBani: true,
        deliveryFeeBani: true,
        totalBani: true,
        createdAt: true,
        sellerCompany: { select: { id: true, displayName: true } },
        items: { select: { id: true, title: true, quantity: true, unit: true } },
      },
    }),
    company
      ? db.company.findUnique({ where: { id: company }, select: { displayName: true } })
      : Promise.resolve(null),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const orderStatuses = t.retail.statuses as Record<string, string | undefined>
  const units = t.units as Record<string, string | undefined>
  const statusOptions = RETAIL_ORDER_STATUSES.map((value) => ({
    value,
    label: orderStatuses[value] ?? value,
  }))

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'order',
      header: t.admin.retailOrderNumber,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="tnum font-medium">{row.number}</span>
          <p className="text-caption text-muted-foreground">
            {formatDateTime(row.createdAt, locale)}
          </p>
        </div>
      ),
    },
    {
      key: 'shop',
      header: t.retail.orderShop,
      cell: (row) => (
        <Link
          href={localePath(locale, 'admin', 'companies', row.sellerCompany.id)}
          className="rounded text-sm font-medium text-primary hover:text-primary-hover"
        >
          {row.sellerCompany.displayName}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: t.retail.orderCustomer,
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm">{row.customerName}</p>
          <p className="tnum text-caption text-muted-foreground">{row.customerPhone}</p>
          <p className="text-caption text-muted-foreground">{row.deliveryAddress}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: t.retail.orderItems,
      hideOnMobile: true,
      cell: (row) => (
        <ul className="space-y-0.5">
          {row.items.map((item) => (
            <li key={item.id} className="text-caption text-muted-foreground">
              {item.title} ·{' '}
              <span className="tnum">
                {formatQuantity(item.quantity, units[item.unit] ?? item.unit, locale)}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: 'total',
      header: t.retail.orderTotal,
      align: 'right',
      cell: (row) => (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="tnum text-sm font-medium">{formatMoney(row.totalBani, locale)}</span>
          <span className="tnum text-caption text-muted-foreground">
            {formatMoney(row.itemsTotalBani, locale)}
            {' + '}
            {row.deliveryFeeBani === 0
              ? t.retail.deliveryFree
              : formatMoney(row.deliveryFeeBani, locale)}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <Badge
            variant={STATUS_VARIANTS[row.status as RetailOrderStatus] ?? 'neutral'}
            size="sm"
          >
            {orderStatuses[row.status] ?? row.status}
          </Badge>
          {row.cancelReason ? (
            <span className="text-caption text-muted-foreground">
              {fmt(t.retail.cancelledReason, { reason: row.cancelReason })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      align: 'right',
      cell: (row) => (
        <RetailOrderActions
          orderId={row.id}
          status={row.status}
          statusOptions={statusOptions}
        />
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h3">{t.retail.sellerOrdersTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.retail.sellerOrdersSubtitle}</p>
      </div>

      <TableToolbar
        action={basePath}
        label={t.common.filters}
        submitLabel={t.filters.apply}
        resetHref={basePath}
        resetLabel={t.filters.reset}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.search}</span>
          <Input name="q" defaultValue={q ?? ''} placeholder={t.admin.retailOrderNumber} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.retail.filterStatus}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {RETAIL_ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {orderStatuses[value] ?? value}
              </option>
            ))}
          </Select>
        </label>
        {/* Arriving from a company card, the shop filter is already set — it travels with
            the form instead of being silently dropped on the first search. */}
        {company ? <input type="hidden" name="company" value={company} /> : null}
      </TableToolbar>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="tnum text-sm text-muted-foreground">
            {fmt(t.admin.totalRows, { count: total })}
          </p>
          {sellerCompany ? (
            <Badge variant="outline" size="sm">
              {sellerCompany.displayName}
            </Badge>
          ) : null}
          <ExportLink
            className="ml-auto"
            href={`${localePath(locale, 'admin', 'export')}${buildQuery({
              entity: 'retailOrders',
              q,
              status,
              company,
            })}`}
            label={t.admin.exportCsv}
          />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty={t.retail.sellerOrdersEmpty}
          caption={t.retail.sellerOrdersTitle}
        />

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({
              q,
              status,
              company,
              page: target > 1 ? target : undefined,
            })}`
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
