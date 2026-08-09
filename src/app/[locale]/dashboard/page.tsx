import Link from 'next/link'
import { getDictionary, resolveLocale, fmt } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateShort, formatNumber } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { REQUEST_OPEN_STATUSES } from '@/lib/constants'
import { requireUser } from '@/server/auth/guards'
import { db } from '@/server/db'
import { getHeaderCounters } from '@/server/services/counters'
import { estimateRemainingDays } from '@/server/services/billing'
import { buttonVariants } from '@/components/ui'
import { MetricRow, type MetricItem } from '@/components/dashboard/metric-row'
import { AttentionList, type AttentionItem } from '@/components/dashboard/attention-list'

/**
 * The overview.
 *
 * One question, answered in one screen: *does anything need me today*. Four figures that
 * can prompt an action, then the list of things that are actually stuck, then the two or
 * three buttons a person came here to press.
 *
 * Nothing analytical lives here any more. Views, conversion and the per-day series moved
 * to /dashboard/statistics, because a sparkline cannot answer today's question and seven
 * tiles competing for the same glance answer nothing at all.
 */

export const dynamic = 'force-dynamic'

const ACTIVE_DEAL_STATUSES = [
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
] as const

/** A document lapsing inside this window is worth a row; anything further out is noise. */
const EXPIRY_WARNING_DAYS = 30

/** Long enough to be a to-do list, short enough not to need scrolling. */
const MAX_ATTENTION_ITEMS = 6

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireUser(locale, localePath(locale, 'dashboard'))
  const companyId = user.companyId
  if (!companyId) return null

  const [company, counters, newOffers, activeDeals, remainingDays] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: { balanceBani: true },
    }),
    getHeaderCounters(user.id),
    user.isBuyer
      ? db.offer.count({ where: { status: 'SENT', request: { companyId, deletedAt: null } } })
      : db.offer.count({ where: { sellerCompanyId: companyId, status: 'SHORTLISTED' } }),
    db.deal.count({
      where: {
        OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
        status: { in: [...ACTIVE_DEAL_STATUSES] },
      },
    }),
    user.isSeller ? estimateRemainingDays(companyId) : Promise.resolve(null),
  ])

  const attention = await collectAttention({
    companyId,
    isSeller: user.isSeller,
    isBuyer: user.isBuyer,
    remainingDays,
    locale,
    t,
  })

  const metrics: MetricItem[] = [
    {
      key: 'messages',
      label: t.dashboard.newMessages,
      value: formatNumber(counters.unreadMessages, locale, 0),
      href: localePath(locale, 'messages'),
      tone: counters.unreadMessages > 0 ? 'attention' : 'default',
    },
    {
      key: 'offers',
      label: t.dashboard.newOffers,
      value: formatNumber(newOffers, locale, 0),
      href: user.isBuyer
        ? localePath(locale, 'dashboard', 'requests')
        : localePath(locale, 'dashboard', 'offers'),
      tone: newOffers > 0 ? 'attention' : 'default',
    },
    {
      key: 'deals',
      label: t.dashboard.currentDeals,
      value: formatNumber(activeDeals, locale, 0),
      href: localePath(locale, 'deals'),
    },
  ]

  // A buyer has no listings to pay for, so the fourth figure would be a constant zero.
  if (user.isSeller) {
    metrics.push({
      key: 'balance',
      label: t.dashboard.currentBalance,
      value: formatMoney(company?.balanceBani ?? 0, locale),
      href: localePath(locale, 'dashboard', 'balance'),
      tone: remainingDays !== null && remainingDays <= 3 ? 'warning' : 'default',
    })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-h1">
        {fmt(t.dashboard.greeting, { name: user.companyName ?? user.name })}
      </h1>

      <MetricRow items={metrics} label={t.dashboard.keyNumbers} />

      <section aria-labelledby="dashboard-attention">
        <h2 id="dashboard-attention" className="mb-3 text-h3">
          {t.dashboard.attention}
        </h2>
        <AttentionList items={attention} emptyText={t.dashboard.attentionEmpty} />
      </section>

      <section aria-labelledby="dashboard-actions">
        <h2 id="dashboard-actions" className="sr-only">
          {t.dashboard.mainActions}
        </h2>
        {/* Stacked and full width on a phone, side by side from `sm`. A row of three
            buttons at 320px is three unreadable buttons. */}
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {user.isSeller ? (
            <Link
              href={localePath(locale, 'products', 'new')}
              className={buttonVariants({ size: 'lg', fullWidth: true, className: 'sm:w-auto' })}
            >
              {t.dashboard.addProduct}
            </Link>
          ) : null}

          {user.isBuyer ? (
            <Link
              href={localePath(locale, 'requests', 'new')}
              className={buttonVariants({
                variant: user.isSeller ? 'outline' : 'primary',
                size: 'lg',
                fullWidth: true,
                className: 'sm:w-auto',
              })}
            >
              {t.dashboard.addRequest}
            </Link>
          ) : null}

          <Link
            href={localePath(locale, 'products')}
            className={buttonVariants({
              variant: 'outline',
              size: 'lg',
              fullWidth: true,
              className: 'sm:w-auto',
            })}
          >
            {t.dashboard.openCatalog}
          </Link>
        </div>
      </section>
    </div>
  )
}

