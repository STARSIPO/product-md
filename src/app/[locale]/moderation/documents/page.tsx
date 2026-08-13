import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDate, formatDateTime } from '@/lib/i18n/format'
import { parsePage, buildQuery } from '@/lib/utils'
import { DOCUMENT_STATUSES } from '@/lib/constants'
import { requireModerator } from '@/server/auth/guards'
import {
  badgeForDocumentType,
  findTaskFor,
  getDocumentForReview,
  listModerationDocuments,
} from '@/server/services/moderation'
import { listAudit } from '@/server/services/audit'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { DecisionPanel } from '@/components/admin/decision-dialog'
import {
  Alert,
  Badge,
  EmptyState,
  Input,
  Pagination,
  Select,
  StatusBadge,
  buttonVariants,
} from '@/components/ui'

/**
 * Document verification.
 *
 * The file is only ever reachable through `/api/files/<key>`, which re-checks on every
 * single request that the reader is the owner or a moderator. No storage key, signed URL
 * or bucket path is rendered into the page: a forwarded screenshot of this screen must
 * not become a way to read somebody's company registration.
 *
 * Approving a document grants the matching public badge — that is the only thing buyers
 * ever see of it.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.moderation.documents} — ${t.moderation.title}`,
    robots: { index: false, follow: false },
  }
}

type DocumentRow = Awaited<ReturnType<typeof listModerationDocuments>>['items'][number]

export default async function ModerationDocumentsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireModerator(locale)

  const basePath = localePath(locale, 'moderation', 'documents')
  const id = typeof searchParams.id === 'string' ? searchParams.id : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const q = typeof searchParams.q === 'string' ? searchParams.q : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const docTypes = t.verification.docTypes as Record<string, string | undefined>
  const docStatuses = t.verification.statuses as Record<string, string | undefined>
  const badgeTypes = t.verification.types as Record<string, string | undefined>

  // --- single document -------------------------------------------------------
  if (id) {
    const [document, task, history] = await Promise.all([
      getDocumentForReview(id),
      findTaskFor('DOCUMENT', id),
      listAudit({ entityType: 'DOCUMENT', entityId: id, pageSize: 10 }),
    ])

    if (!document) {
      return (
        <EmptyState
          className="surface"
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

    // Private object: served by the guarded route, never by the storage adapter.
    const fileHref = `/api/files/${document.fileKey}`
    const isImage = document.mimeType.startsWith('image/')
    const grantedBadge = badgeForDocumentType(document.type)

    const facts: { label: string; value: string }[] = [
      { label: t.verification.documentType, value: docTypes[document.type] ?? document.type },
      { label: t.verification.documentNumber, value: document.number ?? '—' },
      {
        label: t.verification.issuedAt,
        value: document.issuedAt ? formatDate(document.issuedAt, locale) : '—',
      },
      {
        label: t.verification.expiresAt,
        value: document.expiresAt ? formatDate(document.expiresAt, locale) : '—',
      },
      { label: t.company.legalName, value: document.company.legalName },
      { label: t.company.idno, value: document.company.idno ?? '—' },
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="surface min-w-0 space-y-4 p-5">
            <header>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={document.status}
                  label={docStatuses[document.status] ?? document.status}
                />
                {task?.assignedTo ? (
                  <Badge variant="primary" size="sm">
                    {fmt(t.moderation.assignedTo, { name: task.assignedTo.name })}
                  </Badge>
                ) : null}
                <Badge variant="outline" size="sm">
                  {badgeTypes[grantedBadge] ?? grantedBadge}
                </Badge>
              </div>
              <h2 className="mt-2 text-h2">{document.company.displayName}</h2>
            </header>

            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="text-caption text-muted-foreground">{fact.label}</dt>
                  <dd className="text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>

            <div className="surface-muted rounded-md p-3.5">
              <a
                href={fileHref}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                {t.moderation.openFile}
                <span className="sr-only"> ({t.a11y.newTab})</span>
              </a>
              <p className="mt-2 text-caption text-muted-foreground">{t.moderation.fileNotice}</p>

              {isImage ? (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileHref}
                    alt={docTypes[document.type] ?? document.type}
                    loading="lazy"
                    className="max-h-[420px] w-auto rounded-md border border-border object-contain"
                  />
                </div>
              ) : null}
            </div>

            {document.moderatorComment ? (
              <p className="surface-muted rounded-md p-3.5 text-sm">
                <span className="block text-caption text-muted-foreground">
                  {t.verification.moderatorComment}
                </span>
                {document.moderatorComment}
              </p>
            ) : null}

            <section>
              <h3 className="text-sm font-semibold">{t.moderation.documentHistory}</h3>
              <ol className="mt-2 space-y-1.5">
                {document.history.length === 0 ? (
                  <li className="text-sm text-muted-foreground">{t.admin.auditEmpty}</li>
                ) : (
                  document.history.map((entry) => (
                    <li key={entry.id} className="text-sm">
                      <span className="text-muted-foreground">
                        {formatDateTime(entry.createdAt, locale)}
                        {entry.actor ? ` · ${entry.actor.name}` : ''} ·{' '}
                      </span>
                      {docStatuses[entry.toStatus] ?? entry.toStatus}
                      {entry.comment ? (
                        <span className="text-muted-foreground"> — {entry.comment}</span>
                      ) : null}
                    </li>
                  ))
                )}
              </ol>
            </section>
          </article>

          <div className="space-y-4">
            <DecisionPanel kind="document" entityId={document.id} />

            <section className="surface p-5">
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
  const result = await listModerationDocuments({ status, q, page })

  const columns: DataColumn<DocumentRow>[] = [
    {
      key: 'company',
      header: t.product.supplier,
      primary: true,
      cell: (row) => (
        <Link
          href={`${basePath}?id=${encodeURIComponent(row.id)}`}
          className="rounded font-medium text-primary hover:text-primary-hover"
        >
          {row.company.displayName}
        </Link>
      ),
    },
    {
      key: 'type',
      header: t.verification.documentType,
      cell: (row) => <span className="text-sm">{docTypes[row.type] ?? row.type}</span>,
    },
    {
      key: 'number',
      header: t.verification.documentNumber,
      cell: (row) => <span className="text-sm text-muted-foreground">{row.number ?? '—'}</span>,
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
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <StatusBadge status={row.status} label={docStatuses[row.status] ?? row.status} />
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
      <Alert variant="info">{t.verification.privacyNotice}</Alert>

      <TableToolbar
        action={basePath}
        label={t.common.filters}
        submitLabel={t.filters.apply}
        resetHref={basePath}
        resetLabel={t.filters.reset}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.search}</span>
          <Input name="q" defaultValue={q ?? ''} placeholder={t.verification.file} />
        </label>
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
      </TableToolbar>

      <div>
        <p className="mb-3 tnum text-sm text-muted-foreground">
          {fmt(t.admin.totalRows, { count: result.total })}
        </p>

        {result.items.length === 0 ? (
          <EmptyState
            className="surface"
            icon={<FileText aria-hidden />}
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
              caption={t.moderation.documents}
            />
            <Pagination
              className="mt-6"
              page={result.page}
              pageCount={result.pageCount}
              buildHref={(target) =>
                `${basePath}${buildQuery({ q, status, page: target > 1 ? target : undefined })}`
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
