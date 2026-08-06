import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatQuantity } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { REQUEST_STATUSES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { EntityStatusActions } from '@/components/admin/decision-dialog'
import { Badge, Input, Pagination, Select, StatusBadge } from '@/components/ui'

/**
 * Purchase request administration.
 *
 * Offers are never listed here. A sealed bid is readable by its own supplier and by the
 * buyer who owns the request, and an admin screen that quietly broke that would destroy
 * the one guarantee the tender flow rests on.
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
    title: `${t.admin.requests} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminRequestsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'requests')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.PurchaseRequestWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q } } : {}),
  }

  const [total, rows] = await Promise.all([
    db.purchaseRequest.count({ where }),
    db.purchaseRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        quantity: true,
        unit: true,
        visibility: true,
        offersCount: true,
        createdAt: true,
        offersDeadlineAt: true,
        company: { select: { id: true, displayName: true } },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const requestStatuses = t.requestStatus as Record<string, string | undefined>
  const units = t.units as Record<string, string | undefined>
  const statusOptions = REQUEST_STATUSES.map((value) => ({
    value,
    label: requestStatuses[value] ?? value,
  }))

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'title',
      header: t.request.single,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={localePath(locale, 'requests', row.slug)}
            className="rounded font-medium text-primary hover:text-primary-hover"
          >
            {row.title}
          </Link>
          <p className="text-caption text-muted-foreground">{row.company.displayName}</p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: t.request.quantity,
      align: 'right',
      cell: (row) => (
        <span className="tnum text-sm">
          {formatQuantity(row.quantity, units[row.unit] ?? row.unit, locale)}
        </span>
      ),
    },
    {
      key: 'offers',
      header: t.admin.offers,
      align: 'right',
      cell: (row) => <span className="tnum text-sm text-muted-foreground">{row.offersCount}</span>,
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusBadge status={row.status} label={requestStatuses[row.status] ?? row.status} />
          {row.visibility === 'PRIVATE' ? (
            <Badge variant="neutral" size="sm">
              {row.visibility}
            </Badge>
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
          kind="request"
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
          <Input name="q" defaultValue={q ?? ''} placeholder={t.request.single} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {REQUEST_STATUSES.map((value) => (
              <option key={value} value={value}>
                {requestStatuses[value] ?? value}
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
          caption={t.admin.requests}
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
