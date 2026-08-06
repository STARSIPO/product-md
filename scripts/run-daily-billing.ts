/**
 * Daily maintenance, runnable from a shell.
 *
 * Same work as POST /api/cron/daily-billing, without needing the app to be up — useful
 * for a host cron entry, a container `docker compose exec`, or a manual catch-up after
 * downtime.
 *
 *   npm run cron:daily
 *
 * Safe to run repeatedly on the same day: the listing charge is keyed on
 * `listing-daily:<companyId>:<YYYY-MM-DD>` in an append-only ledger with a unique index,
 * so a second run inserts nothing. Every other step is a set-based update that is
 * already a no-op once applied.
 *
 * Run under the `react-server` condition (see package.json) because the services it
 * imports are marked `server-only`.
 */
import { PrismaClient } from '@prisma/client'

async function main(): Promise<void> {
  const startedAt = Date.now()

  // Imported lazily so a configuration error surfaces as a readable message from
  // src/env.ts rather than an opaque module-load stack.
  const [{ runDailyBilling, sendExpiryWarnings }, { expireRequests }, { pruneExpiredTokens }] =
    await Promise.all([
      import('../src/server/services/billing'),
      import('../src/server/services/requests'),
      import('../src/server/auth/tokens'),
    ])

  const report = await runDailyBilling()
  const expiringWarnings = await sendExpiryWarnings()
  const expiredRequests = await expireRequests()
  const prunedTokens = await pruneExpiredTokens()

  // Session pruning is done directly: src/server/auth/session.ts imports next/headers,
  // which has no meaning outside a request. The query is the same one it runs.
  const db = new PrismaClient()
  let prunedSessions = 0
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await db.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
      },
    })
    prunedSessions = result.count
  } finally {
    await db.$disconnect()
  }

  const lines = [
    `day                 ${report.day}`,
    `billing enabled     ${report.billingEnabled ? 'yes' : 'no'}`,
    `companies charged   ${report.companiesProcessed}`,
    `skipped (trial)     ${report.companiesSkippedTrial}`,
    `listings charged    ${report.listingsCharged}`,
    `listings paused     ${report.listingsPaused}`,
    `charged total       ${(report.totalChargedBani / 100).toFixed(2)} MDL`,
    `listings expired    ${report.listingsExpired}`,
    `offers expired      ${report.offersExpired}`,
    `requests expired    ${expiredRequests}`,
    `low-balance warned  ${report.lowBalanceWarnings}`,
    `expiry warnings     ${expiringWarnings}`,
    `sessions pruned     ${prunedSessions}`,
    `tokens pruned       ${prunedTokens}`,
    `duration            ${Date.now() - startedAt} ms`,
  ]

  console.info(`\nDaily maintenance\n${'-'.repeat(38)}\n${lines.join('\n')}\n`)

  if (report.errors.length > 0) {
    console.error(`Completed with ${report.errors.length} error(s):`)
    for (const error of report.errors) console.error(`  - ${error}`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error('[cron:daily] failed', error)
  process.exit(1)
})
