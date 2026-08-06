import type { Metadata } from 'next'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { DEAL_STATUSES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { EntityStatusActions } from '@/components/admin/decision-dialog'
import { Input, Pagination, Select, StatusBadge } from '@/components/ui'

/**
 * Deal administration.
 *
 * Product.md is not a party to any of these agreements and never touches the money — the
 * rows exist so an operator can unstick a disputed deal and see whether the marketplace
 * is actually producing trades. Forcing a status writes a DealEvent both sides can read,
 * so nothing changes behind the traders' backs.
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
    title: `${t.admin.deals} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminDealsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'deals')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.DealWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ number: { contains: q } }, { title: { contains: q } }] } : {}),
  }

  const [total, rows] = await Promise.all([
    db.deal.count({ where }),
    db.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        totalBani: true,
        createdAt: true,
        completedAt: true,
        cancelReason: true,
        buyerCompany: { select: { id: true, displayName: true } },
        sellerCompany: { select: { id: true, displayName: true } },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const dealStatuses = t.dealStatus as Record<string, string | undefined>
  const statusOptions = DEAL_STATUSES.map((value) => ({
    value,
    label: dealStatuses[value] ?? value,
  }))

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'deal',
      header: t.deal.single,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="tnum font-medium">{row.number}</span>
          <p className="truncate text-caption text-muted-foreground">{row.title}</p>
        </div>
      ),
    },
    {
      key: 'buyer',
      header: t.deal.buyer,
      cell: (row) => <span className="text-sm">{row.buyerCompany.displayName}</span>,
    },
    {
      key: 'seller',
      header: t.deal.seller,
      cell: (row) => <span className="text-sm">{row.sellerCompany.displayName}</span>,
    },
    {
      key: 'total',
      header: t.deal.total,
      align: 'right',
      cell: (row) => (
        <span className="tnum text-sm font-medium">{formatMoney(row.totalBani, locale)}</span>
      ),
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <StatusBadge status={row.status} label={dealStatuses[row.status] ?? row.status} />
          {row.cancelReason ? (
            <span className="text-caption text-muted-foreground">{row.cancelReason}</span>
          ) : null}
        </span>
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
        <EntityStatusActions
          kind="deal"
          entityId={row.id}
          status={row.status}
          statusOptions={statusOptions}
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
          <Input name="q" defaultValue={q ?? ''} placeholder={t.deal.single} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {DEAL_STATUSES.map((value) => (
              <option key={value} value={value}>
                {dealStatuses[value] ?? value}
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
          caption={t.admin.deals}
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