/**
 * Everything that is stuck, most urgent first.
 *
 * Each source is queried with its own small `take` and the merged list is capped, so one
 * seller's twelve rejected listings cannot bury the single deal waiting on a signature.
 * Ordering is by kind rather than by timestamp: money running out outranks a document
 * that lapses in three weeks, whatever order the rows happened to be written in.
 */
async function collectAttention({
  companyId,
  isSeller,
  isBuyer,
  remainingDays,
  locale,
  t,
}: {
  companyId: string
  isSeller: boolean
  isBuyer: boolean
  remainingDays: number | null
  locale: 'ru' | 'ro'
  t: Awaited<ReturnType<typeof getDictionary>>
}): Promise<AttentionItem[]> {
  const now = Date.now()
  const expiryHorizon = new Date(now + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000)

  const [blockedProducts, incomingOffers, shortlistedOffers, deals, documents] = await Promise.all([
    isSeller
      ? db.product.findMany({
          where: {
            companyId,
            deletedAt: null,
            status: { in: ['REJECTED', 'CHANGES_REQUESTED'] },
          },
          orderBy: { updatedAt: 'desc' },
          take: 3,
          select: { id: true, slug: true, title: true, status: true },
        })
      : [],
    isBuyer
      ? db.offer.findMany({
          where: {
            status: 'SENT',
            request: {
              companyId,
              deletedAt: null,
              status: { in: [...REQUEST_OPEN_STATUSES] },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, request: { select: { slug: true, title: true } } },
        })
      : [],
    isSeller
      ? db.offer.findMany({
          where: { sellerCompanyId: companyId, status: 'SHORTLISTED' },
          orderBy: { createdAt: 'desc' },
          take: 2,
          select: { id: true, request: { select: { slug: true, title: true } } },
        })
      : [],
    db.deal.findMany({
      where: {
        OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
        status: 'AWAITING_CONFIRMATION',
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, number: true },
    }),
    db.document.findMany({
      where: {
        companyId,
        status: 'APPROVED',
        expiresAt: { not: null, lte: expiryHorizon },
      },
      orderBy: { expiresAt: 'asc' },
      take: 3,
      select: { id: true, type: true, expiresAt: true },
    }),
  ])

  const docTypes = t.verification.docTypes as Record<string, string | undefined>
  const items: AttentionItem[] = []

  // 1. Money. Listings stop being shown the moment it runs out, so nothing outranks it.
  if (remainingDays !== null && remainingDays <= 0) {
    items.push({
      key: 'balance:zero',
      text: t.dashboard.attentionZeroBalance,
      href: localePath(locale, 'dashboard', 'balance'),
      tone: 'destructive',
    })
  } else if (remainingDays !== null && remainingDays <= 3) {
    items.push({
      key: 'balance:low',
      text: fmt(t.dashboard.attentionLowBalance, { days: remainingDays }),
      href: localePath(locale, 'dashboard', 'balance'),
      tone: 'warning',
    })
  }

  // 2. A deal nobody has confirmed is a commitment in limbo on both sides.
  for (const deal of deals) {
    items.push({
      key: `deal:${deal.id}`,
      text: fmt(t.dashboard.attentionDealConfirm, { number: deal.number }),
      href: localePath(locale, 'deals', deal.id),
      tone: 'warning',
    })
  }

  // 3. Someone is waiting for an answer.
  for (const offer of incomingOffers) {
    items.push({
      key: `offer:${offer.id}`,
      text: fmt(t.dashboard.attentionOfferIncoming, { title: offer.request.title }),
      href: localePath(locale, 'requests', offer.request.slug, 'offers'),
      tone: 'info',
    })
  }

  for (const offer of shortlistedOffers) {
    items.push({
      key: `offer:${offer.id}`,
      text: fmt(t.dashboard.attentionOfferShortlisted, { title: offer.request.title }),
      href: localePath(locale, 'dashboard', 'offers'),
      tone: 'info',
    })
  }

  // 4. Listings moderation sent back — invisible to buyers until they are fixed.
  for (const product of blockedProducts) {
    items.push({
      key: `product:${product.id}`,
      text: fmt(
        product.status === 'REJECTED'
          ? t.dashboard.attentionProductRejected
          : t.dashboard.attentionProductChanges,
        { title: product.title },
      ),
      href: localePath(locale, 'products', product.slug, 'edit'),
      tone: 'destructive',
    })
  }

  // 5. Paperwork, which lapses quietly and takes the verification badge with it.
  for (const document of documents) {
    const expiresAt = document.expiresAt
    if (!expiresAt) continue

    const expired = expiresAt.getTime() < now
    items.push({
      key: `document:${document.id}`,
      text: expired
        ? fmt(t.dashboard.attentionDocumentExpired, {
            document: docTypes[document.type] ?? document.type,
          })
        : fmt(t.dashboard.attentionDocumentExpiring, {
            document: docTypes[document.type] ?? document.type,
            date: formatDateShort(expiresAt, locale),
          }),
      href: localePath(locale, 'dashboard', 'verification'),
      tone: expired ? 'destructive' : 'warning',
    })
  }

  return items.slice(0, MAX_ATTENTION_ITEMS)
}
