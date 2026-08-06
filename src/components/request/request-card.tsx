import Link from 'next/link'
import { CalendarDays, MapPin, MessageSquareQuote, Repeat, ShieldCheck } from 'lucide-react'
import { formatMoney, formatQuantity } from '@/lib/money'
import { formatCountdown, formatDateShort } from '@/lib/i18n/format'
import { localePath, type Locale } from '@/lib/i18n/config'
import { fmt, type Dictionary } from '@/lib/i18n'
import { Badge } from '@/components/ui'

/**
 * Purchase-request card.
 *
 * At most two badges are rendered. The spec is explicit that many labels at once stop
 * being informative, so priority is: Urgent > verified-only > recurring/one-off, and
 * everything below the cut is simply dropped.
 */

export interface RequestCardData {
  id: string
  slug: string
  title: string
  quantity: number
  unit: string
  maxBudgetBani: number | null
  desiredPriceBani: number | null
  isRecurring: boolean
  frequency: string | null
  firstDeliveryAt: Date | null
  offersDeadlineAt: Date | null
  allowPartial: boolean
  verifiedOnly: boolean
  isUrgent: boolean
  offersCount: number
  deliveryLocality: { nameRu: string; nameRo: string } | null
  company: {
    slug: string
    displayName: string
    badges: { type: string }[]
  }
}

export function RequestCard({
  request,
  locale,
  t,
}: {
  request: RequestCardData
  locale: Locale
  t: Dictionary
}) {
  const unitLabel = t.units[request.unit as keyof typeof t.units] ?? request.unit
  const place = request.deliveryLocality
  const placeName = place ? (locale === 'ro' ? place.nameRo : place.nameRu) : null
  const countdown = request.offersDeadlineAt
    ? formatCountdown(request.offersDeadlineAt, locale)
    : null
  const buyerVerified = request.company.badges.some(
    (badge) => badge.type === 'COMPANY' || badge.type === 'TRUSTED_SUPPLIER',
  )

  const badges: { key: string; label: string; variant: 'accent' | 'primary' | 'neutral' }[] = []
  if (request.isUrgent) badges.push({ key: 'urgent', label: t.request.badgeUrgent, variant: 'accent' })
  if (request.verifiedOnly) {
    badges.push({ key: 'verified', label: t.request.badgeVerifiedOnly, variant: 'primary' })
  }
  if (badges.length < 2) {
    badges.push({
      key: 'frequency',
      label: request.isRecurring
        ? (t.frequency[request.frequency as keyof typeof t.frequency] ?? t.request.badgeWeekly)
        : t.request.badgeOneTime,
      variant: 'neutral',
    })
  }

  return (
    <article className="group relative flex flex-col rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-muted-foreground/30">
      <div className="flex flex-wrap items-center gap-1.5">
        {badges.slice(0, 2).map((badge) => (
          <Badge key={badge.key} variant={badge.variant} size="sm">
            {badge.key === 'frequency' && request.isRecurring ? (
              <>
                <Repeat className="mr-1 h-3 w-3" aria-hidden />
                {badge.label}
              </>
            ) : (
              badge.label
            )}
          </Badge>
        ))}
      </div>

      <h3 className="mt-2.5 text-base font-medium leading-snug">
        <Link
          href={localePath(locale, 'requests', request.slug)}
          className="clamp-2 after:absolute after:inset-0 after:content-['']"
        >
          {request.title}
        </Link>
      </h3>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-caption text-muted-foreground">{t.request.quantity}</dt>
          <dd className="tnum mt-0.5 font-medium">
            {formatQuantity(request.quantity, unitLabel, locale)}
          </dd>
        </div>
        {request.maxBudgetBani !== null || request.desiredPriceBani !== null ? (
          <div>
            <dt className="text-caption text-muted-foreground">
              {request.maxBudgetBani !== null ? t.request.budget : t.request.desiredPrice}
            </dt>
            <dd className="tnum mt-0.5 font-medium">
              {request.maxBudgetBani !== null
                ? formatMoney(request.maxBudgetBani, locale)
                : `${formatMoney(request.desiredPriceBani ?? 0, locale)} / ${unitLabel}`}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        {placeName ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {placeName}
          </span>
        ) : null}
        {request.firstDeliveryAt ? (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {formatDateShort(request.firstDeliveryAt, locale)}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden />
          {fmt(t.request.offersCount, { count: request.offersCount })}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-2.5">
        {buyerVerified ? (
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        ) : null}
        <span className="truncate text-caption text-muted-foreground">
          {request.company.displayName}
        </span>
        {countdown ? (
          <span className="ml-auto shrink-0 text-caption font-medium text-warning">
            {countdown}
          </span>
        ) : request.offersDeadlineAt ? (
          <span className="ml-auto shrink-0 text-caption text-muted-foreground">
            {t.request.deadlinePassed}
          </span>
        ) : null}
      </div>
    </article>
  )
}
