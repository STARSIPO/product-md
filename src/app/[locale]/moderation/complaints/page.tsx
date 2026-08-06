import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Flag } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { parsePage, buildQuery } from '@/lib/utils'
import { COMPLAINT_STATUSES } from '@/lib/constants'
import { requireModerator } from '@/server/auth/guards'
import { getComplaintForReview, listModerationComplaints } from '@/server/services/moderation'
import { listAudit } from '@/server/services/audit'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { ComplaintDecisionPanel } from '@/components/admin/decision-dialog'
import { EmptyState, Pagination, Select, StatusBadge, buttonVariants } from '@/components/ui'

/**
 * Complaint handling.
 *
 * Every outcome carries a written resolution, and the reporter is notified with it. A
 * report that disappears silently teaches people not to report anything — which is
 * expensive on a marketplace where the reports are the fraud signal.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.moderation.complaints} — ${t.moderation.title}`,
    robots: { index: false, follow: false },
  }
}

type ComplaintRow = Awaited<ReturnType<typeof listModerationComplaints>>['items'][number]

export default async function ModerationComplaintsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireModerator(locale)

  const basePath = localePath(locale, 'moderation', 'complaints')
  const id = typeof searchParams.id === 'string' ? searchParams.id : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const reasons = t.complaint.reasons as Record<string, string | undefined>
  const statuses = t.complaint.statuses as Record<string, string | undefined>
  const entityTypes = t.moderation.entityTypes as Record<string, string | undefined>

  // --- single complaint ------------------------------------------------------
  if (id) {
    const [complaint, history] = await Promise.all([
      getComplaintForReview(id),
      listAudit({ entityType: 'COMPLAINT', entityId: id, pageSize: 10 }),
    ])

    if (!complaint) {
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

    const facts: { label: string; value: string }[] = [
      { label: t.complaint.reason, value: reasons[complaint.reason] ?? complaint.reason },
      {
        label: t.moderation.target,
        value: `${entityTypes[complaint.entityType] ?? complaint.entityType} · ${complaint.targetLabel}`,
      },
      { label: t.moderation.reporter, value: complaint.reporter.name },
      { label: t.common.date, value: formatDateTime(complaint.createdAt, locale) },
    ]

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
            <header className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={complaint.status}
                label={statuses[complaint.status] ?? complaint.status}
              />
              <h2 className="text-h3">{reasons[complaint.reason] ?? complaint.reason}</h2>
            </header>

            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="text-caption text-muted-foreground">{fact.label}</dt>
                  <dd className="text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>

            {complaint.description ? (
              <p className="whitespace-pre-line rounded-md border border-border bg-muted p-3 text-sm">
                {complaint.description}
              </p>
            ) : null}

            {complaint.resolution ? (
              <p className="rounded-md border border-border p-3 text-sm">
                <span className="block text-caption text-muted-foreground">
                  {t.moderation.resolution}
                </span>
                {complaint.resolution}
              </p>
            ) : null}
          </article>

          <div className="space-y-4">
            <ComplaintDecisionPanel complaintId={complaint.id} />

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
  const result = await listModerationComplaints({ status, page })

  const columns: DataColumn<ComplaintRow>[] = [
    {
      key: 'reason',
      header: t.complaint.reason,
      primary: true,
      cell: (row) => (
        <Link
          href={`${basePath}?id=${encodeURIComponent(row.id)}`}
          className="rounded font-medium text-primary hover:text-primary-hover"
        >
          {reasons[row.reason] ?? row.reason}
        </Link>
      ),
    },
    {
      key: 'target',
      header: t.moderation.target,
      cell: (row) => (
        <span className="text-sm">
          {entityTypes[row.entityType] ?? row.entityType}
          <span className="block text-caption text-muted-foreground">{row.targetLabel}</span>
        </span>
      ),
    },
    {
      key: 'reporter',
      header: t.moderation.reporter,
      cell: (row) => <span className="text-sm">{row.reporter.name}</span>,
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => <StatusBadge status={row.status} label={statuses[row.status] ?? row.status} />,
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
          {fmt(t.admin.totalRows, { count: result.total })}
        </p>

        {result.items.length === 0 ? (
          <EmptyState
            className="rounded-lg border border-border bg-card"
            icon={<Flag aria-hidden />}
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
              caption={t.moderation.complaints}
            />
            <Pagination
              className="mt-6"
              page={result.page}
              pageCount={result.pageCount}
              buildHref={(target) =>
                `${basePath}${buildQuery({ status, page: target > 1 ? target : undefined })}`
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
