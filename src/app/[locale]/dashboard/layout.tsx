import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireUser } from '@/server/auth/guards'
import { db } from '@/server/db'
import { getHeaderCounters } from '@/server/services/counters'
import { SidebarNav, type SidebarNavItem } from '@/components/dashboard/sidebar-nav'

/**
 * The authenticated account shell.
 *
 * Two decisions live here and nowhere else:
 *
 *   1. Access. `requireUser` re-reads the session from the database, and a user who
 *      has not finished onboarding is sent to finish it — every page below this
 *      layout can then assume a company exists.
 *   2. Which sections exist at all. A pure buyer has no listings, no statistics and no
 *      balance to spend, so those links are not rendered for them; a pure seller has
 *      no purchase requests. This is presentation only — each page re-checks its own
 *      guard, because a hidden link is not an access control.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.dashboard.title, robots: { index: false, follow: false } }
}

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireUser(locale, localePath(locale, 'dashboard'))
  if (!user.companyId) redirect(localePath(locale, 'onboarding'))

  const [counters, newOffers] = await Promise.all([
    getHeaderCounters(user.id),
    user.isBuyer
      ? db.offer.count({
          where: { status: 'SENT', request: { companyId: user.companyId, deletedAt: null } },
        })
      : Promise.resolve(0),
  ])

  const items: SidebarNavItem[] = [
    { href: localePath(locale, 'dashboard'), label: t.dashboard.overview, exact: true },
  ]

  if (user.isSeller) {
    items.push({
      href: localePath(locale, 'dashboard', 'products'),
      label: t.dashboard.myProducts,
    })
  }

  if (user.isBuyer) {
    items.push({
      href: localePath(locale, 'dashboard', 'requests'),
      label: t.dashboard.myRequests,
      badge: newOffers,
    })
  }

  if (user.isSeller) {
    items.push({ href: localePath(locale, 'dashboard', 'offers'), label: t.dashboard.offers })
  }

  items.push(
    { href: localePath(locale, 'deals'), label: t.dashboard.deals },
    {
      href: localePath(locale, 'messages'),
      label: t.dashboard.messages,
      badge: counters.unreadMessages,
    },
  )

  if (user.isSeller) {
    items.push(
      { href: localePath(locale, 'dashboard', 'statistics'), label: t.dashboard.statistics },
      { href: localePath(locale, 'dashboard', 'balance'), label: t.dashboard.balance },
    )
  }

  items.push(
    { href: localePath(locale, 'dashboard', 'company'), label: t.dashboard.company },
    { href: localePath(locale, 'dashboard', 'verification'), label: t.dashboard.verification },
    { href: localePath(locale, 'dashboard', 'settings'), label: t.dashboard.settings },
  )

  return (
    <div className="container py-6">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <SidebarNav items={items} label={t.dashboard.menuLabel} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
