import type { Metadata } from 'next'
import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { formatDateTime, formatRelative } from '@/lib/i18n/format'
import { parsePage } from '@/lib/utils'
import { requireModerator } from '@/server/auth/guards'
import { listQueue, type QueueTask } from '@/server/services/moderation'
import { AUDIT_MODERATION_PREFIX, listAudit } from '@/server/services/audit'
import { DataTable, type DataColumn } from '@/components/admin/data-table'
import { ClaimButton } from '@/components/admin/decision-dialog'
import { Badge, EmptyState, Pagination, buttonVariants } from '@/components/ui'

/**
 * The shared work queue.
 *
 * Ordering is priority first, then age — a fraud report jumps the line, and within the
 * same priority nothing can be starved by newer work. The "claimed by" column exists so
 * two moderators do not spend twenty minutes reviewing the same listing; the claim
 * itself is settled by the database, not by this page.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.moderation.queue} — ${t.moderation.title}`,
    robots: { index: false, follow: false },
  }
}

/** Where a queue row opens for review. Unsupported types stay unlinked. */
function reviewHref(locale: Locale, task: QueueTask): string | null {
  const routes: Record<string, string> = {
    PRODUCT: 'products',
    DOCUMENT: 'documents',
    COMPLAINT: 'complaints',
    REVIEW: 'reviews',
  }
  const segment = routes[task.entityType]
  if (!segment) return null
  return `${localePath(locale, 'moderation', segment)}?id=${encodeURIComponent(task.entityId)}`
}

export default async function ModerationQueuePage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireModerator(locale)

  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const [queue, journal] = await Promise.all([
    listQueue({ page }),
    listAudit({ actionPrefix: AUDIT_MODERATION_PREFIX, pageSize: 10 }),
  ])

  const entityTypes = t.moderation.entityTypes as Record<string, string | undefined>
  const kinds = t.moderation.kinds as Record<string, string | undefined>
  const taskStatuses = t.moderation.taskStatuses as Record<string, string | undefined>
  const docTypes = t.verification.docTypes as Record<string, string | undefined>
  const complaintReasons = t.complaint.reasons as Record<string, string | undefined>

  function codeLabel(task: QueueTask): string | null {
    if (!task.code) return null
    if (task.entityType === 'DOCUMENT') return docTypes[task.code] ?? task.code
    if (task.entityType === 'COMPLAINT') return complaintReasons[task.code] ?? task.code
    return task.code
  }

  const columns: DataColumn<QueueTask>[] = [
    {
      key: 'item',
      header: t.moderation.item,
      primary: true,
      cell: (task) => {
        const href = reviewHref(locale, task)
        const code = codeLabel(task)
        return (
          <div className="min-w-0">
            {href ? (
              <Link
                href={href}
                className="rounded font-medium text-primary hover:text-primary-hover"
              >
                {task.label}
              </Link>
            ) : (
              <span className="font-medium">{task.label}</span>
            )}
            <p className="mt-0.5 text-caption text-muted-foreground">
              {[entityTypes[task.entityType] ?? task.entityType, code, task.companyName]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        )
      },
    },
    {
      key: 'kind',
      header: t.moderation.entity,
      cell: (task) => (
        <span className="text-sm text-muted-foreground">{kinds[task.kind] ?? task.kind}</span>
      ),
    },
    {
      key: 'priority',
      header: t.moderation.priority,
      cell: (task) =>
        task.priority > 0 ? (
          <Badge variant="warning" size="sm">
            {task.priority}
          </Badge>
        ) : (
          <span className="tnum text-sm text-muted-foreground">0</span>
        ),
    },
    {
      key: 'created',
      header: t.common.date,
      cell: (task) => (
        <span className="text-sm text-muted-foreground" title={formatDateTime(task.createdAt, locale)}>
          {formatRelative(task.createdAt, locale)}
        </span>
      ),
    },
    {
      key: 'assignee',
      header: t.common.status,
      cell: (task) => (
        <span className="text-sm">
          {task.assignedTo ? (
            fmt(t.moderation.assignedTo, { name: task.assignedTo.name })
          ) : (
            <span className="text-muted-foreground">{t.moderation.unassigned}</span>
          )}
          <span className="ml-2 text-caption text-muted-foreground">
            {taskStatuses[task.status] ?? task.status}
          </span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      align: 'right',
      cell: (task) => {
        const href = reviewHref(locale, task)
        return (
          <span className="inline-flex flex-wrap items-center justify-end gap-2">
            {task.status === 'OPEN' ? <ClaimButton taskId={task.id} /> : null}
            {href ? (
              <Link href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                {t.moderation.review}
              </Link>
            ) : null}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-h3">{t.moderation.queue}</h2>
          <p className="tnum text-sm text-muted-foreground">
            {fmt(t.admin.totalRows, { count: queue.total })}
          </p>
        </div>

        {queue.items.length === 0 ? (
          <EmptyState
            className="rounded-lg border border-border bg-card"
            icon={<ListChecks aria-hidden />}
            title={t.moderation.empty}
            description={t.moderation.emptyText}
          />
        ) : (
          <>
            <DataTable
              rows={queue.items}
              columns={columns}
              rowKey={(task) => task.id}
              empty={t.moderation.empty}
              caption={t.moderation.queue}
            />
            <Pagination
              className="mt-6"
              page={queue.page}
              pageCount={queue.pageCount}
              buildHref={(target) =>
                `${localePath(locale, 'moderation')}${target > 1 ? `?page=${target}` : ''}`
              }
              labels={{
                previous: t.a11y.previousPage,
                next: t.a11y.nextPage,
                pagination: t.a11y.pagination,
              }}
            />
          </>
        )}
      </section>

      {/* ------------------------------------------------- decision journal */}
      <section>
        <h2 className="text-h3">{t.moderation.decisionLog}</h2>
        <ol className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
          {journal.items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t.admin.auditEmpty}
            </li>
          ) : (
            journal.items.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-mono text-caption text-primary">{entry.action}</span>
                  <span className="text-sm">
                    {entityTypes[entry.entityType] ?? entry.entityType}
                  </span>
                  <span className="ml-auto text-caption text-muted-foreground">
                    {formatDateTime(entry.createdAt, locale)}
                    {entry.actor ? ` · ${entry.actor.name}` : ''}
                  </span>
                </div>
                {entry.reason ? (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.reason}</p>
                ) : null}
              </li>
            ))
          )}
        </ol>
      </section>
    </div>
  )
}
