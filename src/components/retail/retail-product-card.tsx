import Image from 'next/image'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { formatMoney, formatQuantity, isOnSale, salePercent } from '@/lib/money'
import { MIN_DISCOUNT_PERCENT } from '@/lib/constants'
import { localePath, type Locale } from '@/lib/i18n/config'
import { fmt, type Dictionary } from '@/lib/i18n'
import { OldPrice, SaleBadge } from '@/components/sales/sale-price'
import { AddToCart } from './add-to-cart'
import type { CartShop } from './cart-store'

/**
 * A storefront card for a household shopper.
 *
 * Different from the wholesale `ProductCard` in the two ways that matter: the price is
 * the retail one, and the card can be acted on without leaving the grid. Somebody buying
 * groceries adds fifteen things in a row — sending them to a detail page and back for
 * each one would make the basket unusable.
 *
 * Everything else is the same restraint as the catalogue: price loudest, no description,
 * two columns at 320px.
 */

export interface RetailProductCardData {
  id: string
  slug: string
  title: string
  priceBani: number
  oldPriceBani: number | null
  discountEndsAt: Date | null
  retailPriceBani: number | null
  retailMinQty: number
  unit: string
  availability: string
  photos: { key: string; alt: string | null }[]
  company: {
    id: string
    slug: string
    displayName: string
    retailDeliveryFeeBani: number | null
    retailFreeFromBani: number | null
  }
}

export function RetailProductCard({
  product,
  locale,
  t,
  showShop = false,
  priority = false,
}: {
  product: RetailProductCardData
  locale: Locale
  t: Dictionary
  /** The index page mixes shops, so it names each one; a shop page does not repeat itself. */
  showShop?: boolean
  priority?: boolean
}) {
  const photo = product.photos[0]
  const unitLabel = t.units[product.unit as keyof typeof t.units] ?? product.unit

  const retailPriceBani = product.retailPriceBani ?? product.priceBani

  /*
   * A sale carries over to the storefront only when the retail price *is* the reduced
   * price — that is, when the seller kept one price for both halves of the market. Once
   * they set a separate retail price there is no previous retail price on record, and
   * striking through the wholesale one would advertise a saving nobody is getting.
   */
  const percent = product.retailPriceBani === null && isOnSale(product) ? salePercent(product) : 0
  const onSale = percent >= MIN_DISCOUNT_PERCENT

  const unavailable = product.availability === 'OUT_OF_STOCK'

  const shop: CartShop = {
    companyId: product.company.id,
    slug: product.company.slug,
    name: product.company.displayName,
    deliveryFeeBani: product.company.retailDeliveryFeeBani,
    freeFromBani: product.company.retailFreeFromBani,
  }

  return (
    <article className="surface-interactive group relative flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] bg-muted">
        {photo ? (
          <Image
            src={photo.key}
            alt={photo.alt ?? product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            className="object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Package className="h-8 w-8" aria-hidden />
            <span className="sr-only">{t.product.noPhoto}</span>
          </div>
        )}

        {onSale ? (
          <div className="absolute left-2 top-2">
            <SaleBadge percent={percent} t={t} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-medium leading-snug">
          <Link
            href={localePath(locale, 'products', product.slug)}
            className="clamp-2 after:absolute after:inset-0 after:content-['']"
          >
            {product.title}
          </Link>
        </h3>

        <div className="mt-3">
          <p className="tnum text-lg font-semibold leading-none">
            {formatMoney(retailPriceBani, locale)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/ {unitLabel}</span>
          </p>

          {onSale && product.oldPriceBani !== null ? (
            <p className="mt-1.5 text-caption">
              <OldPrice bani={product.oldPriceBani} locale={locale} t={t} />
            </p>
          ) : product.retailMinQty > 1 ? (
            <p className="mt-1.5 text-caption text-muted-foreground">
              {fmt(t.retail.minQty, {
                quantity: formatQuantity(product.retailMinQty, unitLabel, locale),
              })}
            </p>
          ) : null}
        </div>

        {showShop ? (
          <p className="clamp-1 mt-2 text-caption text-muted-foreground">
            {product.company.displayName}
          </p>
        ) : null}

        {/*
          Above the stretched title link, or the card overlay would swallow every tap on
          the stepper and the shopper would land on the product page instead of adding it.
        */}
        <div className="relative z-10 mt-auto pt-3">
          <AddToCart
            shop={shop}
            unavailable={unavailable}
            product={{
              productId: product.id,
              slug: product.slug,
              title: product.title,
              unit: product.unit,
              unitPriceBani: retailPriceBani,
              oldPriceBani: onSale ? product.oldPriceBani : null,
              minQty: product.retailMinQty,
              photoKey: photo?.key ?? null,
            }}
          />
        </div>
      </div>
    </article>
  )
}
