import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/env'
import { safeEqual } from '@/server/crypto'
import { runDailyBilling, sendExpiryWarnings } from '@/server/services/billing'
import { expireRequests } from '@/server/services/requests'
import { pruneExpiredSessions } from '@/server/auth/session'
import { pruneExpiredTokens } from '@/server/auth/tokens'
import { reportError } from '@/server/observability'

/**
 * The nightly maintenance job, exposed as an HTTP endpoint so any scheduler can drive
 * it — Vercel Cron, a Kubernetes CronJob, or plain `curl` from crontab on a VPS.
 *
 * SAFE TO RUN TWICE. Every listing charge is written with the ledger idempotency key
 * `listing-daily:<companyId>:<YYYY-MM-DD>`, and that column is uniquely indexed, so a
 * second invocation on the same day inserts nothing and charges nobody again. A retry
 * after a timeout, an overlapping schedule or an operator pressing the button by hand
 * are all harmless; there is no lock to acquire and none to forget to release.
 *
 * POST only: a GET would be followed by link prefetchers, crawlers and monitoring
 * probes, all of which would then be running the billing job.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const provided = request.headers.get('authorization') ?? ''

  // Constant-time comparison — a byte-by-byte early exit leaks the secret to anyone
  // patient enough to measure the difference.
  if (!safeEqual(provided, `Bearer ${env.CRON_SECRET}`)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const startedAt = Date.now()

  try {
    const now = new Date()

    // Billing runs first: it decides which listings stay published, and the housekeeping
    // below reports on the state it leaves behind.
    const billing = await runDailyBilling(now)

    const [documentWarnings, requestsExpired, sessionsPruned, tokensPruned] = await Promise.all([
      sendExpiryWarnings(now),
      expireRequests(),
      pruneExpiredSessions(),
      pruneExpiredTokens(),
    ])

    return NextResponse.json(
      {
        ok: true,
        durationMs: Date.now() - startedAt,
        billing,
        housekeeping: {
          documentWarnings,
          requestsExpired,
          sessionsPruned,
          tokensPruned,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    reportError(error, { scope: 'cron-daily-billing' })
    return NextResponse.json(
      { ok: false, durationMs: Date.now() - startedAt },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
