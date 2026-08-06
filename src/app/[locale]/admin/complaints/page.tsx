import type { Metadata } from 'next'
import Link from 'next/link'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { buildQuery, parsePage } from '@/lib/utils'
import { COMPLAINT_STATUSES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { listModerationComplaints } from '@/server/services/moderation'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { Pagination, Select, StatusBadge, buttonVariants } from '@/components/ui'

/**
 * The full complaint queue, including everything already handled.
 *
 * The moderation surface shows what still needs a decision; this one is the archive an
 * admin reads when a company disputes an outcome, so resolved and rejected reports stay
 * visible with the resolution text and the moderator who wrote it. Deciding still happens
 * in moderation — there is exactly one place where that judgement is made.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.complaints} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

type Row = Awaited<ReturnType<typeof listModerationComplaints>>['items'][number]

export default async function AdminComplaintsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'complaints')
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  // Without an explicit filter the admin view lists every complaint, handled or not —
  // that is the difference from the moderator worklist.
  const result = await listModerationComplaints({ status: status ?? 'ALL', page })
  const { items: rows, total, pageCount } = result

  const reasons = t.complaint.reasons as Record<string, string | undefined>
  const statuses = t.complaint.statuses as Record<string, string | undefined>
  const entityTypes = t.moderation.entityTypes as Record<string, string | undefined>

  const columns: DataColumn<Row>[] = [
    {
      key: 'reason',
      header: t.complaint.reason,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-medium">{reasons[row.reason] ?? row.reason}</span>
          <p className="text-caption text-muted-foreground">
            {entityTypes[row.entityType] ?? row.entityType} · {row.targetLabel}
          </p>
        </div>
      ),
    },
    {
      key: 'reporter',
      header: t.moderation.reporter,
      cell: (row) => <span className="text-sm">{row.reporter.name}</span>,
    },
    {
      key: 'handler',
      header: t.admin.moderation,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{row.handledBy?.name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <StatusBadge status={row.status} label={statuses[row.status] ?? row.status} />
          {row.resolution ? (
            <span className="text-caption text-muted-foreground">{row.resolution}</span>
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
        <Link
          href={`${localePath(locale, 'moderation', 'complaints')}?id=${encodeURIComponent(row.id)}`}
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
          <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {COMPLAINT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statuses[value] ?? value}
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
          caption={t.admin.complaints}
        />

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({ status, page: target > 1 ? target : undefined })}`
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
