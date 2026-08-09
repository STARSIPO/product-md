import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireAdmin } from '@/server/auth/guards'
import { getQueueCounts } from '@/server/services/moderation'
import { db } from '@/server/db'
import { AdminNav, type AdminNavGroup } from '@/components/admin/admin-nav'

/**
 * Admin shell.
 *
 * `requireAdmin` also demands an active TOTP enrolment when REQUIRE_ADMIN_2FA is on —
 * an administrator without 2FA is redirected to set it up rather than quietly let in.
 * It runs here *and* in every page below, because a layout is not re-executed on a
 * client-side navigation and would otherwise be a single soft navigation away from
 * being bypassed.
 *
 * The sections are grouped rather than listed flat. Fourteen sibling links is a
 * directory, not a navigation: the owner opens the panel to answer "what needs me",
 * and the grouping is the first half of that answer — the action queue on the Обзор
 * page is the second.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: t.admin.title,
    robots: { index: false, follow: false },
  }
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  await requireAdmin(locale)

  const [queue, openComplaints, pendingDocuments, pendingPayments] = await Promise.all([
    getQueueCounts(),
    db.complaint.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    db.document.count({ where: { status: 'PENDING' } }),
    db.payment.count({ where: { status: 'PENDING' } }),
  ])

  const groups: AdminNavGroup[] = [
    {
      id: 'overview',
      label: '',
      items: [{ href: localePath(locale, 'admin'), label: t.admin.dashboard }],
    },
    {
      id: 'people',
      label: t.admin.groupPeople,
      items: [
        { href: localePath(locale, 'admin', 'users'), label: t.admin.users },
        { href: localePath(locale, 'admin', 'companies'), label: t.admin.companies },
        {
          href: localePath(locale, 'admin', 'verification'),
          label: t.admin.verification,
          count: pendingDocuments,
        },
      ],
    },
    {
      id: 'content',
      label: t.admin.groupContent,
      items: [
        { href: localePath(locale, 'admin', 'products'), label: t.admin.products },
        { href: localePath(locale, 'admin', 'requests'), label: t.admin.requests },
        { href: localePath(locale, 'admin', 'deals'), label: t.admin.deals },
        { href: localePath(locale, 'admin', 'reviews'), label: t.admin.reviews },
        {
          href: localePath(locale, 'admin', 'complaints'),
          label: t.admin.complaints,
          count: openComplaints,
        },
        { href: localePath(locale, 'moderation'), label: t.admin.moderation, count: queue.total },
      ],
    },
    {
      id: 'catalog',
      label: t.admin.groupCatalog,
      items: [
        { href: localePath(locale, 'admin', 'categories'), label: t.admin.categories },
        { href: localePath(locale, 'admin', 'attributes'), label: t.admin.attributes },
        { href: localePath(locale, 'admin', 'synonyms'), label: t.admin.synonyms },
      ],
    },
    {
      id: 'money',
      label: t.admin.groupMoney,
      items: [
        {
          href: localePath(locale, 'admin', 'payments'),
          label: t.admin.payments,
          count: pendingPayments,
        },
        { href: localePath(locale, 'admin', 'balances'), label: t.admin.balance },
        { href: localePath(locale, 'admin', 'tariffs'), label: t.admin.tariffs },
        { href: localePath(locale, 'admin', 'promotions'), label: t.admin.promotion },
      ],
    },
    {
      id: 'system',
      label: t.admin.groupSystem,
      items: [
        { href: localePath(locale, 'admin', 'flags'), label: t.admin.featureFlags },
        { href: localePath(locale, 'admin', 'audit'), label: t.admin.auditLog },
        { href: localePath(locale, 'admin', 'system'), label: t.admin.systemStatus },
      ],
    },
  ]

  return (
    <div className="container py-6">
      <h1 className="text-h1">{t.admin.title}</h1>

      <div className="mt-5 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)]">
        <AdminNav
          groups={groups}
          label={t.admin.title}
          className="lg:sticky lg:top-4 lg:self-start"
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
