import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Package, ShieldCheck, Truck } from 'lucide-react'
import { formatMoney, formatQuantity, isOnSale, salePercent } from '@/lib/money'
import { localePath, type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui'
import { FavoriteButton } from '@/components/product/favorite-button'
import { OldPrice, SaleBadge } from '@/components/sales/sale-price'

/**
 * Catalogue card.
 *
 * Price is the loudest element on purpose: a wholesale buyer scans a grid for price
 * per unit and minimum order, and everything else is secondary. The description is
 * deliberately absent — a card that tries to summarise the listing becomes unscannable.
 */

export interface ProductCardData {
  id: string
  slug: string
  title: string
  priceBani: number
  /**
   * Set only on queries that select them (see SALE_CARD_SELECT). A card fed from a
   * plain catalogue query simply has no sale to show, which is why these are optional
   * rather than required-and-null everywhere.
   */
  oldPriceBani?: number | null
  discountEndsAt?: Date | null
  unit: string
  minOrderQty: number
  availableQty: number | null
  pickupAvailable: boolean
  deliveryPriceBani: number | null
  isHighlighted?: boolean
  isUrgent?: boolean
  photos: { key: string; alt: string | null }[]
  company: {
    slug: string
    displayName: string
    ratingAvg: number
    ratingCount: number
    district: { nameRu: string; nameRo: string } | null
    locality: { nameRu: string; nameRo: string } | null
    badges: { type: string }[]
  }
}

export function ProductCard({
  product,
  locale,
  t,
  isFavorite = false,
  showFavorite = true,
  priority = false,
}: {
  product: ProductCardData
  locale: Locale
  t: Dictionary
  isFavorite?: boolean
  showFavorite?: boolean
  priority?: boolean
}) {
  const photo = product.photos[0]
  const unitLabel = t.units[product.unit as keyof typeof t.units] ?? product.unit
  const place = product.company.locality ?? product.company.district
  const placeName = place ? (locale === 'ro' ? place.nameRo : place.nameRu) : null
  const isVerified = product.company.badges.some(
    (badge) => badge.type === 'TRUSTED_SUPPLIER' || badge.type === 'DOCUMENTS',
  )

  // One answer for the badge and the price: asking `isOnSale` twice with different
  // clocks is how a card ends up advertising a discount it no longer applies.
  const sale = {
    priceBani: product.priceBani,
    oldPriceBani: product.oldPriceBani ?? null,
    discountEndsAt: product.discountEndsAt ?? null,
  }
  const onSale = isOnSale(sale)
  const percent = salePercent(sale)

  return (
    <article
      className={cn(
        'surface-interactive group relative flex flex-col overflow-hidden',
        // A promoted card keeps a ring — that outline carries meaning, unlike the
        // hairline that used to sit on every card.
        product.isHighlighted && 'bg-primary-soft/25 ring-1 ring-inset ring-primary/25',
      )}
    >
      {/* The image inherits the card radius through `overflow-hidden` above. */}
      <div className="relative aspect-[4/3] bg-muted">
        {photo ? (
          <Image
            src={photo.key}
            alt={photo.alt ?? product.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            priority={priority}
            className="object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Package className="h-8 w-8" aria-hidden />
            <span className="sr-only">{t.product.noPhoto}</span>
          </div>
        )}

        {/* Stacked, so a discounted urgent listing shows both without either moving. */}
        {onSale || product.isUrgent ? (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {onSale ? <SaleBadge percent={percent} t={t} /> : null}
            {product.isUrgent ? (
              <Badge variant="accent" size="sm">
                {t.request.badgeUrgent}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {showFavorite ? (
          <div className="absolute right-2 top-2">
            <FavoriteButton
              productId={product.id}
              initial={isFavorite}
              label={t.a11y.toggleFavorite}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-medium leading-snug">
          {/* Stretched link keeps the whole card clickable without nesting anchors. */}
          <Link
            href={localePath(locale, 'products', product.slug)}
            className="clamp-2 after:absolute after:inset-0 after:content-['']"
          >
            {product.title}
          </Link>
        </h3>

        <div className="mt-3">
          {/* Price is the loudest thing on the card, and it grows once the grid gives
              the card enough width for the unit to stay on the same line. */}
          <p
            className={cn(
              'tnum text-lg font-semibold leading-none md:text-h3 md:leading-none',
              // The reduced figure is the one being charged, so it takes the accent —
              // the struck price under it is history, not an alternative.
              onSale && 'text-accent',
            )}
          >
            {formatMoney(product.priceBani, locale)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/ {unitLabel}</span>
          </p>
          {onSale && sale.oldPriceBani !== null ? (
            <OldPrice
              bani={sale.oldPriceBani}
              locale={locale}
              t={t}
              className="mt-1.5 block text-caption"
            />
          ) : null}
          <p className="mt-2 text-caption text-muted-foreground">
            {t.product.minOrder}: {formatQuantity(product.minOrderQty, unitLabel, locale)}
          </p>
        </div>

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            {placeName ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {placeName}
              </span>
            ) : null}
            {product.deliveryPriceBani !== null || product.pickupAvailable ? (
              <span className="inline-flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" aria-hidden />
                {product.deliveryPriceBani === 0
                  ? t.product.deliveryFree
                  : product.deliveryPriceBani !== null
                    ? formatMoney(product.deliveryPriceBani, locale)
                    : t.product.pickup}
              </span>
            ) : null}
          </div>

          {/* Separated from the meta row by space, not by a rule. */}
          <div className="mt-3 flex items-center gap-1.5">
            {isVerified ? (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            ) : null}
            <span className="truncate text-caption text-muted-foreground">
              {product.company.displayName}
            </span>
            {product.company.ratingCount > 0 ? (
              <span className="tnum ml-auto shrink-0 text-caption font-medium">
                ★ {product.company.ratingAvg.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
