import { fmt, type Dictionary } from '@/lib/i18n'
import { formatDateShort } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { chisinauDayKey, cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n/config'
import { Badge } from '@/components/ui'

/**
 * How a discount looks, in one place.
 *
 * Card, product page and homepage rail all show the same three marks — the reduced
 * price, the previous one struck through, and a «−N%» chip — so they are defined once
 * here rather than reimplemented three times with three slightly different roundings.
 *
 * Nothing in this file decides *whether* something is on sale. That answer comes from
 * `isOnSale`/`salePercent` in `@/lib/money`, and every caller asks it there, so a badge
 * and a price can never disagree about an expired promotion.
 */

/** The «−13%» chip. Accent, because the saving is the reason the card is being read. */
export function SaleBadge({
  percent,
  t,
  size = 'sm',
  className,
}: {
  percent: number
  t: Dictionary
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <Badge variant="accent" size={size} className={cn('tnum font-semibold', className)}>
      {fmt(t.sales.percentOff, { percent })}
    </Badge>
  )
}

/**
 * The previous price, struck through and muted.
 *
 * `<s>` rather than a line-through class alone: the strike carries the meaning "this
 * no longer applies", and a screen reader that renders only text would otherwise read
 * two prices with no way to tell which one is being charged. The visually hidden label
 * says it in words.
 */
export function OldPrice({
  bani,
  locale,
  t,
  className,
}: {
  bani: number
  locale: Locale
  t: Dictionary
  className?: string
}) {
  const price = formatMoney(bani, locale)

  return (
    <s className={cn('tnum text-muted-foreground decoration-1', className)}>
      <span className="sr-only">{fmt(t.sales.oldPrice, { price })}</span>
      <span aria-hidden="true">{price}</span>
    </s>
  )
}

/**
 * "Ends tomorrow" / "3 days left" / "until 14.09.2026".
 *
 * Counted in whole Chisinau days, not in hours: a buyer reading "1 day left" at 23:50
 * and finding the price restored ten minutes later would be right to feel misled, so
 * the label follows the same calendar the expiry job runs on.
 *
 * Returns null when the sale has no end date — an open-ended discount has nothing
 * urgent to say, and «Без даты окончания» on every card is noise.
 */
export function saleEndsLabel(endsAt: Date | null, locale: Locale, t: Dictionary): string | null {
  if (endsAt === null) return null

  const days = wholeDaysUntil(endsAt)
  if (days <= 0) return t.sales.endsToday
  if (days === 1) return t.sales.endsTomorrow
  if (days <= 7) return fmt(t.sales.endsInDays, { count: days })
  return fmt(t.sales.endsAt, { date: formatDateShort(endsAt, locale) })
}

function wholeDaysUntil(date: Date): number {
  const today = Date.parse(`${chisinauDayKey()}T00:00:00Z`)
  const target = Date.parse(`${chisinauDayKey(date)}T00:00:00Z`)
  return Math.round((target - today) / 86_400_000)
}
