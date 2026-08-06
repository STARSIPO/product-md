import type { Metadata } from 'next'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { getDictionary, resolveLocale, fmt } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDate, formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { parsePage } from '@/lib/utils'
import { DEFAULT_TARIFFS, TOP_UP_PRESETS_BANI } from '@/lib/constants'
import { env } from '@/env'
import { requireSeller } from '@/server/auth/guards'
import { db } from '@/server/db'
import { getBalance, getLedgerHistory } from '@/server/services/ledger'
import { estimateRemainingDays } from '@/server/services/billing'
import { isEnabled } from '@/server/services/feature-flags'
import {
  Alert,
  Card,
  EmptyState,
  Pagination,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroll,
  buttonVariants,
} from '@/components/ui'
import { TopUpForm } from './top-up-form'

/**
 * Balance.
 *
 * Money on this screen is never a float: every figure below is an integer number of
 * bani straight out of the ledger, formatted once at the edge. The history is the
 * ledger itself — an append-only table with the balance after each entry — rather than
 * a derived summary, because "where did my money go" has to be answerable line by line.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

/** The smallest top-up `topUpSchema` accepts. */
const MIN_TOP_UP_BANI = 1000

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.balance.title, robots: { index: false, follow: false } }
}

export default async function DashboardBalancePage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { page?: string; payment?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireSeller(locale, localePath(locale, 'dashboard', 'balance'))
  const page = parsePage(searchParams.page)

  const [balanceBani, history, remainingDays, billingEnabled, company, activeListings, tariff] =
    await Promise.all([
      getBalance(user.companyId),
      getLedgerHistory(user.companyId, page, PAGE_SIZE),
      estimateRemainingDays(user.companyId),
      isEnabled('BILLING_ENABLED'),
      db.company.findUnique({
        where: { id: user.companyId },
        select: { trialEndsAt: true },
      }),
      db.product.count({
        where: { companyId: user.companyId, status: 'ACTIVE', deletedAt: null },
      }),
      db.tariff.findUnique({ where: { key: 'LISTING_DAILY' } }),
    ])

  const listingPriceBani = tariff?.isActive
    ? tariff.priceBani
    : env.LISTING_DAILY_PRICE_BANI || DEFAULT_TARIFFS.LISTING_DAILY?.priceBani || 100

  const dailyCostBani = billingEnabled && activeListings > 0 ? activeListings * listingPriceBani : null

  const onTrial =
    company?.trialEndsAt !== null &&
    company?.trialEndsAt !== undefined &&
    company.trialEndsAt.getTime() > Date.now()

  const ledgerTypes = t.balance.types as Record<string, string | undefined>

  return (
    <div className="space-y-6">
      <h1 className="text-h1">{t.balance.title}</h1>

      <div aria-live="polite" className="space-y-3">
        {searchParams.payment === 'success' ? (
          <Alert variant="success">{t.balance.paymentPending}</Alert>
        ) : null}
        {searchParams.payment === 'cancelled' ? (
          <Alert variant="warning">{t.balance.paymentCancelled}</Alert>
        ) : null}
      </div>

      {/* An honest statement of what is actually being charged today. */}
      {!billingEnabled ? <Alert variant="info">{t.balance.freeNotice}</Alert> : null}
      {billingEnabled && onTrial && company?.trialEndsAt ? (
        <Alert variant="info">
          {fmt(t.balance.trialNotice, { date: formatDate(company.trialEndsAt, locale) })}
        </Alert>
      ) : null}
      {env.PAYMENT_DRIVER === 'mock' ? (
        <Alert variant="warning">{t.balance.mockNotice}</Alert>
      ) : null}

      <section aria-labelledby="balance-current">
        <h2 id="balance-current" className="sr-only">
          {t.balance.current}
        </h2>
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-caption text-muted-foreground">{t.balance.current}</p>
              <p className="tnum mt-1 text-3xl font-semibold">
                {formatMoney(balanceBani, locale)}
              </p>
              {remainingDays !== null ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {fmt(t.balance.presetDays, { days: remainingDays })}
                </p>
              ) : null}
            </div>

            {billingEnabled && dailyCostBani !== null ? (
              <p className="text-sm text-muted-foreground">
                {fmt(t.balance.dailyCost, {
                  amount: formatMoney(dailyCostBani, locale),
                  count: activeListings,
                })}
              </p>
            ) : null}
          </div>

          {billingEnabled && balanceBani <= 0 ? (
            <Alert variant="destructive" className="mt-4">
              {t.balance.zeroBalanceWarning}
            </Alert>
          ) : billingEnabled && remainingDays !== null && remainingDays <= 3 ? (
            <Alert variant="warning" className="mt-4">
              {fmt(t.balance.lowBalanceWarning, { days: remainingDays })}
            </Alert>
          ) : null}
        </Card>
      </section>

      <section aria-labelledby="balance-top-up">
        <h2 id="balance-top-up" className="mb-3 text-h3">
          {t.balance.topUpTitle}
        </h2>
        <Card className="p-4 sm:p-5">
          <TopUpForm
            presets={TOP_UP_PRESETS_BANI}
            dailyCostBani={dailyCostBani}
            minAmountBani={MIN_TOP_UP_BANI}
          />
        </Card>
      </section>

      <section aria-labelledby="balance-history">
        <h2 id="balance-history" className="mb-3 text-h3">
          {t.balance.history}
        </h2>

        {history.entries.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Wallet />}
              title={t.balance.emptyHistory}
              description={t.balance.emptyHistoryText}
            />
          </Card>
        ) : (
          <>
            <Card className="hidden overflow-hidden md:block">
              <TableScroll>
                <Table>
                  <THead>
                    <TR>
                      <TH>{t.common.date}</TH>
                      <TH>{t.balance.operation}</TH>
                      <TH className="text-right">{t.balance.amount}</TH>
                      <TH className="text-right">{t.balance.balanceAfter}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {history.entries.map((entry) => (
                      <TR key={entry.id}>
                        <TD className="whitespace-nowrap text-caption text-muted-foreground">
                          {formatDateTime(entry.createdAt, locale)}
                        </TD>
                        <TD>{ledgerTypes[entry.type] ?? entry.type}</TD>
                        <TD
                          className={
                            entry.amountBani >= 0
                              ? 'tnum whitespace-nowrap text-right font-medium text-success'
                              : 'tnum whitespace-nowrap text-right font-medium'
                          }
                        >
                          {entry.amountBani >= 0 ? '+' : '−'}
                          {formatMoney(Math.abs(entry.amountBani), locale)}
                        </TD>
                        <TD className="tnum whitespace-nowrap text-right">
                          {formatMoney(entry.balanceAfterBani, locale)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableScroll>
            </Card>

            <ul className="space-y-2 md:hidden">
              {history.entries.map((entry) => (
                <li key={entry.id}>
                  <Card className="p-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">
                        {ledgerTypes[entry.type] ?? entry.type}
                      </span>
                      <span
                        className={
                          entry.amountBani >= 0
                            ? 'tnum shrink-0 text-sm font-semibold text-success'
                            : 'tnum shrink-0 text-sm font-semibold'
                        }
                      >
                        {entry.amountBani >= 0 ? '+' : '−'}
                        {formatMoney(Math.abs(entry.amountBani), locale)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-caption text-muted-foreground">
                      <time dateTime={entry.createdAt.toISOString()}>
                        {formatDateTime(entry.createdAt, locale)}
                      </time>
                      <span className="tnum">
                        {t.balance.balanceAfter}: {formatMoney(entry.balanceAfterBani, locale)}
                      </span>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            <Pagination
              className="mt-4"
              page={page}
              pageCount={Math.max(1, Math.ceil(history.total / PAGE_SIZE))}
              buildHref={(target) =>
                `${localePath(locale, 'dashboard', 'balance')}?page=${target}`
              }
              labels={{
                pagination: t.a11y.pagination,
                previous: t.a11y.previousPage,
                next: t.a11y.nextPage,
              }}
            />
          </>
        )}
      </section>

      <p className="text-caption text-muted-foreground">
        <Link
          href={localePath(locale, 'pricing')}
          className={buttonVariants({ variant: 'link', size: 'sm' })}
        >
          {t.pricing.title}
        </Link>
      </p>
    </div>
  )
}
