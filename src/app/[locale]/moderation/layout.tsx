import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireModerator } from '@/server/auth/guards'
import { getQueueCounts } from '@/server/services/moderation'
import { AdminNav } from '@/components/admin/admin-nav'

/**
 * Moderation shell.
 *
 * `requireModerator` runs here and again inside every page below it. That is not
 * redundant: a layout in the App Router does not re-render on every client navigation,
 * so a page that relied on its parent for authorization would be one soft navigation
 * away from rendering to whoever asked for it.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: t.moderation.title,
    // Staff surface: never indexed, never followed, never in a search result.
    robots: { index: false, follow: false },
  }
}

export default async function ModerationLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  await requireModerator(locale)
  const counts = await getQueueCounts()

  const items = [
    {
      href: localePath(locale, 'moderation'),
      label: t.moderation.queue,
      count: counts.total,
    },
    {
      href: localePath(locale, 'moderation', 'products'),
      label: t.moderation.products,
      count: counts.PRODUCT ?? 0,
    },
    {
      href: localePath(locale, 'moderation', 'documents'),
      label: t.moderation.documents,
      count: counts.DOCUMENT ?? 0,
    },
    {
      href: localePath(locale, 'moderation', 'complaints'),
      label: t.moderation.complaints,
      count: counts.COMPLAINT ?? 0,
    },
    {
      href: localePath(locale, 'moderation', 'reviews'),
      label: t.moderation.reviews,
      count: counts.REVIEW ?? 0,
    },
  ]

  return (
    <div className="container py-6">
      <h1 className="text-h1">{t.moderation.title}</h1>

      <div className="mt-5 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <AdminNav
          items={items}
          label={t.moderation.title}
          className="lg:sticky lg:top-4 lg:self-start"
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
