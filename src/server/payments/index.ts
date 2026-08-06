import 'server-only'
import { env } from '@/env'
import { MockPaymentProvider } from '@/server/payments/mock'
import type { PaymentProvider } from '@/server/payments/types'

/**
 * =============================================================================
 * Wiring a real Moldovan payment provider
 * =============================================================================
 *
 * Only the mock provider is implemented. The four real drivers below are selectable in
 * env but deliberately throw instead of doing something plausible-looking: a payment
 * integration that "works" without a contract with the bank is the single most dangerous
 * kind of placeholder in this codebase.
 *
 * Each one needs its own file next to this one, exporting a class that implements
 * PaymentProvider. What to collect before starting, and what the integration owes the
 * rest of the app:
 *
 * --- maib (Moldova Agroindbank) — src/server/payments/maib.ts
 *   credentials : merchant/project id + secret (or the ECOMM client TLS certificate and
 *                 its password, depending on which product the bank enables for you) —
 *                 MAIB_MERCHANT_ID, MAIB_PRIVATE_KEY are already reserved in .env.example
 *   webhook     : register POST {APP_URL}/api/payments/webhook/maib in the merchant
 *                 console; the bank only calls URLs it has on file, and only over HTTPS
 *   signature   : the callback carries a signature computed by the bank over the raw
 *                 body — verify it against the raw bytes, never against a re-serialised
 *                 JSON object, and reject on mismatch before touching the ledger
 *   note        : maib issues separate test and production credentials and endpoints;
 *                 keep the base URL in the driver, keyed off NODE_ENV
 *
 * --- Victoriabank — src/server/payments/victoriabank.ts
 *   credentials : VICTORIABANK_MERCHANT_ID, VICTORIABANK_SECRET
 *   webhook     : POST {APP_URL}/api/payments/webhook/victoriabank, registered with the
 *                 bank's e-commerce desk
 *   signature   : HMAC over the raw callback body with the shared secret; compare in
 *                 constant time (see safeEqual in server/crypto.ts)
 *
 * --- Paynet — src/server/payments/paynet.ts
 *   credentials : PAYNET_MERCHANT_ID, PAYNET_SECRET (Paynet also issues an API user for
 *                 the token endpoint — obtain an access token before creating a payment)
 *   webhook     : POST {APP_URL}/api/payments/webhook/paynet
 *   signature   : signature over the raw body with the merchant secret
 *
 * --- MIA instant payments — src/server/payments/mia.ts
 *   credentials : issued per bank participating in the MIA scheme; there is no shared
 *                 sandbox, so this driver cannot be written without a live agreement
 *   webhook     : POST {APP_URL}/api/payments/webhook/mia
 *   signature   : per the participating bank's specification
 *
 * The exact field names and digest algorithms change between provider API versions —
 * take them from the contract documents the provider gives you, not from memory. What
 * does not change: verify the signature over the RAW request body, treat the webhook as
 * the only source of truth for status (never the browser return URL), and make crediting
 * idempotent on the provider's external id, because every one of these providers retries.
 */

/**
 * Fails loudly and tells the developer exactly what is missing. Selecting a driver in
 * env is a statement of intent, not an implementation — this makes the gap impossible
 * to miss on the first top-up attempt instead of surfacing as a silent no-op.
 */
function notImplemented(driver: 'maib' | 'victoriabank' | 'paynet' | 'mia'): PaymentProvider {
  const message =
    `Payment provider "${driver}" is selected but not implemented. ` +
    `Add the integration in src/server/payments/${driver}.ts and supply ${driver.toUpperCase()}_* credentials.`

  return {
    name: driver,
    async createPayment() {
      throw new Error(message)
    },
    async verifyWebhook() {
      throw new Error(message)
    },
    async refund() {
      throw new Error(message)
    },
  }
}

export const payments: PaymentProvider =
  env.PAYMENT_DRIVER === 'mock' ? new MockPaymentProvider() : notImplemented(env.PAYMENT_DRIVER)

export type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookVerification,
} from '@/server/payments/types'
export { parseMockCheckoutToken, signMockWebhook } from '@/server/payments/mock'
