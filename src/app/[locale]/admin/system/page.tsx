import type { Metadata } from 'next'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { env } from '@/env'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { reconcileBalance } from '@/server/services/ledger'
import { StatTile } from '@/components/admin/data-table'
import { Alert, Badge } from '@/components/ui'

/**
 * System status.
 *
 * Two questions this page answers and nothing else does.
 *
 * 1. Which adapters is this deployment actually running? A staging build that quietly
 *    ships to production with the mock payment driver takes money from nobody and looks
 *    fine until the first invoice. Driver NAMES only — never a key, a password or a
 *    connection string, because this page is screenshotted and pasted into chats.
 *
 * 2. Do the balances add up? `Company.balanceBani` is a cache of the ledger sum, and the
 *    two can only diverge if a write escaped the transaction boundary. That is a genuine
 *    bug, so it is checked here rather than assumed.
 */

export const dynamic = 'force-dynamic'

/** Bounded so the page stays fast on a large database; ordered by most recent activity. */
const RECONCILE_LIMIT = 200

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.systemStatus} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminSystemPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const [
    users,
    companies,
    products,
    requests,
    deals,
    ledgerEntries,
    payments,
    documents,
    withLedger,
  ] = await Promise.all([
    db.user.count(),
    db.company.count(),
    db.product.count(),
    db.purchaseRequest.count(),
    db.deal.count(),
    db.ledgerEntry.count(),
    db.payment.count(),
    db.document.count(),
    // Only companies that have ledger history can be inconsistent.
    db.ledgerEntry.findMany({
      distinct: ['companyId'],
      orderBy: { createdAt: 'desc' },
      take: RECONCILE_LIMIT,
      select: { companyId: true, company: { select: { displayName: true } } },
    }),
  ])

  const reconciliations = await Promise.all(
    withLedger.map(async (row) => ({
      companyId: row.companyId,
      displayName: row.company.displayName,
      ...(await reconcileBalance(row.companyId)),
    })),
  )

  const mismatches = reconciliations.filter((row) => !row.consistent)

  const adapters: { label: string; value: string; mock: boolean }[] = [
    { label: t.admin.dbProvider, value: env.DATABASE_PROVIDER, mock: false },
    { label: t.admin.storageDriver, value: env.STORAGE_DRIVER, mock: env.STORAGE_DRIVER === 'local' },
    { label: t.admin.mailDriver, value: env.MAIL_DRIVER, mock: env.MAIL_DRIVER === 'console' },
    { label: t.admin.smsDriver, value: env.SMS_DRIVER, mock: env.SMS_DRIVER === 'mock' },
    {
      label: t.admin.paymentDriver,
      value: env.PAYMENT_DRIVER,
      mock: env.PAYMENT_DRIVER === 'mock',
    },
  ]

  const anyMock = adapters.some((adapter) => adapter.mock)

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- adapters */}
      <section>
        <h2 className="text-h3">{t.admin.environment}</h2>

        {anyMock ? (
          <Alert variant="warning" className="mt-3">
            {t.admin.driverMockWarning}
          </Alert>
        ) : null}

        <dl className="surface mt-3 divide-y divide-border">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <dt className="text-sm text-muted-foreground">NODE_ENV</dt>
            <dd className="ml-auto font-mono text-sm">{env.NODE_ENV}</dd>
          </div>
          {adapters.map((adapter) => (
            <div key={adapter.label} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <dt className="text-sm text-muted-foreground">{adapter.label}</dt>
              <dd className="ml-auto flex items-center gap-2">
                <span className="font-mono text-sm">{adapter.value}</span>
                {adapter.mock ? (
                  <Badge variant="warning" size="sm">
                    mock
                  </Badge>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-2 text-caption text-muted-foreground">{t.admin.secretsNotice}</p>
      </section>

      {/* ---------------------------------------------------------- counts */}
      <section>
        <h2 className="text-h3">{t.admin.counts}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label={t.admin.statUsers} value={users} />
          <StatTile label={t.admin.statCompanies} value={companies} />
          <StatTile label={t.admin.products} value={products} />
          <StatTile label={t.admin.requests} value={requests} />
          <StatTile label={t.admin.deals} value={deals} />
          <StatTile label={t.admin.documents} value={documents} />
          <StatTile label={t.admin.payments} value={payments} />
          <StatTile label={t.balance.history} value={ledgerEntries} />
        </div>
      </section>

      {/* --------------------------------------------------- balance check */}
      <section>
        <h2 className="text-h3">{t.admin.balanceCheck}</h2>

        {mismatches.length === 0 ? (
          <Alert variant="success" className="mt-3">
            {t.admin.balanceConsistent}
          </Alert>
        ) : (
          <>
            <Alert variant="destructive" className="mt-3">
              {fmt(t.admin.balanceMismatch, { count: mismatches.length })}
            </Alert>
            <ul className="surface mt-3 divide-y divide-border">
              {mismatches.map((row) => (
                <li key={row.companyId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="text-sm font-medium">{row.displayName}</span>
                  <span className="tnum ml-auto text-sm">
                    {t.admin.cachedBalance}: {formatMoney(row.cached, locale)}
                  </span>
                  <span className="tnum text-sm text-destructive">
                    {t.admin.computedBalance}: {formatMoney(row.computed, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-2 text-caption text-muted-foreground">
          {fmt(t.admin.totalRows, { count: reconciliations.length })}
        </p>
      </section>
    </div>
  )
}
