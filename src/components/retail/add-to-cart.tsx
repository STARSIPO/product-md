'use client'

import { useState } from 'react'
import { Minus, Plus, ShoppingBasket, Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { formatNumber } from '@/lib/i18n/format'
import { formatQuantity } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Button, Dialog, useToast } from '@/components/ui'
import {
  addLine,
  decreaseLine,
  increaseLine,
  removeLine,
  replaceCart,
  useLineQuantity,
  type CartLine,
  type CartShop,
} from './cart-store'

/**
 * The «В корзину» control.
 *
 * One button until the item is in the basket, then a stepper in the same place — the
 * card never changes height, so a grid of twenty products does not reflow when one of
 * them is added.
 *
 * Steps by the shop's own minimum rather than by one: a farm selling by the half-kilo
 * steps in 0.5 kg, and stepping down past the minimum removes the line, because there
 * is no valid quantity between zero and the minimum.
 */

export type AddToCartProduct = Omit<CartLine, 'quantity'>

export function AddToCart({
  shop,
  product,
  unavailable = false,
  className,
}: {
  shop: CartShop
  product: AddToCartProduct
  unavailable?: boolean
  className?: string
}) {
  const { t, fmt } = useI18n()
  const { toast } = useToast()
  const quantity = useLineQuantity(product.productId)
  const [confirming, setConfirming] = useState(false)

  function add() {
    const result = addLine(shop, product)

    if (result === 'other-shop') {
      setConfirming(true)
      return
    }
    if (result === 'full') {
      toast({ title: t.retail.errorCartFull, variant: 'error' })
    }
  }

  if (unavailable) {
    return (
      <p className={cn('text-caption text-muted-foreground', className)}>{t.retail.unavailable}</p>
    )
  }

  return (
    <>
      {quantity > 0 ? (
        <QuantityStepper
          productId={product.productId}
          title={product.title}
          quantity={quantity}
          minQty={product.minQty}
          unit={product.unit}
          className={className}
        />
      ) : (
        <Button size="sm" fullWidth onClick={add} className={className}>
          <ShoppingBasket className="h-4 w-4" aria-hidden />
          {t.retail.addToCart}
        </Button>
      )}

      {/*
        One basket, one shop. A courier cannot collect from two addresses, so a second
        shop replaces the first — but only after the shopper says so, never silently.
      */}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t.retail.cartOtherShopTitle}
        size="sm"
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={() => {
                replaceCart(shop, product)
                setConfirming(false)
              }}
            >
              {t.retail.cartOtherShopConfirm}
            </Button>
          </>
        }
      >
        <p>{fmt(t.retail.cartOtherShopText, { shop: shop.name })}</p>
      </Dialog>
    </>
  )
}

/**
 * − quantity + .
 *
 * The controls stay 44px tall everywhere; their width flexes, because two catalogue
 * columns at 320px leave about 106px for the whole row and a fixed 44px square each
 * would not fit beside the number. Height is the dimension a thumb misses.
 */
export function QuantityStepper({
  productId,
  title,
  quantity,
  minQty,
  unit,
  className,
}: {
  productId: string
  title: string
  quantity: number
  minQty: number
  unit: string
  className?: string
}) {
  const { t, fmt, locale } = useI18n()
  const unitLabel = t.units[unit as keyof typeof t.units] ?? unit
  const atMinimum = quantity <= minQty

  return (
    <div
      className={cn('surface-muted flex h-11 items-center justify-between gap-1 px-1', className)}
    >
      <Button
        variant="ghost"
        size="sm"
        aria-label={atMinimum ? `${t.retail.removeItem}: ${title}` : t.retail.decrease}
        onClick={() => (atMinimum ? removeLine(productId) : decreaseLine(productId))}
        className="h-11 min-h-0 flex-1 basis-9 px-0"
      >
        {atMinimum ? (
          <Trash2 className="h-4 w-4" aria-hidden />
        ) : (
          <Minus className="h-4 w-4" aria-hidden />
        )}
      </Button>

      <output
        aria-live="polite"
        className="tnum min-w-[2ch] shrink-0 px-1 text-center text-sm font-semibold"
      >
        <span className="sr-only">
          {fmt(t.retail.inCartQty, { quantity: formatQuantity(quantity, unitLabel, locale) })}
        </span>
        <span aria-hidden="true">{formatNumber(quantity, locale, 3)}</span>
      </output>

      <Button
        variant="ghost"
        size="sm"
        aria-label={t.retail.increase}
        onClick={() => increaseLine(productId)}
        className="h-11 min-h-0 flex-1 basis-9 px-0"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  )
}
