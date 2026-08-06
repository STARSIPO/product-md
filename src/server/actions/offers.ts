'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { assertBuyer, assertSeller } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { offerSchema } from '@/lib/validation'
import {
  acceptOffer,
  createOffer,
  rejectOffer,
  shortlistOffer,
  updateOffer,
  withdrawOffer,
} from '@/server/services/offers'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Sealed-offer mutations.
 *
 * Every function delegates to src/server/services/offers.ts, which takes the acting
 * company id as a *required* argument and puts it in the WHERE clause. That is the whole
 * privacy model: a seller's action can only ever match its own row, and a buyer's action
 * can only ever match a row hanging off a request its company owns. No action here
 * accepts an "isOwner" flag, and none of them touches the Offer table directly.
 */

/** Raw form shape — money and dates arrive as strings before coercion. */
export type OfferFormInput = z.input<typeof offerSchema>

export async function createOfferAction(input: OfferFormInput): Promise<ActionResult<string>> {
  return runAction(async () => {
    const user = await assertSeller()

    const limit = await checkWriteRateLimit(user.id, 'offer')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const parsed = parseInput(offerSchema, input)
    const created = await createOffer(user.companyId, parsed)

    revalidatePath('/[locale]/requests/[slug]', 'page')
    revalidatePath('/[locale]/dashboard/offers', 'page')

    return ok(created.id)
  })
}

export async function updateOfferAction(
  offerId: string,
  input: OfferFormInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertSeller()

    const limit = await checkWriteRateLimit(user.id, 'offer')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const { requestId: _requestId, ...values } = parseInput(offerSchema, input)
    await updateOffer(offerId, user.companyId, values)

    revalidatePath('/[locale]/requests/[slug]', 'page')
    revalidatePath('/[locale]/dashboard/offers', 'page')

    return ok()
  })
}

export async function withdrawOfferAction(offerId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertSeller()
    await withdrawOffer(offerId, user.companyId)

    revalidatePath('/[locale]/requests/[slug]', 'page')
    revalidatePath('/[locale]/dashboard/offers', 'page')

    return ok()
  })
}

// --- buyer decisions ---------------------------------------------------------

export async function shortlistOfferAction(
  offerId: string,
  shortlisted: boolean,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertBuyer()
    await shortlistOffer(offerId, user.companyId, shortlisted)

    revalidatePath('/[locale]/requests/[slug]/offers', 'page')
    return ok()
  })
}

export async function rejectOfferAction(offerId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertBuyer()
    await rejectOffer(offerId, user.companyId)

    revalidatePath('/[locale]/requests/[slug]/offers', 'page')
    return ok()
  })
}

/**
 * Choosing a supplier. `acceptOffer` creates the deal, marks the winner and rejects the
 * rest inside one transaction, so a double click cannot produce two deals.
 */
export async function acceptOfferAction(offerId: string): Promise<ActionResult<string>> {
  return runAction(async () => {
    const user = await assertBuyer()

    const limit = await checkWriteRateLimit(user.id, 'offerAccept')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const { dealId } = await acceptOffer(offerId, user.companyId, user.id)

    revalidatePath('/[locale]/requests/[slug]/offers', 'page')
    revalidatePath('/[locale]/requests/[slug]', 'page')
    revalidatePath('/[locale]/deals', 'page')

    return ok(dealId)
  })
}
