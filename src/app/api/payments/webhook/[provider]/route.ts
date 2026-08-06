import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/server/db'
import { hashToken } from '@/server/crypto'
import { payments } from '@/server/payments'
import { appendEntry } from '@/server/services/ledger'
import { resumeListingsAfterTopUp } from '@/server/services/billing'
import { logEvent, reportError } from '@/server/observability'

/**
 * Inbound payment callbacks.
 *
 * This route is the *only* thing that credits a balance. The browser return URL is
 * decoration: it can be typed by hand, so it is never treated as evidence that money
 * arrived.
 *
 * Every provider retries — on a timeout, a 500, a slow response, or just because. So
 * "delivered twice" is the normal case, not the edge case, and this handler is
 * idempotent at three independent layers:
 *
 *   1. `WebhookEvent[provider, externalId]` is unique and is written *before* any
 *      processing. A replay loses the insert race and returns 200 without ever
 *      reaching the ledger.
 *   2. `appendEntry` is keyed on `topup:<paymentId>`, and `LedgerEntry.idempotencyKey`
 *      is unique. Even if the event row were deleted, the second credit writes nothing.
 *   3. A Payment already marked SUCCEEDED short-circuits before either of those.
 *
 * Layer 1 alone would be enough on a good day; layers 2 and 3 are what make it true on
 * a bad one. See tests around the ledger for the invariant they protect.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Providers differ on the header name; none of them agree, so all are accepted. */
const SIGNATURE_HEADERS = [
  'x-mock-signature',
  'x-payment-signature',
  'x-signature',
  'signature',
]

function readSignature(request: NextRequest): string | null {
  for (const header of SIGNATURE_HEADERS) {
    const value = request.headers.get(header)
    if (value) return value
  }
  return null
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } },
) {
  const provider = params.provider

  // A callback for a driver this deployment is not running is not ours to process.
  if (provider !== payments.name) {
    return NextResponse.json({ error: 'unknownProvider' }, { status: 404 })
  }

  // Read the RAW body once. Re-serialising JSON before verifying would change the
  // bytes the signature was computed over, and every signature would fail.
  const rawBody = await request.text()
  const signature = readSignature(request)

  // Verification is a pure computation — no writes, no side effects — so running it
  // first does not violate "persist before processing"; it only tells us which id the
  // event should be filed under.
  const verification = await payments.verifyWebhook(rawBody, signature).catch(() => null)

  // An unauthenticated callback still gets a row, keyed on a hash of its own body, so
  // a flood of garbage cannot grow the table without bound and the payload survives
  // for inspection.
  const externalId =
    verification && verification.externalId
      ? verification.externalId
      : `unverified:${hashToken(rawBody).slice(0, 32)}`

  let eventId: string
  try {
    const event = await db.webhookEvent.create({
      data: {
        provider,
        externalId,
        payload: rawBody,
        signatureValid: verification?.valid ?? false,
      },
      select: { id: true },
    })
    eventId = event.id
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Already seen. Answer 200 so the provider stops retrying, and touch nothing.
      logEvent('payment.webhook.replay', { provider, externalId })
      return NextResponse.json({ ok: true, duplicate: true })
    }
    reportError(error, { scope: 'payment-webhook', provider })
    return NextResponse.json({ error: 'generic' }, { status: 500 })
  }

  if (!verification || !verification.valid) {
    await db.webhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), error: 'signatureInvalid' },
    })
    logEvent('payment.webhook.rejected', { provider, externalId })
    return NextResponse.json({ error: 'signatureInvalid' }, { status: 400 })
  }

  try {
    const outcome = await process(verification.paymentId, verification.status, verification.amountBani)
    await db.webhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), error: outcome.error ?? null },
    })
    return NextResponse.json({ ok: true, ...outcome })
  } catch (error) {
    reportError(error, { scope: 'payment-webhook', provider, externalId })
    await db.webhookEvent.update({
      where: { id: eventId },
      data: { error: error instanceof Error ? error.message.slice(0, 500) : 'unknown' },
    })
    // Left unprocessed on purpose: a 500 invites the provider to retry, and the retry
    // is safe.
    return NextResponse.json({ error: 'generic' }, { status: 500 })
  }
}

interface ProcessOutcome {
  credited?: boolean
  error?: string
}

async function process(
  paymentId: string | null,
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'REFUNDED',
  amountBani: number | null,
): Promise<ProcessOutcome> {
  if (!paymentId) return { error: 'paymentMissing' }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, companyId: true, amountBani: true, status: true },
  })

  // Nothing to attach the money to. 200 with a recorded error rather than a retry
  // loop over a payment that will never exist.
  if (!payment) return { error: 'paymentNotFound' }

  if (payment.status === 'SUCCEEDED') return { credited: false, error: undefined }

  if (status !== 'SUCCEEDED') {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: status === 'REFUNDED' ? 'REFUNDED' : status === 'PENDING' ? 'PENDING' : 'FAILED',
        ...(status === 'FAILED' ? { failureCode: 'provider_declined' } : {}),
      },
    })
    return { credited: false }
  }

  // The amount is ours, not the callback's — but a callback claiming a different one
  // is a mismatch worth refusing rather than quietly reconciling.
  if (amountBani !== null && amountBani !== payment.amountBani) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureCode: 'amount_mismatch' },
    })
    return { credited: false, error: 'amountMismatch' }
  }

  const entry = await appendEntry({
    companyId: payment.companyId,
    amountBani: payment.amountBani,
    type: 'TOP_UP',
    // Derived from the payment, so the same payment can only ever credit once.
    idempotencyKey: `topup:${payment.id}`,
    description: 'payment',
    entityType: 'PAYMENT',
    entityId: payment.id,
  })

  await db.payment.update({
    where: { id: payment.id },
    data: { status: 'SUCCEEDED', completedAt: new Date() },
  })

  // A seller who has paid should not have to re-publish by hand.
  const resumed = await resumeListingsAfterTopUp(payment.companyId)

  logEvent('payment.credited', {
    paymentId: payment.id,
    amountBani: payment.amountBani,
    deduplicated: entry.deduplicated,
    listingsResumed: resumed,
  })

  return { credited: !entry.deduplicated }
}
