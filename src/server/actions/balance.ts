'use server'

import { db } from '@/server/db'
import { env } from '@/env'
import { assertCompany } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { generateToken } from '@/server/crypto'
import { payments } from '@/server/payments'
import { reportError } from '@/server/observability'
import { resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { topUpSchema } from '@/lib/validation'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Balance top-ups.
 *
 * The only money this platform ever handles is its own prepaid balance — goods are
 * paid for directly between buyer and seller, off-platform. The flow is deliberately
 * three-legged:
 *
 *   1. a Payment row is written first, with a unique idempotency key, so a redirect
 *      that never comes back leaves an auditable PENDING record rather than nothing;
 *   2. the provider gets a hosted-page request and hands back a redirect;
 *   3. the *webhook* — never the browser return URL — is what credits the ledger.
 *
 * Step 3 is why nothing here touches `appendEntry`: a user who closes the tab, or who
 * hand-crafts a return URL, must not be able to move their own balance.
 */

export interface TopUpStarted {
  redirectUrl: string
  paymentId: string
}

export async function startTopUp(
  raw: unknown,
  localeValue: string,
): Promise<ActionResult<TopUpStarted>> {
  return runAction(async () => {
    const user = await assertCompany()

    const limit = await checkWriteRateLimit(user.id, 'topUp')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const input = parseInput(topUpSchema, raw)
    const locale = resolveLocale(localeValue)

    // Fresh per attempt: the provider treats it as its dedupe key, and reusing one
    // across two genuine top-ups would silently drop the second.
    const idempotencyKey = `topup:${user.companyId}:${generateToken(12)}`
    const returnUrl = `${env.APP_URL}${localePath(locale, 'dashboard', 'balance')}`

    const payment = await db.payment.create({
      data: {
        companyId: user.companyId,
        provider: payments.name,
        amountBani: input.amountBani,
        currency: 'MDL',
        status: 'PENDING',
        idempotencyKey,
        returnUrl,
      },
      select: { id: true },
    })

    try {
      const created = await payments.createPayment({
        paymentId: payment.id,
        amountBani: input.amountBani,
        currency: 'MDL',
        description: `Product.md — ${user.companyId}`,
        returnUrl,
        idempotencyKey,
      })

      await db.payment.update({
        where: { id: payment.id },
        data: { providerRef: created.providerRef },
      })

      return ok({ redirectUrl: created.redirectUrl, paymentId: payment.id })
    } catch (error) {
      // A driver that is selected but not implemented throws here. Mark the attempt
      // failed so the history does not fill with phantom PENDING rows.
      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureCode: 'provider_unavailable' },
      })
      reportError(error, { scope: 'top-up', companyId: user.companyId })
      return fail('generic')
    }
  })
}
