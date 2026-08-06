import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Package, ShieldCheck, Truck } from 'lucide-react'
import { formatMoney, formatQuantity } from '@/lib/money'
import { localePath, type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui'
import { FavoriteButton } from '@/components/product/favorite-button'

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

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-card shadow-card transition-colors',
        product.isHighlighted ? 'border-primary/40 bg-primary-soft/20' : 'border-border',
        'hover:border-muted-foreground/30',
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
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

        {product.isUrgent ? (
          <div className="absolute left-2 top-2">
            <Badge variant="accent" size="sm">
              {t.request.badgeUrgent}
            </Badge>
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

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="text-sm font-medium leading-snug">
          {/* Stretched link keeps the whole card clickable without nesting anchors. */}
          <Link
            href={localePath(locale, 'products', product.slug)}
            className="clamp-2 after:absolute after:inset-0 after:content-['']"
          >
            {product.title}
          </Link>
        </h3>

        <div className="mt-2.5">
          <p className="tnum text-lg font-semibold leading-none">
            {formatMoney(product.priceBani, locale)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/ {unitLabel}</span>
          </p>
          <p className="mt-1.5 text-caption text-muted-foreground">
            {t.product.minOrder}: {formatQuantity(product.minOrderQty, unitLabel, locale)}
          </p>
        </div>

        <div className="mt-auto pt-3">
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

          <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
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
