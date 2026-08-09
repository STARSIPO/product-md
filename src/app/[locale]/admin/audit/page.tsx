import type { Metadata } from 'next'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { buildQuery, parsePage } from '@/lib/utils'
import { encodeJson } from '@/lib/json'
import { requireAdmin } from '@/server/auth/guards'
import { listAudit, listAuditActors, type AuditRow } from '@/server/services/audit'
import {
  DataTable,
  ExportLink,
  TableToolbar,
  type DataColumn,
} from '@/components/admin/data-table'
import { Input, Pagination, Select } from '@/components/ui'

/**
 * The audit log.
 *
 * Every moderator and admin mutation lands here: role changes, blocks, balance
 * corrections, moderation verdicts, flag flips, taxonomy edits. Rows are never edited or
 * deleted from the application — the value of the log is precisely that it is
 * append-only.
 *
 * Old and new values are stored as JSON strings holding only the fields that changed,
 * which keeps the table readable and avoids copying whole personal records into a second
 * place.
 */

export const dynamic = 'force-dynamic'

const ENTITY_TYPES = [
  'USER',
  'COMPANY',
  'PRODUCT',
  'REQUEST',
  'DEAL',
  'DOCUMENT',
  'COMPLAINT',
  'REVIEW',
  'MODERATION_TASK',
  'CATEGORY',
  'CATEGORY_ATTRIBUTE',
  'CATEGORY_ATTRIBUTE_OPTION',
  'CATEGORY_SYNONYM',
  'TARIFF',
  'FEATURE_FLAG',
  'PAYMENT',
  'EXPORT',
] as const

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.auditLog} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

/** `<input type="date">` gives YYYY-MM-DD; anything else is ignored rather than thrown. */
function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined
  const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return encodeJson(value)
}

interface FieldChange {
  field: string
  before: string
  after: string
  /** Same on both sides: context the action recorded, not something that moved. */
  unchanged: boolean
}

/**
 * Folds the stored before/after snapshots into one list of changed fields.
 *
 * Two adjacent JSON blobs make the reader diff them by eye, which is exactly the work a
 * log is supposed to save. `recordAudit` already stores only what changed, so the union
 * of both keysets *is* the change set — a key present on one side only means the field
 * was set from nothing or cleared to nothing, and both read correctly as "— → value".
 */
function changedFields(
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
): FieldChange[] {
  const keys = [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])]
  return keys.map((field) => {
    const before = formatValue(oldValue[field])
    const after = formatValue(newValue[field])
    return { field, before, after, unchanged: before === after }
  })
}

export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'audit')
  const actorId = typeof searchParams.actor === 'string' ? searchParams.actor : undefined
  const entityType = typeof searchParams.entity === 'string' ? searchParams.entity : undefined
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const [result, actors] = await Promise.all([
    listAudit({
      actorId,
      entityType,
      from: parseDate(from),
      to: parseDate(to, true),
      page,
    }),
    listAuditActors(),
  ])

  const columns: DataColumn<AuditRow>[] = [
    {
      key: 'action',
      header: t.admin.auditAction,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-mono text-sm font-medium text-primary">{row.action}</span>
          <p className="text-caption text-muted-foreground">
            {row.entityType} · {row.entityId}
          </p>
        </div>
      ),
    },
    {
      key: 'actor',
      header: t.admin.auditActor,
      cell: (row) => (
        <span className="text-sm">
          {row.actor?.name ?? '—'}
          {row.ip ? (
            <span className="block text-caption text-muted-foreground">{row.ip}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'diff',
      header: t.admin.auditDiff,
      className: 'min-w-[260px]',
      cell: (row) => {
        const changes = changedFields(row.oldValue, row.newValue)
        if (changes.length === 0) {
          return <span className="text-caption text-muted-foreground">{t.admin.auditNoChanges}</span>
        }
        return (
          <ul className="space-y-1">
            {changes.map((change) => (
              <li key={change.field} className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-mono text-caption text-muted-foreground">
                  {change.field}
                </span>
                {/* `min-w-0` on every value: a flex item will not shrink below its own
                    content otherwise, and an audit value is regularly one unbroken JSON
                    string that would then push the card off a 320px screen. */}
                {change.unchanged ? (
                  <span className="min-w-0 break-words text-caption text-muted-foreground">
                    {change.after}
                  </span>
                ) : (
                  <>
                    <span className="min-w-0 break-words text-caption text-muted-foreground line-through">
                      {change.before}
                    </span>
                    <span aria-hidden className="text-caption text-muted-foreground">
                      →
                    </span>
                    <span className="min-w-0 break-words text-caption font-medium">
                      {change.after}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )
      },
    },
    {
      key: 'reason',
      header: t.admin.auditReason,
      cell: (row) => <span className="text-sm">{row.reason ?? '—'}</span>,
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
          <span className="mb-1.5 block text-sm font-medium">{t.admin.auditActor}</span>
          <Select name="actor" defaultValue={actorId ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.auditEntity}</span>
          <Select name="entity" defaultValue={entityType ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {ENTITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.auditFrom}</span>
          <Input type="date" name="from" defaultValue={from ?? ''} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.auditTo}</span>
          <Input type="date" name="to" defaultValue={to ?? ''} />
        </label>
      </TableToolbar>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="tnum text-sm text-muted-foreground">
            {fmt(t.admin.totalRows, { count: result.total })}
          </p>
          <ExportLink
            className="ml-auto"
            href={`${localePath(locale, 'admin', 'export')}${buildQuery({
              entity: 'audit',
              actor: actorId,
              entityType,
            })}`}
            label={t.admin.exportCsv}
          />
        </div>

        <DataTable
          rows={result.items}
          columns={columns}
          rowKey={(row) => row.id}
          empty={t.admin.auditEmpty}
          caption={t.admin.auditLog}
        />

        <Pagination
          className="mt-6"
          page={result.page}
          pageCount={result.pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({
              actor: actorId,
              entity: entityType,
              from,
              to,
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
