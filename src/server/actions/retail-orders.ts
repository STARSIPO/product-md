'use server'

import { revalidatePath } from 'next/cache'
import { assertSeller } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { transitionOrder } from '@/server/services/retail'
import { retailOrderStatusSchema } from '@/lib/validation'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Moving a consumer order along, from the seller's side.
 *
 * The order id is the only thing the client contributes, and it is not trusted either:
 * `assertSeller()` resolves the company from the session and `transitionOrder` scopes
 * the row by it, so an id belonging to another shop simply does not resolve. The target
 * status is checked against RETAIL_ORDER_TRANSITIONS inside the service — the buttons
 * on the screen are an affordance, not the rule.
 *
 * No money moves here. The shopper pays the shop directly, so an order reaching
 * DELIVERED settles nothing on the platform and touches no balance.
 */
export async function updateRetailOrderStatus(input: {
  orderId: string
  status: string
  reason?: string
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertSeller()

    const limit = await checkWriteRateLimit(user.id, 'retailOrder')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const data = parseInput(retailOrderStatusSchema, input)

    // A cancelled order is the one outcome the shopper did not choose, so it never
    // arrives unexplained.
    if (data.status === 'CANCELLED' && !data.reason) {
      return fail('validation', { fields: { reason: 'required' } })
    }

    await transitionOrder(data.orderId, user.companyId, data.status, data.reason)

    revalidatePath('/[locale]/dashboard/orders', 'page')
    revalidatePath('/[locale]/dashboard', 'page')
    revalidatePath('/[locale]/orders', 'page')

    return ok()
  })
}
