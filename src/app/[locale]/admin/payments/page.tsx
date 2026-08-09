import type { Metadata } from 'next'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { PAYMENT_STATUSES } from '@/lib/constants'
import { env } from '@/env'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import {
  DataTable,
  ExportLink,
  TableToolbar,
  type DataColumn,
} from '@/components/admin/data-table'
import { PaymentFailButton, WebhookRetryButton } from '@/components/admin/decision-dialog'
import { Alert, Badge, Pagination, Select, StatusBadge } from '@/components/ui'
import { stuckPaymentsWhere } from '../_lib/queries'

/**
 * Payments and the raw webhook log.
 *
 * The two tables belong on one screen because a payment dispute is always answered by
 * comparing them: the provider says it charged the card, and the webhook row shows
 * whether the callback arrived, whether its signature verified, and whether the handler
 * finished. A payment stuck in PENDING with an unprocessed webhook next to it is a
 * different problem from one with no webhook at all.
 *
 * Both recoveries live here too. Re-running a webhook is safe because crediting is keyed
 * on the payment id, so the second press writes nothing; marking a payment FAILED is
 * bookkeeping only and refuses to touch one that already succeeded — undoing a credit is
 * a refund through the ledger, not a status edit.
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
    title: `${t.admin.payments} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminPaymentsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'payments')
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.PaymentWhereInput = status ? { status } : {}

  const [total, stuck, rows, webhooks] = await Promise.all([
    db.payment.count({ where }),
    db.payment.count({ where: stuckPaymentsWhere() }),
    db.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        provider: true,
        providerRef: true,
        amountBani: true,
        status: true,
        failureCode: true,
        createdAt: true,
        completedAt: true,
        company: { select: { id: true, displayName: true } },
      },
    }),
    db.webhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        provider: true,
        externalId: true,
        signatureValid: true,
        processedAt: true,
        error: true,
        createdAt: true,
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const paymentStatuses: Record<string, string | undefined> = {
    PENDING: t.balance.paymentPending,
    SUCCEEDED: t.balance.paymentSuccess,
    FAILED: t.balance.paymentFailed,
    REFUNDED: t.balance.types.REFUND,
  }

  type Row = (typeof rows)[number]
  type WebhookRow = (typeof webhooks)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'company',
      header: t.product.supplier,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-medium">{row.company.displayName}</span>
          <p className="text-caption text-muted-foreground">
            {row.provider}
            {row.providerRef ? ` · ${row.providerRef}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: t.admin.paymentAmount,
      align: 'right',
      cell: (row) => (
        <span className="tnum text-sm font-medium">{formatMoney(row.amountBani, locale)}</span>
      ),
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <StatusBadge status={row.status} label={row.status} />
          <span className="text-caption text-muted-foreground">
            {row.failureCode ?? paymentStatuses[row.status] ?? ''}
          </span>
        </span>
      ),
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
      key: 'completed',
      header: t.balance.balanceAfter,
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.completedAt ? formatDateTime(row.completedAt, locale) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      align: 'right',
      cell: (row) =>
        row.status === 'SUCCEEDED' ? (
          <span className="text-caption text-muted-foreground">—</span>
        ) : (
          <PaymentFailButton paymentId={row.id} />
        ),
    },
  ]

  const webhookColumns: DataColumn<WebhookRow>[] = [
    {
      key: 'provider',
      header: t.admin.paymentProvider,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-medium">{row.provider}</span>
          <p className="truncate text-caption text-muted-foreground">{row.externalId}</p>
        </div>
      ),
    },
    {
      key: 'signature',
      header: t.admin.signatureValid,
      cell: (row) => (
        <Badge variant={row.signatureValid ? 'success' : 'destructive'} size="sm">
          {row.signatureValid ? t.admin.signatureValid : t.admin.signatureInvalid}
        </Badge>
      ),
    },
    {
      key: 'processed',
      header: t.admin.processed,
      cell: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <Badge variant={row.processedAt ? 'success' : 'warning'} size="sm">
            {row.processedAt ? t.admin.processed : t.admin.notProcessed}
          </Badge>
          {row.error ? (
            <span className="text-caption text-destructive">{row.error}</span>
          ) : null}
        </span>
      ),
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
      cell: (row) =>
        // Only a callback the provider actually signed may be replayed, and only when it
        // has not already completed cleanly.
        row.signatureValid && (row.processedAt === null || row.error !== null) ? (
          <WebhookRetryButton eventId={row.id} />
        ) : (
          <span className="text-caption text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      {env.PAYMENT_DRIVER === 'mock' ? (
        <Alert variant="warning">{t.admin.driverMockWarning}</Alert>
      ) : null}

      {stuck > 0 ? (
        <Alert variant="warning" title={t.admin.pendingPayments}>
          {fmt(t.admin.totalRows, { count: stuck })} · {t.admin.retryWebhookHint}
        </Alert>
      ) : null}

      <section className="space-y-5">
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
              {PAYMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
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
                entity: 'payments',
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
            caption={t.admin.payments}
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
      </section>

      <section>
        <h2 className="mb-3 text-h3">{t.admin.webhooks}</h2>
        <DataTable
          rows={webhooks}
          columns={webhookColumns}
          rowKey={(row) => row.id}
          empty={t.admin.empty}
          caption={t.admin.webhooks}
        />
      </section>
    </div>
  )
}
