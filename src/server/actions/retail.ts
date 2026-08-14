'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/auth/session'
import { clientIp, consume } from '@/server/auth/rate-limit'
import { placeRetailOrder, retailPriceOf } from '@/server/services/retail'
import { idSchema, retailOrderSchema } from '@/lib/validation'
import { isOnSale } from '@/lib/money'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Consumer storefront actions.
 *
 * These are the only two actions in the product that run for a signed-out visitor, and
 * that is on purpose: a household buying two kilos of potatoes is not a company and must
 * not be asked to register before it can order. So there is no guard from
 * `@/server/auth/guards` here — there is no account to authorize. What replaces it:
 *
 *   - the session is *read*, never required; a signed-in shopper gets the order attached
 *     to their account so it shows up under «Мои заказы», a guest gets `null`
 *   - the payload is parsed with `retailOrderSchema` before anything touches the database
 *   - prices, minimums, availability and the delivery fee are re-read server-side inside
 *     `placeRetailOrder`; the cart's own numbers are display state and nothing more
 *   - both actions are rate-limited by user id, falling back to the client address for
 *     guests, because an unauthenticated write endpoint is otherwise free to abuse
 *
 * No money moves here. Product.md records what was ordered and hands it to the seller;
 * the shopper pays the seller directly.
 */

export interface PlacedRetailOrder {
  id: string
  number: string
  totalBani: number
}

export async function placeRetailOrderAction(
  input: unknown,
): Promise<ActionResult<PlacedRetailOrder>> {
  return runAction(async () => {
    const parsed = parseInput(retailOrderSchema, input)
    const user = await getCurrentUser()

    // Durable, because this is a write an anonymous visitor can reach: an in-memory
    // window alone would reset with the process and is per-instance.
    const limit = await consume({
      key: `retail-order:${user?.id ?? clientIp()}`,
      limit: 10,
      windowSeconds: 15 * 60,
      durable: true,
    })
    if (!limit.ok) {
      return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })
    }

    const order = await placeRetailOrder(
      {
        sellerCompanyId: parsed.sellerCompanyId,
        lines: parsed.lines,
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        customerEmail: parsed.customerEmail,
        deliveryAddress: parsed.deliveryAddress,
        deliveryLocalityId: parsed.deliveryLocalityId,
        deliveryNote: parsed.deliveryNote,
        paymentMethod: parsed.paymentMethod,
      },
      user?.id ?? null,
    )

    // The seller's queue and the shopper's own list both change on a new order.
    revalidatePath('/[locale]/dashboard/orders', 'page')
    revalidatePath('/[locale]/orders', 'page')

    return ok(order)
  })
}

/* -------------------------------------------------------------------------- */
/* cart refresh                                                                */
/* -------------------------------------------------------------------------- */

const cartRefreshSchema = z.object({
  sellerCompanyId: idSchema,
  productIds: z.array(idSchema).min(1).max(60),
})

export interface RefreshedCartLine {
  productId: string
  slug: string
  title: string
  unit: string
  unitPriceBani: number
  oldPriceBani: number | null
  minQty: number
  photoKey: string | null
}

export interface RefreshedCart {
  shop: {
    companyId: string
    slug: string
    name: string
    deliveryFeeBani: number | null
    freeFromBani: number | null
  }
  lines: RefreshedCartLine[]
}

/**
 * Re-reads a basket assembled some time ago.
 *
 * The cart page calls this on mount so the shopper sees today's prices and loses the
 * lines that have left the storefront *before* filling in an address — finding out at
 * submit time that an item is gone is the worst moment to be told. A product missing
 * from the answer is simply no longer on sale; the caller drops it.
 *
 * Returns `null` data when the shop itself has stopped taking orders.
 */
export async function refreshRetailCartAction(
  input: unknown,
): Promise<ActionResult<RefreshedCart | null>> {
  return runAction(async () => {
    const parsed = parseInput(cartRefreshSchema, input)
    const user = await getCurrentUser()

    const limit = await consume({
      key: `retail-cart:${user?.id ?? clientIp()}`,
      limit: 60,
      windowSeconds: 60,
    })
    if (!limit.ok) {
      return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })
    }

    const company = await db.company.findFirst({
      where: { id: parsed.sellerCompanyId, status: 'ACTIVE', isRetail: true },
      select: {
        id: true,
        slug: true,
        displayName: true,
        retailDeliveryFeeBani: true,
        retailFreeFromBani: true,
      },
    })
    if (!company) return ok(null)

    const products = await db.product.findMany({
      where: {
        id: { in: parsed.productIds },
        companyId: company.id,
        status: 'ACTIVE',
        deletedAt: null,
        isRetail: true,
        availability: { not: 'OUT_OF_STOCK' },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        unit: true,
        priceBani: true,
        oldPriceBani: true,
        discountEndsAt: true,
        retailPriceBani: true,
        retailMinQty: true,
        photos: { select: { key: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    })

    return ok({
      shop: {
        companyId: company.id,
        slug: company.slug,
        name: company.displayName,
        deliveryFeeBani: company.retailDeliveryFeeBani,
        freeFromBani: company.retailFreeFromBani,
      },
      lines: products.map((product) => ({
        productId: product.id,
        slug: product.slug,
        title: product.title,
        unit: product.unit,
        unitPriceBani: retailPriceOf(product),
        // A sale only carries over to retail when the retail price *is* the discounted
        // one. With a separate retail price there is no previous retail price to strike
        // through, and showing the wholesale one would misstate the saving.
        oldPriceBani:
          product.retailPriceBani === null && isOnSale(product) ? product.oldPriceBani : null,
        minQty: product.retailMinQty,
        photoKey: product.photos[0]?.key ?? null,
      })),
    })
  })
}
