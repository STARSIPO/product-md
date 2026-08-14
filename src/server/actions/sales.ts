'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/server/db'
import { assertOwnsProduct } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { setProductSale } from '@/server/services/sales'
import { productSaleSchema } from '@/lib/validation'
import { MIN_DISCOUNT_PERCENT } from '@/lib/constants'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Starting and ending a discount.
 *
 * A discount is a price the seller chose to lower — nothing here is bought, billed or
 * boosted, so no balance is touched and no tariff is consulted. The only thing the
 * client contributes is a product id and a number; the price it is being compared
 * against is re-read from the database, because a "regular price" posted from a form
 * would let anyone claim a 90% saving off a figure they invented.
 */

const idSchema = z.string().min(1, 'required').max(40)

function revalidateSales(): void {
  revalidatePath('/[locale]', 'page')
  revalidatePath('/[locale]/sales', 'page')
  revalidatePath('/[locale]/products', 'page')
  revalidatePath('/[locale]/products/[slug]', 'page')
  revalidatePath('/[locale]/dashboard/sales', 'page')
  revalidatePath('/[locale]/dashboard/products', 'page')
}

/**
 * The price a discount is measured against.
 *
 * Once a sale is running, `priceBani` is the reduced figure and `oldPriceBani` holds
 * what it was — so editing a live sale has to compare against the latter, or the
 * second reduction would be measured off the first one and every edit would look like
 * a fresh saving.
 */
function regularPriceOf(product: { priceBani: number; oldPriceBani: number | null }): number {
  return product.oldPriceBani ?? product.priceBani
}

export async function saveProductSale(input: {
  productId: string
  salePriceBani?: string | number | null
  endsAt?: string | null
}): Promise<ActionResult<{ percent: number }>> {
  return runAction(async () => {
    const data = parseInput(productSaleSchema, input)
    const { user, companyId } = await assertOwnsProduct(data.productId)

    const limit = await checkWriteRateLimit(user.id, 'productSale')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    // `assertOwnsProduct` resolved the owning company; the prices come from the same
    // source of truth rather than from the form.
    const product = await db.product.findFirst({
      where: { id: data.productId, companyId, deletedAt: null },
      select: { priceBani: true, oldPriceBani: true },
    })
    if (!product) return fail('notFound')

    if (data.salePriceBani === undefined) {
      return fail('validation', { fields: { salePriceBani: 'required' } })
    }

    const regular = regularPriceOf(product)
    if (data.salePriceBani >= regular) return fail('saleNotLower')

    const percent = Math.round(((regular - data.salePriceBani) / regular) * 100)
    if (percent < MIN_DISCOUNT_PERCENT) {
      return fail('saleTooSmall', { params: { percent: MIN_DISCOUNT_PERCENT } })
    }

    await setProductSale(data.productId, companyId, {
      salePriceBani: data.salePriceBani,
      endsAt: data.endsAt ?? null,
    })

    revalidateSales()
    return ok({ percent })
  })
}

/** Ends a discount. `setProductSale` puts the original price back, so nothing is lost. */
export async function clearProductSale(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const id = parseInput(idSchema, productId)
    const { user, companyId } = await assertOwnsProduct(id)

    const limit = await checkWriteRateLimit(user.id, 'productSale')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    await setProductSale(id, companyId, { salePriceBani: null, endsAt: null })

    revalidateSales()
    return ok()
  })
}
