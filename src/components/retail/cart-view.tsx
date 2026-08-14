'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, Package, ShoppingBasket, Store } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { formatMoney, formatQuantity, lineTotalBani } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Alert, Button, Dialog, EmptyState, SkeletonCard, buttonVariants } from '@/components/ui'
import { OldPrice } from '@/components/sales/sale-price'
import { refreshRetailCartAction, type PlacedRetailOrder } from '@/server/actions/retail'
import { CheckoutForm, type LocalityOption } from './checkout-form'
import { QuantityStepper } from './add-to-cart'
import { cartTotals, clearCart, reconcileCart, useCart, type CartLine } from './cart-store'

/**
 * The basket and the checkout, on one page.
 *
 * The basket is client state, so this whole view is: what the shopper collected, what it
 * costs, and the six fields needed to bring it to them. Three things it does that a
 * naive cart would not:
 *
 *   1. It re-reads the basket from the server on arrival. A cart assembled yesterday is
 *      repriced and anything withdrawn from sale is dropped *before* the shopper starts
 *      typing an address — being told at submit time is the worst moment to find out.
 *   2. It shows the delivery fee and how much is missing for free delivery while there is
 *      still time to add something, not on a confirmation screen.
 *   3. After the order it keeps the confirmation on screen instead of redirecting, since
 *      a signed-out shopper has no order history to redirect to.
 */

