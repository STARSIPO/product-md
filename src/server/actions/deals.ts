'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { assertBuyer, assertDealParticipant } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { dealFromProductSchema, dealStatusSchema } from '@/lib/validation'
import { DEAL_STATUSES, type DealStatus } from '@/lib/constants'
import { createDealFromProduct, transitionDeal } from '@/server/services/deals'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Deal mutations.
 *
 * The UI only renders transitions that DEAL_TRANSITIONS allows from the current status,
 * but that is a convenience, not the check: `transitionDeal` re-reads the deal, applies
 * the same table and enforces the role rules (only the seller ships, only the buyer
 * completes). A crafted POST with a stale or invented status is rejected there.
 */

export type DealFromProductFormInput = z.input<typeof dealFromProductSchema>

function isDealStatus(value: string): value is DealStatus {
  return (DEAL_STATUSES as readonly string[]).includes(value)
}

export async function transitionDealAction(input: {
  dealId: string
  status: string
  comment?: string
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const parsed = parseInput(dealStatusSchema, input)

    // Narrow before the service call so an unknown string never reaches the table lookup.
    if (!isDealStatus(parsed.status)) return fail('dealTransitionInvalid')

    const { user, side } = await assertDealParticipant(parsed.dealId)

    const limit = await checkWriteRateLimit(user.id, 'deal')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    await transitionDeal(parsed.dealId, user.id, side, parsed.status, parsed.comment)

    revalidatePath('/[locale]/deals', 'page')
    revalidatePath('/[locale]/deals/[id]', 'page')

    return ok()
  })
}

/** Direct purchase from a catalogue listing, without going through a request. */
export async function createDealFromProductAction(
  input: DealFromProductFormInput,
): Promise<ActionResult<string>> {
  return runAction(async () => {
    const user = await assertBuyer()

    const limit = await checkWriteRateLimit(user.id, 'deal')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const parsed = parseInput(dealFromProductSchema, input)

    const dealId = await createDealFromProduct(user.companyId, user.id, {
      productId: parsed.productId,
      quantity: parsed.quantity,
      deliveryAddress: parsed.deliveryAddress,
      deliveryAt: parsed.deliveryAt,
      paymentMethod: parsed.paymentMethod,
      comment: parsed.comment,
    })

    revalidatePath('/[locale]/deals', 'page')
    return ok(dealId)
  })
}
