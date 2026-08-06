'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/server/db'
import { assertOwnsProduct } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { isEnabled } from '@/server/services/feature-flags'
import {
  duplicateProduct,
  setProductStatus,
  softDeleteProduct,
} from '@/server/services/products'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Listing lifecycle actions for the seller's own dashboard.
 *
 * Every one of these takes a product id straight off a button in a table, so every one
 * of them re-resolves ownership through `assertOwnsProduct` before touching a row. The
 * id is the *only* thing the client contributes; the company it belongs to is read from
 * the database, never from the request.
 */

const idSchema = z.string().min(1, 'required').max(40)

function revalidateListings(): void {
  revalidatePath('/[locale]/dashboard/products', 'page')
  revalidatePath('/[locale]/products', 'page')
  revalidatePath('/[locale]/products/[slug]', 'page')
}

export async function pauseListing(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const id = parseInput(idSchema, productId)
    await assertOwnsProduct(id)

    await setProductStatus(id, 'PAUSED')

    revalidateListings()
    return ok()
  })
}

export async function resumeListing(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const id = parseInput(idSchema, productId)
    const { companyId } = await assertOwnsProduct(id)

    // Resuming with an empty balance would only last until the next nightly charge
    // pauses it again — say so now instead of letting it look like it worked.
    if (await isEnabled('BILLING_ENABLED')) {
      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { balanceBani: true, trialEndsAt: true },
      })
      const onTrial =
        company?.trialEndsAt !== null &&
        company?.trialEndsAt !== undefined &&
        company.trialEndsAt.getTime() > Date.now()

      if (!onTrial && (company?.balanceBani ?? 0) <= 0) {
        return fail('insufficientBalance')
      }
    }

    await setProductStatus(id, 'ACTIVE')

    revalidateListings()
    return ok()
  })
}

export async function archiveListing(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const id = parseInput(idSchema, productId)
    await assertOwnsProduct(id)

    await setProductStatus(id, 'ARCHIVED')

    revalidateListings()
    return ok()
  })
}

export async function duplicateListing(
  productId: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const id = parseInput(idSchema, productId)
    const { user, companyId } = await assertOwnsProduct(id)

    const limit = await checkWriteRateLimit(user.id, 'listingDuplicate')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    // The copy is filed under the company that owns the original, which the guard just
    // resolved — not under whatever company the caller claims to be.
    const created = await duplicateProduct(id, companyId)

    revalidateListings()
    return ok({ id: created })
  })
}

export async function deleteListing(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const id = parseInput(idSchema, productId)
    await assertOwnsProduct(id)

    await softDeleteProduct(id)

    revalidateListings()
    return ok()
  })
}