export function CartView({
  localities,
  defaults,
  isAuthenticated,
  ordersHref,
  deliveryHref,
}: {
  localities: readonly LocalityOption[]
  defaults: { name: string; phone: string; email: string }
  isAuthenticated: boolean
  ordersHref: string
  deliveryHref: string
}) {
  const { t, fmt, locale } = useI18n()
  const cart = useCart()

  const [mounted, setMounted] = useState(false)
  const [placed, setPlaced] = useState<PlacedOrderView | null>(null)
  const [shopClosed, setShopClosed] = useState(false)
  const [removed, setRemoved] = useState<readonly string[]>([])
  const [confirmingClear, setConfirmingClear] = useState(false)

  // The basket only exists in the browser, so the first paint has to wait for it rather
  // than flash «Корзина пуста» at somebody holding twelve items.
  useEffect(() => setMounted(true), [])

  const linesRef = useRef<readonly CartLine[]>([])
  useEffect(() => {
    linesRef.current = cart?.lines ?? []
  })

  const sellerCompanyId = cart?.shop.companyId ?? null
  const productKey = cart ? cart.lines.map((line) => line.productId).join(',') : ''

  useEffect(() => {
    if (sellerCompanyId === null || productKey === '') return

    let cancelled = false
    const productIds = productKey.split(',')

    void refreshRetailCartAction({ sellerCompanyId, productIds }).then((result) => {
      if (cancelled || !result.ok) return

      if (result.data === null) {
        setShopClosed(true)
        return
      }

      setShopClosed(false)

      const returned = new Set(result.data.lines.map((line) => line.productId))
      const missing = linesRef.current
        .filter((line) => !returned.has(line.productId))
        .map((line) => line.title)

      // Accumulated, never reset: reconciling removes the line, which re-runs this
      // effect, and clearing the list here would erase the notice before it was read.
      if (missing.length > 0) {
        setRemoved((previous) => [...new Set([...previous, ...missing])])
      }

      // Dropping a line changes `productKey`, so this runs once more and then settles:
      // the second answer matches what is already stored and reconcile does nothing.
      reconcileCart(result.data.shop, result.data.lines)
    })

    return () => {
      cancelled = true
    }
  }, [sellerCompanyId, productKey])

  if (!mounted) {
    return (
      <div className="container max-w-5xl py-8 md:py-10">
        <SkeletonCard />
      </div>
    )
  }

  if (placed !== null) {
    return (
      <OrderPlaced
        placed={placed}
        isAuthenticated={isAuthenticated}
        ordersHref={ordersHref}
        deliveryHref={deliveryHref}
      />
    )
  }

  if (cart === null) {
    return (
      <div className="container max-w-5xl py-8 md:py-10">
        <h1 className="text-h1">{t.retail.cartTitle}</h1>
        <EmptyState
          className="surface mt-6"
          icon={<ShoppingBasket aria-hidden />}
          title={t.retail.cartEmpty}
          description={t.retail.cartEmptyText}
          action={
            <Link href={deliveryHref} className={buttonVariants()}>
              {t.retail.cartEmptyAction}
            </Link>
          }
        />
      </div>
    )
  }

  const totals = cartTotals(cart)

  return (
    <div className="container max-w-5xl py-8 md:py-10">
      <header className="min-w-0">
        <h1 className="text-h1">{t.retail.cartTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link
            href={`${deliveryHref}/${cart.shop.slug}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {fmt(t.retail.cartFromShop, { shop: cart.shop.name })}
          </Link>
          <span className="mx-2 opacity-50">·</span>
          <span className="tnum">{fmt(t.retail.cartCount, { count: totals.itemCount })}</span>
        </p>
      </header>

      {shopClosed ? (
        <Alert variant="destructive" className="mt-4">
          {t.retail.errorShopUnavailable}
        </Alert>
      ) : null}

      {removed.length > 0 ? (
        <Alert variant="warning" className="mt-4">
          <ul className="space-y-1">
            {removed.map((title) => (
              <li key={title}>{fmt(t.retail.errorItemUnavailable, { title })}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------------ the basket */}
          <section className="surface" aria-labelledby="cart-items">
            <h2 id="cart-items" className="sr-only">
              {t.retail.orderItems}
            </h2>

            <ul className="divide-y divide-border">
              {cart.lines.map((line) => (
                <CartRow key={line.productId} line={line} />
              ))}
            </ul>
          </section>

          <div>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(true)}>
              {t.retail.cartClear}
            </Button>
          </div>

          {/* ---------------------------------------------------- the checkout */}
          <section className="surface p-5 md:p-6" aria-labelledby="cart-checkout">
            <h2 id="cart-checkout" className="text-h3">
              {t.retail.checkoutTitle}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{t.retail.checkoutSubtitle}</p>

            {!isAuthenticated ? (
              <Alert variant="info" className="mt-4">
                {t.retail.guestNotice}
              </Alert>
            ) : null}

            <div className="mt-5">
              <CheckoutForm
                sellerCompanyId={cart.shop.companyId}
                lines={cart.lines}
                localities={localities}
                defaults={defaults}
                disabled={shopClosed}
                onPlaced={(order) => {
                  setPlaced({
                    order,
                    shopName: cart.shop.name,
                    lines: [...cart.lines],
                  })
                  clearCart()
                  window.scrollTo({ top: 0 })
                }}
              />
            </div>
          </section>
        </div>

        {/* ---------------------------------------------------------- totals */}
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="surface p-5">
            <h2 className="text-h3">{t.retail.total}</h2>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t.retail.itemsTotal}</dt>
                <dd className="tnum font-medium">{formatMoney(totals.itemsTotalBani, locale)}</dd>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t.retail.deliveryFee}</dt>
                <dd className="tnum font-medium">
                  {!totals.deliveryKnown
                    ? t.retail.deliveryNotSet
                    : totals.deliveryFeeBani === 0
                      ? t.retail.deliveryFree
                      : formatMoney(totals.deliveryFeeBani, locale)}
                </dd>
              </div>
            </dl>

            {cart.shop.freeFromBani !== null ? (
              <FreeDeliveryMeter
                left={totals.freeFromLeftBani}
                progress={
                  cart.shop.freeFromBani === 0
                    ? 1
                    : Math.min(1, totals.itemsTotalBani / cart.shop.freeFromBani)
                }
                label={
                  totals.freeFromLeftBani > 0
                    ? fmt(t.retail.freeFromLeft, {
                        amount: formatMoney(totals.freeFromLeftBani, locale),
                      })
                    : t.retail.deliveryFree
                }
              />
            ) : null}

            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-4">
              <span className="font-medium">{t.retail.total}</span>
              <output className="tnum text-h3 font-semibold">
                {formatMoney(totals.totalBani, locale)}
              </output>
            </div>

            <p className="mt-3 text-caption text-muted-foreground">{t.retail.totalHint}</p>
          </div>
        </aside>
      </div>

      <Dialog
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        title={t.retail.cartClear}
        size="sm"
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingClear(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearCart()
                setConfirmingClear(false)
              }}
            >
              {t.retail.cartClear}
            </Button>
          </>
        }
      >
        <p>{t.retail.cartClearConfirm}</p>
      </Dialog>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* one basket row                                                              */
/* -------------------------------------------------------------------------- */

function CartRow({ line }: { line: CartLine }) {
  const { t, fmt, locale, href } = useI18n()
  const unitLabel = t.units[line.unit as keyof typeof t.units] ?? line.unit

  return (
    <li className="flex min-w-0 gap-3 p-4">
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {line.photoKey ? (
          <Image src={line.photoKey} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-muted-foreground">
            <Package className="h-5 w-5" aria-hidden />
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="clamp-2 text-sm font-medium leading-snug">
          {line.slug ? (
            <Link href={href('products', line.slug)} className="underline-offset-2 hover:underline">
              {line.title}
            </Link>
          ) : (
            line.title
          )}
        </p>

        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-caption text-muted-foreground">
          <span className="tnum">
            {fmt(t.retail.pricePerUnit, {
              price: formatMoney(line.unitPriceBani, locale),
              unit: unitLabel,
            })}
          </span>
          {line.oldPriceBani !== null ? (
            <OldPrice bani={line.oldPriceBani} locale={locale} t={t} />
          ) : null}
        </p>

        <div className="mt-2.5 flex items-center justify-between gap-3">
          <QuantityStepper
            productId={line.productId}
            title={line.title}
            quantity={line.quantity}
            minQty={line.minQty}
            unit={line.unit}
            className="w-28 shrink-0"
          />
          <span className="tnum text-sm font-semibold">
            {formatMoney(lineTotalBani(line.quantity, line.unitPriceBani), locale)}
          </span>
        </div>

        <p className="sr-only">{formatQuantity(line.quantity, unitLabel, locale)}</p>
      </div>
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* free-delivery meter                                                         */
/* -------------------------------------------------------------------------- */

function FreeDeliveryMeter({
  left,
  progress,
  label,
}: {
  left: number
  progress: number
  label: string
}) {
  return (
    <div className="mt-4">
      <p className={cn('text-caption', left > 0 ? 'text-muted-foreground' : 'text-success')}>
        {label}
      </p>
      {/* Decorative: the sentence above already carries the whole meaning. */}
      <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            left > 0 ? 'bg-primary' : 'bg-success',
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* confirmation                                                                */
/* -------------------------------------------------------------------------- */

interface PlacedOrderView {
  order: PlacedRetailOrder
  shopName: string
  lines: readonly CartLine[]
}

/**
 * What was ordered, from whom, for how much — and who is owed the money.
 *
 * The line prices are deliberately absent: the server re-priced the basket, so the only
 * total that is true is the one it returned, and printing stale line prices beside it
 * would invite exactly the arithmetic that does not add up. Quantities do not change.
 */
function OrderPlaced({
  placed,
  isAuthenticated,
  ordersHref,
  deliveryHref,
}: {
  placed: PlacedOrderView
  isAuthenticated: boolean
  ordersHref: string
  deliveryHref: string
}) {
  const { t, fmt, locale } = useI18n()

  return (
    <div className="container max-w-2xl py-10 md:py-14">
      <div className="surface p-6 md:p-8">
        <span aria-hidden="true" className="icon-chip h-12 w-12 bg-success-soft text-success">
          <CheckCircle2 className="h-6 w-6" />
        </span>

        <h1 className="mt-5 text-h2">{t.retail.placedTitle}</h1>
        <p className="mt-2 text-muted-foreground">
          {fmt(t.retail.placedText, { number: placed.order.number })}
        </p>

        <dl className="surface-muted mt-6 space-y-3 p-4">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Store className="h-4 w-4 shrink-0" aria-hidden />
              {t.retail.orderShop}
            </dt>
            <dd className="min-w-0 truncate text-sm font-medium">{placed.shopName}</dd>
          </div>

          <div>
            <dt className="text-sm text-muted-foreground">{t.retail.orderItems}</dt>
            <dd className="mt-1.5">
              <ul className="space-y-1 text-sm">
                {placed.lines.map((line) => (
                  <li key={line.productId} className="flex min-w-0 justify-between gap-3">
                    <span className="min-w-0 truncate">{line.title}</span>
                    <span className="tnum shrink-0 text-muted-foreground">
                      {formatQuantity(
                        line.quantity,
                        t.units[line.unit as keyof typeof t.units] ?? line.unit,
                        locale,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="font-medium">{t.retail.orderTotal}</dt>
            <dd className="tnum text-h3 font-semibold">
              {formatMoney(placed.order.totalBani, locale)}
            </dd>
          </div>
        </dl>

        {/*
          Said plainly, on the screen where it matters: the shop is owed the money, and
          Product.md is not standing between the two of them.
        */}
        <p className="mt-4 text-sm text-muted-foreground">{t.retail.paymentHint}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {isAuthenticated ? (
            <Link href={ordersHref} className={buttonVariants()}>
              {t.retail.placedOpenOrder}
            </Link>
          ) : null}
          <Link
            href={deliveryHref}
            className={buttonVariants({ variant: isAuthenticated ? 'outline' : 'primary' })}
          >
            {t.retail.placedContinue}
          </Link>
        </div>
      </div>
    </div>
  )
}
