'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ShoppingBasket } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { formatMoney } from '@/lib/money'
import { cartTotals, useCart } from './cart-store'

/**
 * The floating basket, shown on the storefront once something is in it.
 *
 * A shopper who has added eight things needs the total and a way to finish without
 * hunting through a menu — and on a phone the thing they can always reach is the bottom
 * of the screen. It rides above the mobile navigation bar rather than replacing it, and
 * it is absent entirely while the basket is empty, so it never occupies space it has not
 * earned.
 */
export function CartBar({ cartHref }: { cartHref: string }) {
  const { t, fmt, locale } = useI18n()
  const cart = useCart()
  const [mounted, setMounted] = useState(false)

  // The basket is read from localStorage, which the server cannot know about.
  useEffect(() => setMounted(true), [])

  if (!mounted || cart === null) return null

  const totals = cartTotals(cart)

  // No live region: it would announce on every ± tap. The link's own text is enough.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 px-4 md:bottom-6">
      <div className="mx-auto w-full max-w-md">
        <Link
          href={cartHref}
          className="pointer-events-auto flex min-h-[52px] min-w-0 items-center gap-3 rounded-full bg-primary px-5 text-primary-foreground shadow-pop transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ShoppingBasket className="h-5 w-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {fmt(t.retail.cartCount, { count: totals.itemCount })}
          </span>
          <span className="tnum shrink-0 text-sm font-semibold">
            {formatMoney(totals.totalBani, locale)}
          </span>
          <ChevronRight className="-mr-1 h-4 w-4 shrink-0 opacity-80" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
