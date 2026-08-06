import Link from 'next/link'
import {
  ClipboardList,
  Eye,
  Handshake,
  Inbox,
  MessageSquare,
  Package,
  Wallet,
} from 'lucide-react'
import { getDictionary, resolveLocale, fmt } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatNumber, formatRelative } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { REQUEST_OPEN_STATUSES } from '@/lib/constants'
import { requireUser } from '@/server/auth/guards'
import { db } from '@/server/db'
import { getHeaderCounters } from '@/server/services/counters'
import { getCompanyAnalytics } from '@/server/services/analytics'
import { estimateRemainingDays } from '@/server/services/billing'
import { buttonVariants, Card, EmptyState, StatusBadge } from '@/components/ui'
import { StatTile } from '@/components/dashboard/stat-tile'
import { cn } from '@/lib/utils'

/**
 * The overview.
 *
 * Deliberately numbers and links, not charts: the question this screen answers is
 * "does anything need me today", and a sparkline cannot answer it. The real analysis
 * lives one click away under Analytics.
 */

export const dynamic = 'force-dynamic'

const ACTIVE_DEAL_STATUSES = [
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
] as const

interface ActivityItem {
  key: string
  text: string
  href: string
  at: Date
  status: string
  statusLabel: string
}

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireUser(locale, localePath(locale, 'dashboard'))
  const companyId = user.companyId
  if (!companyId) return null

  const [
    company,
    activeProducts,
    activeRequests,
    counters,
    newOffers,
    activeDeals,
    analytics,
    remainingDays,
  ] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: { balanceBani: true, trialEndsAt: true },
    }),
    user.isSeller
      ? db.product.count({ where: { companyId, status: 'ACTIVE', deletedAt: null } })
      : Promise.resolve(0),
    user.isBuyer
      ? db.purchaseRequest.count({
          where: { companyId, status: { in: [...REQUEST_OPEN_STATUSES] }, deletedAt: null },
        })
      : Promise.resolve(0),
    getHeaderCounters(user.id),
    user.isBuyer
      ? db.offer.count({
          where: { status: 'SENT', request: { companyId, deletedAt: null } },
        })
      : db.offer.count({ where: { sellerCompanyId: companyId, status: 'SHORTLISTED' } }),
    db.deal.count({
      where: {
        OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
        status: { in: [...ACTIVE_DEAL_STATUSES] },
      },
    }),
    user.isSeller
      ? getCompanyAnalytics(companyId, 7)
      : Promise.resolve(null),
    user.isSeller ? estimateRemainingDays(companyId) : Promise.resolve(null),
  ])

  const activity = await recentActivity(companyId, user.isSeller, user.isBuyer, locale, t)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">{t.dashboard.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmt(t.dashboard.greeting, { name: user.companyName ?? user.name })}
        </p>
      </div>

      <section aria-label={t.dashboard.overview}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {user.isSeller ? (
            <StatTile
              label={t.dashboard.activeProducts}
              value={formatNumber(activeProducts, locale, 0)}
              icon={<Package />}
              href={localePath(locale, 'dashboard', 'products')}
            />
          ) : null}

          {user.isBuyer ? (
            <StatTile
              label={t.dashboard.activeRequests}
              value={formatNumber(activeRequests, locale, 0)}
              icon={<ClipboardList />}
              href={localePath(locale, 'dashboard', 'requests')}
            />
          ) : null}

          <StatTile
            label={t.dashboard.newMessages}
            value={formatNumber(counters.unreadMessages, locale, 0)}
            icon={<MessageSquare />}
            href={localePath(locale, 'messages')}
            tone={counters.unreadMessages > 0 ? 'success' : 'default'}
          />

          <StatTile
            label={t.dashboard.newOffers}
            value={formatNumber(newOffers, locale, 0)}
            icon={<Inbox />}
            href={
              user.isBuyer
                ? localePath(locale, 'dashboard', 'requests')
                : localePath(locale, 'dashboard', 'offers')
            }
          />

          {user.isSeller ? (
            <StatTile
              label={t.dashboard.views7d}
              value={formatNumber(analytics?.totals.views ?? 0, locale, 0)}
              icon={<Eye />}
              href={localePath(locale, 'dashboard', 'analytics')}
            />
          ) : null}

          <StatTile
            label={t.dashboard.currentDeals}
            value={formatNumber(activeDeals, locale, 0)}
            icon={<Handshake />}
            href={localePath(locale, 'deals')}
          />

          {user.isSeller ? (
            <StatTile
              label={t.dashboard.currentBalance}
              value={formatMoney(company?.balanceBani ?? 0, locale)}
              hint={
                remainingDays !== null
                  ? fmt(t.balance.presetDays, { days: remainingDays })
                  : t.balance.freeNotice
              }
              icon={<Wallet />}
              href={localePath(locale, 'dashboard', 'balance')}
              tone={
                remainingDays !== null && remainingDays <= 3 ? 'warning' : 'default'
              }
            />
          ) : null}
        </div>
      </section>

      {/* An account with nothing in it gets one instruction, not seven empty panels. */}
      {user.isSeller && activeProducts === 0 ? (
        <Card>
          <EmptyState
            icon={<Package />}
            title={t.dashboard.emptyProducts}
            description={t.dashboard.emptyProductsText}
            action={
              <Link href={localePath(locale, 'products', 'new')} className={buttonVariants()}>
                {t.dashboard.addProduct}
              </Link>
            }
          />
        </Card>
      ) : null}

      {user.isBuyer && activeRequests === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title={t.dashboard.emptyRequests}
            description={t.dashboard.emptyRequestsText}
            action={
              <Link href={localePath(locale, 'requests', 'new')} className={buttonVariants()}>
                {t.dashboard.addRequest}
              </Link>
            }
          />
        </Card>
      ) : null}

      <section aria-labelledby="dashboard-activity">
        <h2 id="dashboard-activity" className="mb-3 text-h3">
          {t.dashboard.recentActivity}
        </h2>

        {activity.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {t.dashboard.recentActivityEmpty}
          </p>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {activity.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.text}</span>
                    <StatusBadge status={item.status} label={item.statusLabel} size="sm" />
                    <time
                      dateTime={item.at.toISOString()}
                      className="shrink-0 text-caption text-muted-foreground"
                    >
                      {formatRelative(item.at, locale)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="dashboard-actions">
        <h2 id="dashboard-actions" className="sr-only">
          {t.dashboard.quickActions}
        </h2>
        <div className="flex flex-wrap gap-2">
          {user.isSeller ? (
            <Link href={localePath(locale, 'products', 'new')} className={buttonVariants()}>
              {t.dashboard.addProduct}
            </Link>
          ) : null}
          {user.isBuyer ? (
            <Link
              href={localePath(locale, 'requests', 'new')}
              className={buttonVariants({ variant: user.isSeller ? 'outline' : 'primary' })}
            >
              {t.dashboard.addRequest}
            </Link>
          ) : null}
          <Link
            href={localePath(locale, 'dashboard', 'company')}
            className={cn(buttonVariants({ variant: 'ghost' }), 'ml-auto')}
          >
            {t.company.profileTitle}
          </Link>
        </div>
      </section>
    </div>
  )
}

