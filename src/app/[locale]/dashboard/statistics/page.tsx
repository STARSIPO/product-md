import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { getDictionary, resolveLocale, fmt } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateShort, formatNumber } from '@/lib/i18n/format'
import { requireSeller } from '@/server/auth/guards'
import {
  ANALYTICS_PERIODS,
  getCompanyAnalytics,
  resolveAnalyticsPeriod,
} from '@/server/services/analytics'
import { Card, EmptyState, StatusBadge } from '@/components/ui'
import { StatTile } from '@/components/dashboard/stat-tile'
import { DayChart } from '@/components/dashboard/day-chart'
import { SectionRail } from '@/components/dashboard/section-rail'

/**
 * Statistics — everything numeric about this company's listings.
 *
 * This is where the overview's charts went. The overview answers "does anything need me
 * today"; this page answers "how are my listings doing", and those are different
 * questions asked at different moments. Mixing them is what made the old dashboard feel
 * like a wall.
 *
 * Every chart is duplicated as a real table underneath — not a fallback, but the
 * accessible form of the same data, and the only way to read an exact number off a
 * three-pixel bar. Below `md` that table becomes stacked cards rather than a horizontal
 * scroller.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.analytics.title, robots: { index: false, follow: false } }
}

export default async function DashboardStatisticsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { period?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireSeller(locale, localePath(locale, 'dashboard', 'statistics'))
  const period = resolveAnalyticsPeriod(searchParams.period)
  const analytics = await getCompanyAnalytics(user.companyId, period)

  const periodLabels: Record<number, string> = {
    7: t.analytics.last7d,
    30: t.analytics.last30d,
    90: t.analytics.last90d,
  }

  const productStatus = t.productStatus as Record<string, string | undefined>
  const base = localePath(locale, 'dashboard', 'statistics')
  const periodLabel = periodLabels[period] ?? String(period)

  // Newest first: the question is almost always "what happened lately".
  const recentDays = [...analytics.days].reverse()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">{t.analytics.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.analytics.subtitle}</p>
      </div>

      {/* The period lives in the URL so a refresh keeps it and a link carries it.
          The same rail as every other section strip in the cabinet: the segmented
          control in a bordered tray was a third tab idiom in a product that needs one.

          A scroller rather than three equal thirds, because "30 de zile" in a 90px
          third at 320px is a label hanging out of its own pill — and anything hanging
          out sideways is what puts a horizontal scrollbar on the page. */}
      <SectionRail
        label={t.analytics.period}
        items={ANALYTICS_PERIODS.map((value) => ({
          key: String(value),
          href: `${base}?period=${value}`,
          label: periodLabels[value] ?? String(value),
          active: value === period,
        }))}
      />

      {!analytics.hasData ? (
        <Card>
          <EmptyState
            icon={<BarChart3 />}
            title={t.analytics.noData}
            description={t.analytics.noDataText}
          />
        </Card>
      ) : (
        <>
          <section aria-label={t.analytics.periodTotals}>
            {/* Four counts, so four columns as soon as there is room for them: these
                are the totals the rest of the page explains, and splitting them over
                two rows until `xl` made them read as two unrelated pairs. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
              <StatTile
                label={t.analytics.views}
                value={formatNumber(analytics.totals.views, locale, 0)}
              />
              <StatTile
                label={t.analytics.contacts}
                value={formatNumber(analytics.totals.contacts, locale, 0)}
              />
              <StatTile
                label={t.analytics.favorites}
                value={formatNumber(analytics.totals.favorites, locale, 0)}
              />
              <StatTile
                label={t.analytics.conversion}
                value={
                  analytics.conversionPercent === null
                    ? '—'
                    : `${formatNumber(analytics.conversionPercent, locale, 1)}%`
                }
              />
            </div>
          </section>

          <section aria-labelledby="statistics-per-day">
            <h2 id="statistics-per-day" className="mb-3 text-h3">
              {t.analytics.perDay}
            </h2>

            <Card className="p-4 sm:p-5">
              {/* The bars sit in a tinted plot area rather than directly on the card:
                  it gives the series a floor to stand on, which is what a chart needs
                  and what an outline round the whole card was standing in for. */}
              <div className="surface-muted rounded-md px-3 py-3">
                <DayChart
                  days={analytics.days}
                  label={fmt(t.analytics.chartLabel, { period: periodLabel })}
                />
              </div>

              {/* ------------------------------------------- desktop: a real table */}
              <div className="mt-4 hidden max-h-80 overflow-y-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">{t.analytics.perDay}</caption>
                  <thead className="sticky top-0 border-b border-border bg-card">
                    <tr>
                      <th
                        scope="col"
                        className="py-2 pr-3 text-caption font-semibold text-muted-foreground"
                      >
                        {t.analytics.day}
                      </th>
                      <th
                        scope="col"
                        className="py-2 pr-3 text-right text-caption font-semibold text-muted-foreground"
                      >
                        {t.analytics.views}
                      </th>
                      <th
                        scope="col"
                        className="py-2 pr-3 text-right text-caption font-semibold text-muted-foreground"
                      >
                        {t.analytics.contacts}
                      </th>
                      <th
                        scope="col"
                        className="py-2 text-right text-caption font-semibold text-muted-foreground"
                      >
                        {t.analytics.favorites}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentDays.map((day) => (
                      <tr key={day.day}>
                        <th scope="row" className="py-2 pr-3 font-normal text-muted-foreground">
                          {formatDateShort(`${day.day}T12:00:00`, locale)}
                        </th>
                        <td className="tnum py-2 pr-3 text-right">
                          {formatNumber(day.views, locale, 0)}
                        </td>
                        <td className="tnum py-2 pr-3 text-right">
                          {formatNumber(day.contacts, locale, 0)}
                        </td>
                        <td className="tnum py-2 text-right">
                          {formatNumber(day.favorites, locale, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* --------------------------------------------- phone: labelled cards
                  A four-column table at 320px is either unreadable or a sideways
                  scroller; each day becomes its own small card instead. Days with no
                  activity are dropped here — ninety empty cards is not a report. */}
              <ul className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto md:hidden">
                {recentDays
                  .filter((day) => day.views > 0 || day.contacts > 0 || day.favorites > 0)
                  .map((day) => (
                    <li key={day.day} className="surface-muted rounded-md px-3 py-2.5">
                      <p className="text-sm font-medium">
                        {formatDateShort(`${day.day}T12:00:00`, locale)}
                      </p>
                      <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                        <div className="flex gap-1">
                          <dt>{t.analytics.views}:</dt>
                          <dd className="tnum text-foreground">
                            {formatNumber(day.views, locale, 0)}
                          </dd>
                        </div>
                        <div className="flex gap-1">
                          <dt>{t.analytics.contacts}:</dt>
                          <dd className="tnum text-foreground">
                            {formatNumber(day.contacts, locale, 0)}
                          </dd>
                        </div>
                        <div className="flex gap-1">
                          <dt>{t.analytics.favorites}:</dt>
                          <dd className="tnum text-foreground">
                            {formatNumber(day.favorites, locale, 0)}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
              </ul>
            </Card>
          </section>

          <section aria-labelledby="statistics-top">
            <h2 id="statistics-top" className="mb-3 text-h3">
              {t.analytics.topProducts}
            </h2>

            {analytics.top.length === 0 ? (
              <p className="surface-muted px-4 py-8 text-center text-sm text-muted-foreground">
                {t.analytics.noData}
              </p>
            ) : (
              <Card className="p-2">
                {/* A gap between rows instead of a rule: each row is already a distinct
                    block with its own share bar, so the hairlines only added noise. */}
                <ul className="space-y-1">
                  {analytics.top.map((product) => {
                    const share =
                      analytics.totals.views > 0
                        ? Math.round((product.views / analytics.totals.views) * 100)
                        : 0

                    return (
                      <li key={product.id}>
                        <Link
                          href={localePath(locale, 'products', product.slug)}
                          className="block rounded-md px-3 py-3 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <span className="clamp-2 block text-sm font-medium leading-snug">
                            {product.title}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StatusBadge
                              status={product.status}
                              label={productStatus[product.status] ?? product.status}
                              size="sm"
                            />
                            <span className="tnum text-caption text-muted-foreground">
                              {fmt(t.analytics.topProductViews, { count: product.views })}
                            </span>
                          </span>
                          {/* A bar, not a chart: it only has to make "twice as much"
                              visible at a glance. */}
                          <span
                            aria-hidden
                            className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted"
                          >
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(share, 2)}%` }}
                            />
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  )
}
