import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireAdmin } from '@/server/auth/guards'
import { getQueueCounts } from '@/server/services/moderation'
import { db } from '@/server/db'
import { AdminNav } from '@/components/admin/admin-nav'

/**
 * Admin shell.
 *
 * `requireAdmin` also demands an active TOTP enrolment — an administrator without 2FA is
 * redirected to set it up rather than quietly let in. It runs here *and* in every page
 * below, because a layout is not re-executed on a client-side navigation and would
 * otherwise be a single soft navigation away from being bypassed.
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

  const [queue, openComplaints] = await Promise.all([
    getQueueCounts(),
    db.complaint.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
  ])

  const items = [
    { href: localePath(locale, 'admin'), label: t.admin.dashboard },
    { href: localePath(locale, 'admin', 'users'), label: t.admin.users },
    { href: localePath(locale, 'admin', 'companies'), label: t.admin.companies },
    { href: localePath(locale, 'admin', 'products'), label: t.admin.products },
    { href: localePath(locale, 'admin', 'requests'), label: t.admin.requests },
    { href: localePath(locale, 'admin', 'deals'), label: t.admin.deals },
    {
      href: localePath(locale, 'admin', 'complaints'),
      label: t.admin.complaints,
      count: openComplaints,
    },
    { href: localePath(locale, 'admin', 'categories'), label: t.admin.categories },
    { href: localePath(locale, 'admin', 'synonyms'), label: t.admin.synonyms },
    { href: localePath(locale, 'admin', 'payments'), label: t.admin.payments },
    { href: localePath(locale, 'admin', 'tariffs'), label: t.admin.tariffs },
    { href: localePath(locale, 'admin', 'flags'), label: t.admin.featureFlags },
    { href: localePath(locale, 'admin', 'audit'), label: t.admin.auditLog },
    { href: localePath(locale, 'admin', 'system'), label: t.admin.systemStatus },
    { href: localePath(locale, 'moderation'), label: t.admin.moderation, count: queue.total },
  ]

  return (
    <div className="container py-6">
      <h1 className="text-h1">{t.admin.title}</h1>

      <div className="mt-5 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <AdminNav
          items={items}
          label={t.admin.title}
          className="lg:sticky lg:top-4 lg:self-start"
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