/**
 * The last few things that happened, from every stream this company takes part in,
 * merged into one list. Each source is capped before the merge so a busy seller's
 * listings cannot crowd out a single incoming offer.
 */
async function recentActivity(
  companyId: string,
  isSeller: boolean,
  isBuyer: boolean,
  locale: 'ru' | 'ro',
  t: Awaited<ReturnType<typeof getDictionary>>,
): Promise<ActivityItem[]> {
  const [products, requests, offers, deals] = await Promise.all([
    isSeller
      ? db.product.findMany({
          where: { companyId, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 4,
          select: { id: true, slug: true, title: true, status: true, updatedAt: true },
        })
      : [],
    isBuyer
      ? db.purchaseRequest.findMany({
          where: { companyId, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 4,
          select: { id: true, slug: true, title: true, status: true, updatedAt: true },
        })
      : [],
    isBuyer
      ? db.offer.findMany({
          where: { request: { companyId, deletedAt: null } },
          orderBy: { createdAt: 'desc' },
          take: 4,
          select: {
            id: true,
            status: true,
            createdAt: true,
            request: { select: { slug: true, title: true } },
          },
        })
      : [],
    db.deal.findMany({
      where: { OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }] },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { id: true, number: true, status: true, createdAt: true },
    }),
  ])

  const productStatus = t.productStatus as Record<string, string | undefined>
  const requestStatus = t.requestStatus as Record<string, string | undefined>
  const dealStatus = t.dealStatus as Record<string, string | undefined>
  // Offer statuses are flat keys in the dictionary rather than a keyed object.
  const offerStatus: Record<string, string | undefined> = {
    SENT: t.offer.sent,
    VIEWED: t.offer.viewed,
    SHORTLISTED: t.offer.shortlisted,
    ACCEPTED: t.offer.accepted,
    REJECTED: t.offer.rejected,
    WITHDRAWN: t.offer.withdrawn,
    EXPIRED: t.offer.expired,
  }

  const items: ActivityItem[] = [
    ...products.map((product) => ({
      key: `product:${product.id}`,
      text: fmt(t.dashboard.activityProduct, { title: product.title }),
      href: localePath(locale, 'products', product.slug),
      at: product.updatedAt,
      status: product.status,
      statusLabel: productStatus[product.status] ?? product.status,
    })),
    ...requests.map((request) => ({
      key: `request:${request.id}`,
      text: fmt(t.dashboard.activityRequest, { title: request.title }),
      href: localePath(locale, 'requests', request.slug),
      at: request.updatedAt,
      status: request.status,
      statusLabel: requestStatus[request.status] ?? request.status,
    })),
    ...offers.map((offer) => ({
      key: `offer:${offer.id}`,
      text: fmt(t.dashboard.activityOffer, { title: offer.request.title }),
      href: localePath(locale, 'requests', offer.request.slug, 'offers'),
      at: offer.createdAt,
      status: offer.status,
      statusLabel: offerStatus[offer.status] ?? offer.status,
    })),
    ...deals.map((deal) => ({
      key: `deal:${deal.id}`,
      text: fmt(t.dashboard.activityDeal, { number: deal.number }),
      href: localePath(locale, 'deals', deal.id),
      at: deal.createdAt,
      status: deal.status,
      statusLabel: dealStatus[deal.status] ?? deal.status,
    })),
  ]

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8)
}
