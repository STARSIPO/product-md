import { redirect } from 'next/navigation'
import { resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'

/**
 * Analytics moved to Statistics.
 *
 * The section was renamed rather than deleted, so the old address has to keep working:
 * a seller who bookmarked /ru/dashboard/analytics — or /ro/cabinet/analiza — should land
 * on the same numbers, not a 404. The chosen period rides along, because that is the
 * part of the URL a person actually bookmarked.
 *
 * A temporary redirect, not a permanent one: a 308 is cached by the browser forever, and
 * renaming a section back would then be un-undoable for everyone who visited once.
 */

export const dynamic = 'force-dynamic'

export default function DashboardAnalyticsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { period?: string }
}) {
  const locale = resolveLocale(params.locale)
  const target = localePath(locale, 'dashboard', 'statistics')
  const period = searchParams.period

  redirect(period ? `${target}?period=${encodeURIComponent(period)}` : target)
}
