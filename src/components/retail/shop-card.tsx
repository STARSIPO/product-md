import Link from 'next/link'
import { MapPin, Package, Truck } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { localePath, type Locale } from '@/lib/i18n/config'
import { fmt, type Dictionary } from '@/lib/i18n'
import { Avatar, Badge, Rating } from '@/components/ui'

/**
 * A shop in the delivery list.
 *
 * The two facts a shopper decides on are the delivery fee and the threshold that makes
 * it free, so both sit on the card rather than behind a click. A shop that has published
 * no fee says so plainly — «Уточняет магазин» is an honest answer, an assumed 0 is not.
 */

export interface ShopCardData {
  id: string
  slug: string
  displayName: string
  kind: string
  logoKey: string | null
  ratingAvg: number
  ratingCount: number
  retailDeliveryFeeBani: number | null
  retailFreeFromBani: number | null
  retailDeliveryNote: string | null
  locality: { nameRu: string; nameRo: string } | null
  _count: { products: number }
}

export function ShopCard({
  shop,
  locale,
  t,
}: {
  shop: ShopCardData
  locale: Locale
  t: Dictionary
}) {
  const placeName = shop.locality
    ? locale === 'ro'
      ? shop.locality.nameRo
      : shop.locality.nameRu
    : null

  const kindLabel = t.company.kinds[shop.kind as keyof typeof t.company.kinds]

  const feeLabel =
    shop.retailDeliveryFeeBani === null
      ? t.retail.deliveryNotSet
      : shop.retailDeliveryFeeBani === 0
        ? t.retail.deliveryFree
        : formatMoney(shop.retailDeliveryFeeBani, locale)

  return (
    <article className="surface-interactive group relative flex min-w-0 flex-col p-4 md:p-5">
      <div className="flex min-w-0 gap-3">
        <Avatar src={shop.logoKey} name={shop.displayName} size="lg" />

        <div className="min-w-0 flex-1">
          <h3 className="min-w-0 text-base font-medium leading-snug">
            <Link
              href={localePath(locale, 'delivery', shop.slug)}
              className="clamp-2 after:absolute after:inset-0 after:content-['']"
            >
              {shop.displayName}
            </Link>
          </h3>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {kindLabel ? (
              <Badge variant="neutral" size="sm">
                {kindLabel}
              </Badge>
            ) : null}
            {shop.ratingCount > 0 ? (
              <Rating
                value={shop.ratingAvg}
                count={shop.ratingCount}
                size="sm"
                showValue
                label={fmt(t.a11y.rating, { value: shop.ratingAvg.toFixed(1) })}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        {placeName ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {placeName}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {fmt(t.retail.shopProducts, { count: shop._count.products })}
        </span>
      </div>

      {/* Delivery terms recede into an inset block instead of competing with the name. */}
      <dl className="surface-muted mt-3 grid gap-1 p-3 text-caption">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <dt className="inline-flex items-center gap-1 text-muted-foreground">
            <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t.retail.deliveryFee}
          </dt>
          <dd className="tnum truncate font-medium text-foreground">{feeLabel}</dd>
        </div>

        {shop.retailFreeFromBani !== null ? (
          <div className="text-muted-foreground">
            <dt className="sr-only">{t.retail.deliveryFree}</dt>
            <dd>
              {fmt(t.retail.freeFrom, { amount: formatMoney(shop.retailFreeFromBani, locale) })}
            </dd>
          </div>
        ) : null}

        {shop.retailDeliveryNote ? (
          <div className="text-muted-foreground">
            <dt className="sr-only">{t.company.retailNote}</dt>
            <dd className="clamp-2">{shop.retailDeliveryNote}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  )
}
