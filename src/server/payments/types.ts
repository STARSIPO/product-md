import 'server-only'

/**
 * The payment provider contract.
 *
 * Product.md only ever charges its own balance top-ups — goods are paid for directly
 * between buyer and seller, off-platform. That keeps this interface small: start a
 * hosted-page payment, verify the callback, refund.
 */

export interface CreatePaymentInput {
  paymentId: string // our internal Payment.id
  amountBani: number
  currency: string
  description: string
  returnUrl: string
  idempotencyKey: string
}

export interface CreatePaymentResult {
  redirectUrl: string
  providerRef: string
}

export interface WebhookVerification {
  valid: boolean
  externalId: string
  paymentId: string | null
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'REFUNDED'
  amountBani: number | null
}

export interface PaymentProvider {
  readonly name: string
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookVerification>
  refund(providerRef: string, amountBani: number): Promise<{ ok: boolean; reference: string }>
}
