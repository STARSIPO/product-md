import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDate, formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { COMPANY_STATUSES, VERIFICATION_TYPES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { reconcileBalance } from '@/server/services/ledger'
import { listAudit } from '@/server/services/audit'
import {
  CompanyActions,
  CompanyBadgeEditor,
  TrialExtendButton,
  type BadgeRow,
} from '@/components/admin/decision-dialog'
import { Alert, Badge, StatusBadge, buttonVariants } from '@/components/ui'

/**
 * One company: status, verification, money, people.
 *
 * The balance is shown but never edited as a number. `Company.balanceBani` is a cache of
 * the ledger, so a correction goes in as an ADJUSTMENT entry with a reason and the cache
 * follows from it — which is also why this page reconciles the two and says so out loud
 * when they disagree.
 *
 * All eight badge types are listed, granted or not. A screen that only showed the badges
 * a company already has would hide the one an operator came to award.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.companyCard} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminCompanyPage({
  params,
}: {
  params: { locale: string; id: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const company = await db.company.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      slug: true,
      displayName: true,
      legalName: true,
      idno: true,
      orgType: true,
      status: true,
      blockReason: true,
      balanceBani: true,
      trialEndsAt: true,
      isBuyer: true,
      isSeller: true,
      ratingAvg: true,
      ratingCount: true,
      dealsCompleted: true,
      createdAt: true,
      deletedAt: true,
      badges: {
        select: { type: true, status: true, expiresAt: true, note: true },
      },
      members: {
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      _count: { select: { products: true, requests: true, documents: true } },
    },
  })

  if (!company || company.deletedAt) notFound()

  const [ledger, reconciliation, history] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        amountBani: true,
        balanceAfterBani: true,
        description: true,
        createdAt: true,
      },
    }),
    reconcileBalance(company.id),
    listAudit({ entityType: 'COMPANY', entityId: company.id, pageSize: 12 }),
  ])

  const companyStatuses = t.admin.companyStatuses as Record<string, string | undefined>
  const badgeStatuses = t.verification.statuses as Record<string, string | undefined>
  const ledgerTypes = t.balance.types as Record<string, string | undefined>
  const orgTypes = t.orgTypes as Record<string, string | undefined>

  const statusOptions = COMPANY_STATUSES.map((value) => ({
    value,
    label: companyStatuses[value] ?? value,
  }))

  const byType = new Map(company.badges.map((badge) => [badge.type, badge]))

  // Every type is offered, not only the ones already awarded — the operator is usually
  // here to grant the badge the company does *not* have yet.
  const badgeRows: BadgeRow[] = VERIFICATION_TYPES.map((type) => {
    const badge = byType.get(type)
    const granted = badge?.status === 'APPROVED'
    return {
      type,
      granted,
      statusLabel: badge
        ? (badgeStatuses[badge.status] ?? badge.status)
        : t.verification.notRequested,
      expiresLabel: badge?.expiresAt
        ? `${t.admin.badgeExpiresAt} ${formatDate(badge.expiresAt, locale)}`
        : null,
      note: badge?.note ?? null,
    }
  })

  return (
    <div className="space-y-6">
      <Link
        href={localePath(locale, 'admin', 'companies')}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-sm font-medium text-primary hover:text-primary-hover"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t.admin.backToList}
      </Link>

      {/* --------------------------------------------------------- identity */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h3">{company.displayName}</h2>
          <StatusBadge
            status={company.status}
            label={companyStatuses[company.status] ?? company.status}
          />
          {company.isSeller ? (
            <Badge variant="outline" size="sm">
              {t.deal.seller}
            </Badge>
          ) : null}
          {company.isBuyer ? (
            <Badge variant="outline" size="sm">
              {t.deal.buyer}
            </Badge>
          ) : null}
        </div>

        {company.blockReason ? (
          <p className="mt-2 text-sm text-muted-foreground">{company.blockReason}</p>
        ) : null}

        <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-caption text-muted-foreground">{t.company.legalName}</dt>
            <dd className="text-sm">
              {company.legalName} · {orgTypes[company.orgType] ?? company.orgType}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-caption text-muted-foreground">{t.company.idno}</dt>
            <dd className="tnum text-sm">{company.idno ?? '—'}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-caption text-muted-foreground">{t.admin.registered}</dt>
            <dd className="text-sm">{formatDateTime(company.createdAt, locale)}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-caption text-muted-foreground">{t.admin.countsHint}</dt>
            <dd className="tnum text-sm">
              {company._count.products} / {company._count.requests} /{' '}
              {company._count.documents}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CompanyActions
            companyId={company.id}
            status={company.status}
            statusOptions={statusOptions}
          />
          <Link
            href={localePath(locale, 'suppliers', company.slug)}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            {t.common.open}
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------- balance */}
      <section>
        <h2 className="text-h3">{t.admin.balance}</h2>

        {reconciliation.consistent ? null : (
          <Alert variant="destructive" className="mt-3">
            {t.admin.cachedBalance}: {formatMoney(reconciliation.cached, locale)} ·{' '}
            {t.admin.computedBalance}: {formatMoney(reconciliation.computed, locale)}
          </Alert>
        )}

        <div className="surface mt-3 p-4">
          <p className="tnum text-h2">{formatMoney(company.balanceBani, locale)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.trialEndsAt
              ? fmt(t.admin.trialEndsAt, { date: formatDate(company.trialEndsAt, locale) })
              : t.admin.trialNone}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <TrialExtendButton companyId={company.id} />
            <Link
              href={`${localePath(locale, 'admin', 'balances')}?company=${encodeURIComponent(company.id)}`}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              {t.admin.ledgerTitle}
            </Link>
          </div>
        </div>

        <h3 className="mt-4 text-sm font-semibold">{t.admin.ledgerRecent}</h3>
        <ul className="surface mt-3 divide-y divide-border">
          {ledger.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t.balance.emptyHistory}
            </li>
          ) : (
            ledger.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="text-sm">{ledgerTypes[entry.type] ?? entry.type}</span>
                <span className="text-caption text-muted-foreground">
                  {entry.description ?? ''}
                </span>
                <span
                  className={`tnum ml-auto text-sm font-medium ${
                    entry.amountBani < 0 ? 'text-destructive' : 'text-success'
                  }`}
                >
                  {entry.amountBani > 0 ? '+' : ''}
                  {formatMoney(entry.amountBani, locale)}
                </span>
                <span className="tnum w-full text-caption text-muted-foreground sm:w-auto">
                  {t.admin.ledgerBalanceAfter}: {formatMoney(entry.balanceAfterBani, locale)} ·{' '}
                  {formatDateTime(entry.createdAt, locale)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* ----------------------------------------------------------- badges */}
      <section>
        <h2 className="text-h3">{t.admin.badgesTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.admin.badgesHint}</p>
        <div className="mt-3">
          <CompanyBadgeEditor companyId={company.id} rows={badgeRows} />
        </div>
      </section>

      {/* ---------------------------------------------------------- members */}
      <section>
        <h2 className="text-h3">{t.admin.companyMembers}</h2>
        <ul className="surface mt-3 divide-y divide-border">
          {company.members.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t.admin.empty}
            </li>
          ) : (
            company.members.map((member) => (
              <li key={member.user.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Link
                  href={localePath(locale, 'admin', 'users', member.user.id)}
                  className="rounded text-sm font-medium text-primary hover:text-primary-hover"
                >
                  {member.user.name}
                </Link>
                <span className="text-caption text-muted-foreground">
                  {member.user.email ?? ''}
                </span>
                <Badge className="ml-auto" variant="outline" size="sm">
                  {member.role}
                </Badge>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* ------------------------------------------------------ audit trail */}
      <section>
        <h2 className="text-h3">{t.admin.changeHistory}</h2>
        <ul className="surface mt-3 divide-y divide-border">
          {history.items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t.admin.auditEmpty}
            </li>
          ) : (
            history.items.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-medium text-primary">{row.action}</span>
                  <span className="ml-auto text-caption text-muted-foreground">
                    {row.actor?.name ?? '—'} · {formatDateTime(row.createdAt, locale)}
                  </span>
                </div>
                {row.reason ? <p className="mt-1 text-sm">{row.reason}</p> : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}
