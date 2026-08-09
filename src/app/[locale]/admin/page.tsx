import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { env, isProduction } from '@/env'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { getQueueCounts } from '@/server/services/moderation'
import { getFlags } from '@/server/services/feature-flags'
import { AUDIT_MODERATION_PREFIX, listAudit } from '@/server/services/audit'
import { ActionQueueCard, StatTile } from '@/components/admin/data-table'
import { Alert, StatusBadge, buttonVariants } from '@/components/ui'
import { findBalanceMismatches, stuckPaymentsWhere } from './_lib/queries'

/**
 * Operations overview.
 *
 * The screen answers one question — *what needs me right now* — and only then reports
 * how big the platform is. That ordering is the whole point: a page that opens with
 * "1 284 пользователей" tells an operator nothing they can act on, while "три документа
 * ждут проверки" is a morning's work stated in one line.
 *
 * Each queue tile is a link into the already-filtered list, and an empty queue reads as
 * «всё чисто» rather than a bare 0 — the difference between data and an answer.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.dashboard} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminDashboardPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const [
    queue,
    openComplaints,
    pendingDocuments,
    stuckPayments,
    mismatches,
    flags,
    users,
    companies,
    activeProducts,
    activeRequests,
    deals,
    turnover,
    recentSignups,
    recentDeals,
    recentDecisions,
  ] = await Promise.all([
    getQueueCounts(),
    db.complaint.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    db.document.count({ where: { status: 'PENDING' } }),
    db.payment.count({ where: stuckPaymentsWhere() }),
    findBalanceMismatches(),
    getFlags(),
    db.user.count({ where: { deletedAt: null } }),
    db.company.count({ where: { deletedAt: null } }),
    db.product.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    db.purchaseRequest.count({
      where: { status: { in: ['ACTIVE', 'RECEIVING_OFFERS'] }, deletedAt: null },
    }),
    db.deal.count(),
    // Turnover is the gross movement through the ledger, so a top-up and the charge it
    // pays for both count — netting them would report zero on a healthy day.
    db.ledgerEntry.aggregate({ _sum: { amountBani: true }, where: { amountBani: { gt: 0 } } }),
    db.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        companies: { select: { company: { select: { displayName: true } } }, take: 1 },
      },
    }),
    db.deal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        totalBani: true,
        createdAt: true,
        buyerCompany: { select: { displayName: true } },
        sellerCompany: { select: { displayName: true } },
      },
    }),
    listAudit({ actionPrefix: AUDIT_MODERATION_PREFIX, pageSize: 6 }),
  ])

  const dealStatuses = t.dealStatus as Record<string, string | undefined>
  const roles = t.admin.roles as Record<string, string | undefined>

  // Driver names only — never a key, a password or a connection string. This page gets
  // screenshotted into chats.
  const mockDrivers = [
    env.STORAGE_DRIVER === 'local' ? `storage: ${env.STORAGE_DRIVER}` : null,
    env.MAIL_DRIVER === 'console' ? `mail: ${env.MAIL_DRIVER}` : null,
    env.SMS_DRIVER === 'mock' ? `sms: ${env.SMS_DRIVER}` : null,
    env.PAYMENT_DRIVER === 'mock' ? `payments: ${env.PAYMENT_DRIVER}` : null,
  ].filter((value): value is string => value !== null)

  const queueTiles = [
    {
      key: 'products',
      label: t.admin.queueProducts,
      count: queue.PRODUCT ?? 0,
      href: localePath(locale, 'moderation', 'products'),
      tone: 'attention' as const,
    },
    {
      key: 'documents',
      label: t.admin.queueDocuments,
      count: pendingDocuments,
      href: localePath(locale, 'moderation', 'documents'),
      tone: 'attention' as const,
    },
    {
      key: 'complaints',
      label: t.admin.queueComplaints,
      count: openComplaints,
      href: `${localePath(locale, 'admin', 'complaints')}?status=OPEN`,
      tone: 'critical' as const,
    },
    {
      key: 'reviews',
      label: t.admin.queueReviews,
      count: queue.REVIEW ?? 0,
      href: localePath(locale, 'moderation', 'reviews'),
      tone: 'attention' as const,
    },
    {
      key: 'payments',
      label: t.admin.queuePayments,
      count: stuckPayments,
      href: `${localePath(locale, 'admin', 'payments')}?status=PENDING`,
      tone: 'attention' as const,
    },
    {
      key: 'balances',
      label: t.admin.queueBalances,
      count: mismatches.length,
      href: `${localePath(locale, 'admin', 'balances')}?mismatch=1`,
      tone: 'critical' as const,
    },
  ]

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ alarms */}
      {mockDrivers.length > 0 ? (
        <Alert
          variant={isProduction ? 'destructive' : 'warning'}
          icon={<ShieldAlert aria-hidden className="h-[18px] w-[18px]" />}
          title={isProduction ? t.admin.driverMockWarning : undefined}
        >
          {isProduction
            ? fmt(t.admin.mockInProductionWarning, { drivers: mockDrivers.join(', ') })
            : `${t.admin.driverMockWarning} ${mockDrivers.join(', ')}`}
        </Alert>
      ) : null}

      {flags.REQUIRE_ADMIN_2FA ? null : (
        <Alert
          variant="destructive"
          icon={<ShieldAlert aria-hidden className="h-[18px] w-[18px]" />}
          title={t.admin.twoFactorOffWarning}
        >
          <Link
            href={localePath(locale, 'admin', 'flags')}
            className="rounded font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.admin.twoFactorOffAction}
          </Link>
        </Alert>
      )}

      {/* ------------------------------------------------------ action queue */}
      <section aria-labelledby="admin-action-queue">
        <h2 id="admin-action-queue" className="text-h3">
          {t.admin.actionQueue}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.admin.actionQueueHint}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {queueTiles.map((tile) => (
            <ActionQueueCard
              key={tile.key}
              label={tile.label}
              count={tile.count}
              href={tile.href}
              tone={tile.tone}
              clearLabel={t.admin.allClear}
              openLabel={t.admin.openSection}
            />
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- counters */}
      <section aria-labelledby="admin-platform-stats">
        <h2 id="admin-platform-stats" className="text-h3">
          {t.admin.platformStats}
        </h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            label={t.admin.statUsers}
            value={users}
            href={localePath(locale, 'admin', 'users')}
          />
          <StatTile
            label={t.admin.statCompanies}
            value={companies}
            href={localePath(locale, 'admin', 'companies')}
          />
          <StatTile
            label={t.admin.statProducts}
            value={activeProducts}
            href={`${localePath(locale, 'admin', 'products')}?status=ACTIVE`}
          />
          <StatTile
            label={t.admin.statRequests}
            value={activeRequests}
            href={localePath(locale, 'admin', 'requests')}
          />
          <StatTile
            label={t.admin.statDeals}
            value={deals}
            href={localePath(locale, 'admin', 'deals')}
          />
          <StatTile
            label={t.admin.statLedgerVolume}
            value={formatMoney(turnover._sum.amountBani ?? 0, locale)}
            href={localePath(locale, 'admin', 'balances')}
          />
        </div>
      </section>

      {/* -------------------------------------------------- recent activity */}
      <section aria-labelledby="admin-recent-activity">
        <h2 id="admin-recent-activity" className="text-h3">
          {t.admin.recentActivity}
        </h2>

        <div className="mt-3 grid gap-5 xl:grid-cols-3">
          {/* -------------------------------------------- recent signups */}
          <section>
            <h3 className="text-sm font-semibold">{t.admin.recentSignups}</h3>
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
              {recentSignups.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t.admin.empty}
                </li>
              ) : (
                recentSignups.map((user) => (
                  <li key={user.id} className="px-4 py-3">
                    <Link
                      href={localePath(locale, 'admin', 'users', user.id)}
                      className="rounded text-sm font-medium text-primary hover:text-primary-hover"
                    >
                      {user.name}
                    </Link>
                    <p className="text-caption text-muted-foreground">
                      {user.companies[0]?.company.displayName ?? user.email ?? user.phone ?? ''}
                    </p>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      {roles[user.role] ?? user.role} · {formatDateTime(user.createdAt, locale)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </section>

          {/* ---------------------------------------------- recent deals */}
          <section>
            <h3 className="text-sm font-semibold">{t.admin.recentDeals}</h3>
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
              {recentDeals.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t.admin.empty}
                </li>
              ) : (
                recentDeals.map((deal) => (
                  <li key={deal.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <Link
                        href={localePath(locale, 'admin', 'deals')}
                        className="rounded text-sm font-medium text-primary hover:text-primary-hover"
                      >
                        {deal.number}
                      </Link>
                      <span className="tnum ml-auto text-sm font-medium">
                        {formatMoney(deal.totalBani, locale)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-caption text-muted-foreground">
                      {deal.buyerCompany.displayName} ← {deal.sellerCompany.displayName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={deal.status}
                        size="sm"
                        label={dealStatuses[deal.status] ?? deal.status}
                      />
                      <span className="text-caption text-muted-foreground">
                        {formatDateTime(deal.createdAt, locale)}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          {/* ----------------------------------- recent moderator verdicts */}
          <section>
            <h3 className="text-sm font-semibold">{t.admin.recentDecisions}</h3>
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
              {recentDecisions.items.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t.admin.auditEmpty}
                </li>
              ) : (
                recentDecisions.items.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <span className="font-mono text-caption font-medium text-primary">
                      {row.action}
                    </span>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      {row.actor?.name ?? '—'} · {formatDateTime(row.createdAt, locale)}
                    </p>
                    {row.reason ? (
                      <p className="mt-1 line-clamp-2 text-caption text-muted-foreground">
                        {row.reason}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
            <Link
              href={localePath(locale, 'admin', 'audit')}
              className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'mt-2' })}
            >
              {t.admin.auditLog}
            </Link>
          </section>
        </div>
      </section>
    </div>
  )
}
