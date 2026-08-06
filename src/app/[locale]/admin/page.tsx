import type { Metadata } from 'next'
import Link from 'next/link'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { getQueueCounts } from '@/server/services/moderation'
import { StatTile } from '@/components/admin/data-table'
import { StatusBadge } from '@/components/ui'

/**
 * Operations overview.
 *
 * Every number on this page is a live count, not a placeholder: the whole point of the
 * screen is to answer "is anything stuck?" at a glance — a growing moderation queue, an
 * unanswered complaint, a day with no deals.
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
    users,
    companies,
    activeProducts,
    activeRequests,
    deals,
    openComplaints,
    queue,
    turnover,
    recentSignups,
    recentDeals,
  ] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.company.count({ where: { deletedAt: null } }),
    db.product.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    db.purchaseRequest.count({
      where: { status: { in: ['ACTIVE', 'RECEIVING_OFFERS'] }, deletedAt: null },
    }),
    db.deal.count(),
    db.complaint.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    getQueueCounts(),
    // Turnover is the gross movement through the ledger, so a top-up and the charge it
    // pays for both count — netting them would report zero on a healthy day.
    db.ledgerEntry.aggregate({ _sum: { amountBani: true }, where: { amountBani: { gt: 0 } } }),
    db.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 8,
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
      take: 8,
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
  ])

  const dealStatuses = t.dealStatus as Record<string, string | undefined>
  const roles = t.admin.roles as Record<string, string | undefined>

  return (
    <div className="space-y-6">
      <section aria-label={t.admin.dashboard}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            href={localePath(locale, 'admin', 'products')}
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
            label={t.admin.statPendingModeration}
            value={queue.total}
            href={localePath(locale, 'moderation')}
          />
          <StatTile
            label={t.admin.statOpenComplaints}
            value={openComplaints}
            href={localePath(locale, 'admin', 'complaints')}
          />
          <StatTile
            label={t.admin.statLedgerVolume}
            value={formatMoney(turnover._sum.amountBani ?? 0, locale)}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* -------------------------------------------------- recent signups */}
        <section>
          <h2 className="text-h3">{t.admin.recentSignups}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {recentSignups.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t.admin.empty}
              </li>
            ) : (
              recentSignups.map((user) => (
                <li key={user.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-3">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-caption text-muted-foreground">
                    {user.companies[0]?.company.displayName ?? user.email ?? user.phone ?? ''}
                  </span>
                  <span className="ml-auto text-caption text-muted-foreground">
                    {roles[user.role] ?? user.role} · {formatDateTime(user.createdAt, locale)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* ---------------------------------------------------- recent deals */}
        <section>
          <h2 className="text-h3">{t.admin.recentDeals}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
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
                    <span className="min-w-0 truncate text-sm">{deal.title}</span>
                    <span className="tnum ml-auto text-sm font-medium">
                      {formatMoney(deal.totalBani, locale)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={deal.status}
                      size="sm"
                      label={dealStatuses[deal.status] ?? deal.status}
                    />
                    <span className="text-caption text-muted-foreground">
                      {deal.buyerCompany.displayName} ← {deal.sellerCompany.displayName}
                    </span>
                    <span className="ml-auto text-caption text-muted-foreground">
                      {formatDateTime(deal.createdAt, locale)}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
