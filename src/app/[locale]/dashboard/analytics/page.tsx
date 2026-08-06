import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { getDictionary, resolveLocale, fmt } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateShort, formatNumber } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { requireSeller } from '@/server/auth/guards'
import {
  ANALYTICS_PERIODS,
  getCompanyAnalytics,
  resolveAnalyticsPeriod,
  type AnalyticsDay,
} from '@/server/services/analytics'
import { Card, EmptyState, StatusBadge } from '@/components/ui'
import { StatTile } from '@/components/dashboard/stat-tile'

/**
 * Seller analytics.
 *
 * The chart is a handful of <rect> elements in an inline SVG — no charting library.
 * Three series over at most ninety days does not justify 150 kB of JavaScript on a
 * page a seller opens on a phone over mobile data, and an SVG the server renders
 * needs no hydration at all.
 *
 * Every chart is duplicated as a real table underneath. That is not a fallback: it is
 * the accessible form of the same data, and it is also the only way to read an exact
 * number off a 3-pixel-wide bar.
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

export default async function DashboardAnalyticsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { period?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireSeller(locale, localePath(locale, 'dashboard', 'analytics'))
  const period = resolveAnalyticsPeriod(searchParams.period)
  const analytics = await getCompanyAnalytics(user.companyId, period)

  const periodLabels: Record<number, string> = {
    7: t.analytics.last7d,
    30: t.analytics.last30d,
    90: t.analytics.last90d,
  }

  const productStatus = t.productStatus as Record<string, string | undefined>
  const base = localePath(locale, 'dashboard', 'analytics')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">{t.analytics.title}</h1>

        {/* The period lives in the URL so a refresh keeps it and a link carries it. */}
        <nav aria-label={t.analytics.period}>
          <ul className="flex gap-1 rounded-md border border-border bg-card p-1">
            {ANALYTICS_PERIODS.map((value) => (
              <li key={value}>
                <Link
                  href={`${base}?period=${value}`}
                  aria-current={value === period ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-[36px] items-center rounded px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    value === period
                      ? 'bg-primary-soft font-semibold text-primary'
                      : 'font-medium text-muted-foreground hover:text-foreground',
                  )}
                >
                  {periodLabels[value] ?? String(value)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

          <section aria-labelledby="analytics-per-day">
            <h2 id="analytics-per-day" className="mb-3 text-h3">
              {t.analytics.perDay}
            </h2>

            <Card className="p-4 sm:p-5">
              <DayChart
                days={analytics.days}
                label={`${t.analytics.views} — ${periodLabels[period] ?? String(period)}`}
              />

              <div className="mt-4 max-h-80 overflow-y-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">{t.analytics.perDay}</caption>
                  <thead className="sticky top-0 border-b border-border bg-card">
                    <tr>
                      <th scope="col" className="py-2 pr-3 text-caption font-semibold text-muted-foreground">
                        {t.analytics.day}
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right text-caption font-semibold text-muted-foreground">
                        {t.analytics.views}
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right text-caption font-semibold text-muted-foreground">
                        {t.analytics.contacts}
                      </th>
                      <th scope="col" className="py-2 text-right text-caption font-semibold text-muted-foreground">
                        {t.analytics.favorites}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...analytics.days].reverse().map((day) => (
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
            </Card>
          </section>

          <section aria-labelledby="analytics-top">
            <h2 id="analytics-top" className="mb-3 text-h3">
              {t.analytics.topProducts}
            </h2>

            {analytics.top.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                {t.analytics.noData}
              </p>
            ) : (
              <Card>
                <ul className="divide-y divide-border">
                  {analytics.top.map((product) => {
                    const share =
                      analytics.totals.views > 0
                        ? Math.round((product.views / analytics.totals.views) * 100)
                        : 0

                    return (
                      <li key={product.id}>
                        <Link
                          href={localePath(locale, 'products', product.slug)}
                          className="block px-4 py-3 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {product.title}
                            </span>
                            <StatusBadge
                              status={product.status}
                              label={productStatus[product.status] ?? product.status}
                              size="sm"
                            />
                            <span className="tnum shrink-0 text-caption text-muted-foreground">
                              {fmt(t.analytics.topProductViews, { count: product.views })}
                            </span>
                          </div>
                          {/* A bar, not a chart: it only has to make "twice as much"
                              visible at a glance. */}
                          <div
                            aria-hidden
                            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                          >
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(share, 2)}%` }}
                            />
                          </div>
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

/**
 * Views per day as bars, with a contacts sparkline over the top.
 *
 * The viewBox scales with the number of days and stretches to the container, so the
 * same markup renders seven fat bars or ninety thin ones without a media query.
 */
function DayChart({ days, label }: { days: readonly AnalyticsDay[]; label: string }) {
  if (days.length === 0) return null

  const maxViews = Math.max(1, ...days.map((day) => day.views))
  const maxContacts = Math.max(1, ...days.map((day) => day.contacts))

  const slot = 4
  const width = days.length * slot
  const height = 40

  const contactPoints = days
    .map((day, index) => {
      const x = index * slot + slot / 2
      const y = height - (day.contacts / maxContacts) * (height * 0.7)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-32 w-full"
    >
      {days.map((day, index) => {
        const barHeight = (day.views / maxViews) * height
        return (
          <rect
            key={day.day}
            x={index * slot + 0.5}
            y={height - barHeight}
            width={slot - 1}
            height={Math.max(barHeight, day.views > 0 ? 0.5 : 0)}
            className="fill-primary/70"
          />
        )
      })}

      <polyline
        points={contactPoints}
        fill="none"
        vectorEffect="non-scaling-stroke"
        strokeWidth={1.5}
        className="stroke-accent"
      />
    </svg>
  )
}
