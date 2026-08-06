import 'server-only'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { env } from '@/env'
import { safeEqual, signPayload, verifySignature } from '@/server/crypto'
import { logEvent } from '@/server/observability'
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from '@/server/payments/types'

/**
 * ===========================================================================
 * NO REAL MONEY MOVES THROUGH THIS FILE.
 * ===========================================================================
 *
 * There is no bank integration behind it and it is not pretending to be one: nothing
 * here opens a socket, and the "redirect" goes to a page inside this application.
 *
 * What it *is*: a complete, honest exercise of the top-up flow — create a payment,
 * leave the app, come back, receive a signed webhook, credit the ledger. That path
 * contains all the interesting bugs (double-crediting on a replayed webhook, a
 * mismatched amount, a stale return), and it can all be tested on a laptop with no
 * merchant account.
 *
 * The signature scheme mirrors what a real PSP does — HMAC-SHA256 over the raw request
 * body — so swapping in maib or paynet later changes the digest and header name, not
 * the shape of the code that consumes it.
 */

const CHECKOUT_TOKEN_PURPOSE = 'mock-payment'

/** Long enough to click through the fake checkout, short enough that a stale link dies. */
const CHECKOUT_TOKEN_TTL_SECONDS = 30 * 60

const checkoutPayloadSchema = z.object({
  paymentId: z.string().min(1),
  amountBani: z.number().int().positive(),
  currency: z.string().min(1),
  returnUrl: z.string().min(1),
  exp: z.number().int().positive(),
})

export type MockCheckoutPayload = z.infer<typeof checkoutPayloadSchema>

const webhookBodySchema = z.object({
  externalId: z.string().min(1),
  paymentId: z.string().min(1).nullish(),
  status: z.enum(['SUCCEEDED', 'FAILED', 'PENDING', 'REFUNDED']),
  amountBani: z.number().int().nullish(),
})

function webhookDigest(rawBody: string): string {
  return createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex')
}

/**
 * Produces the header value the mock checkout page must send back with its callback.
 * Exported so the local flow signs its own webhook exactly the way a provider would,
 * instead of the receiving route special-casing "trust this one".
 */
export function signMockWebhook(rawBody: string): string {
  return webhookDigest(rawBody)
}

/** Reads the token carried on the checkout URL. Returns null for tampered or expired ones. */
export function parseMockCheckoutToken(token: string): MockCheckoutPayload | null {
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return null
  if (!verifySignature(encoded, signature, CHECKOUT_TOKEN_PURPOSE)) return null

  try {
    const decoded: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    const parsed = checkoutPayloadSchema.safeParse(decoded)
    if (!parsed.success) return null
    if (parsed.data.exp * 1000 <= Date.now()) return null
    return parsed.data
  } catch {
    return null
  }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const payload: MockCheckoutPayload = {
      paymentId: input.paymentId,
      amountBani: input.amountBani,
      currency: input.currency,
      returnUrl: input.returnUrl,
      exp: Math.floor(Date.now() / 1000) + CHECKOUT_TOKEN_TTL_SECONDS,
    }

    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const token = `${encoded}.${signPayload(encoded, CHECKOUT_TOKEN_PURPOSE)}`

    // Derived from the idempotency key, not from the clock: retrying a create for the
    // same key yields the same reference, which is how a real PSP behaves and what the
    // ledger relies on to avoid crediting a top-up twice.
    const providerRef = `mock_${signPayload(input.idempotencyKey, CHECKOUT_TOKEN_PURPOSE).slice(0, 24)}`

    logEvent('payment.mock.created', {
      paymentId: input.paymentId,
      amountBani: input.amountBani,
      providerRef,
    })

    return {
      redirectUrl: `${env.APP_URL}/api/payments/mock/checkout?token=${token}`,
      providerRef,
    }
  }

  async verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookVerification> {
    // `status` has to be one of the four; FAILED is the safe answer for a callback we
    // could not authenticate, since the caller must never credit a balance on it.
    const rejected: WebhookVerification = {
      valid: false,
      externalId: '',
      paymentId: null,
      status: 'FAILED',
      amountBani: null,
    }

    if (!signature) return rejected
    if (!safeEqual(webhookDigest(rawBody), signature)) return rejected

    let decoded: unknown
    try {
      decoded = JSON.parse(rawBody)
    } catch {
      return rejected
    }

    const parsed = webhookBodySchema.safeParse(decoded)
    if (!parsed.success) return rejected

    return {
      valid: true,
      externalId: parsed.data.externalId,
      paymentId: parsed.data.paymentId ?? null,
      status: parsed.data.status,
      amountBani: parsed.data.amountBani ?? null,
    }
  }

  async refund(
    providerRef: string,
    amountBani: number,
  ): Promise<{ ok: boolean; reference: string }> {
    // Nothing is reversed anywhere — there was nothing to reverse. The reference is
    // returned so the ledger entry has the same shape it will have with a real provider.
    logEvent('payment.mock.refunded', { providerRef, amountBani })
    return {
      ok: true,
      reference: `mock_refund_${signPayload(`${providerRef}:${amountBani}`, CHECKOUT_TOKEN_PURPOSE).slice(0, 24)}`,
    }
  }
}
