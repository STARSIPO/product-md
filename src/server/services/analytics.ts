import 'server-only'
import { db } from '@/server/db'
import { chisinauDayKey } from '@/lib/utils'

/**
 * Seller analytics.
 *
 * Reads `ProductStatDaily`, which the catalogue writes one row per product per day in
 * Europe/Chisinau. Two consequences drive the shape of this module:
 *
 *   - `day` is a `YYYY-MM-DD` *string*, so a range filter is a lexicographic
 *     comparison. That is exact for this format and avoids a timezone conversion in
 *     SQL, which is where "yesterday" quietly becomes "two days ago" for half the
 *     users.
 *   - a day with no activity has no row at all. The series is therefore zero-filled
 *     here rather than in the view: a chart that silently skips empty days reads as
 *     growth when it is actually silence.
 */

export const ANALYTICS_PERIODS = [7, 30, 90] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]

export function resolveAnalyticsPeriod(value: string | undefined): AnalyticsPeriod {
  const parsed = Number(value)
  return (ANALYTICS_PERIODS as readonly number[]).includes(parsed)
    ? (parsed as AnalyticsPeriod)
    : 7
}

export interface AnalyticsDay {
  /** YYYY-MM-DD in Europe/Chisinau. */
  day: string
  views: number
  contacts: number
  favorites: number
}

export interface AnalyticsTopProduct {
  id: string
  slug: string
  title: string
  status: string
  views: number
}

export interface CompanyAnalytics {
  period: AnalyticsPeriod
  days: AnalyticsDay[]
  totals: { views: number; contacts: number; favorites: number }
  /** Contacts per 100 views — the only conversion this data can honestly support. */
  conversionPercent: number | null
  top: AnalyticsTopProduct[]
  hasData: boolean
}

/** The list of day keys covered by the period, oldest first, including today. */
function dayRange(period: AnalyticsPeriod, now: Date): string[] {
  const days: string[] = []
  for (let offset = period - 1; offset >= 0; offset -= 1) {
    days.push(chisinauDayKey(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)))
  }
  return days
}

export async function getCompanyAnalytics(
  companyId: string,
  period: AnalyticsPeriod,
  now: Date = new Date(),
): Promise<CompanyAnalytics> {
  const days = dayRange(period, now)
  const from = days[0] ?? chisinauDayKey(now)

  const rows = await db.productStatDaily.findMany({
    where: {
      day: { gte: from },
      product: { companyId, deletedAt: null },
    },
    select: { day: true, views: true, contacts: true, favorites: true, productId: true },
  })

  const byDay = new Map<string, AnalyticsDay>()
  for (const day of days) {
    byDay.set(day, { day, views: 0, contacts: 0, favorites: 0 })
  }

  const viewsByProduct = new Map<string, number>()
  const totals = { views: 0, contacts: 0, favorites: 0 }

  for (const row of rows) {
    const bucket = byDay.get(row.day)
    // A row outside the zero-filled window can only appear if the clock moved; skip it
    // rather than stretching the axis.
    if (!bucket) continue

    bucket.views += row.views
    bucket.contacts += row.contacts
    bucket.favorites += row.favorites

    totals.views += row.views
    totals.contacts += row.contacts
    totals.favorites += row.favorites

    viewsByProduct.set(row.productId, (viewsByProduct.get(row.productId) ?? 0) + row.views)
  }

  const topIds = [...viewsByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([, views]) => views > 0)

  const products =
    topIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: topIds.map(([id]) => id) }, companyId, deletedAt: null },
          select: { id: true, slug: true, title: true, status: true },
        })
      : []

  const productById = new Map(products.map((product) => [product.id, product]))

  const top: AnalyticsTopProduct[] = topIds.flatMap(([id, views]) => {
    const product = productById.get(id)
    if (!product) return []
    return [{ ...product, views }]
  })

  return {
    period,
    days: [...byDay.values()],
    totals,
    conversionPercent:
      totals.views > 0 ? Math.round((totals.contacts / totals.views) * 1000) / 10 : null,
    top,
    hasData: totals.views > 0 || totals.contacts > 0 || totals.favorites > 0,
  }
}
