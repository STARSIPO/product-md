import 'server-only'
import { db, transaction } from '@/server/db'
import { env } from '@/env'
import { chisinauDayKey } from '@/lib/utils'
import { DEFAULT_TARIFFS } from '@/lib/constants'
import { appendEntryTx } from './ledger'
import { isEnabled } from './feature-flags'
import { notifyCompany } from './notifications'
import { expireStaleOffers } from './offers'
import { reportError } from '@/server/observability'

/**
 * Daily listing billing.
 *
 * The business rule is "1 MDL per active listing per day", charged against a prepaid
 * internal balance — explicitly NOT a card transaction per day. This job is the only
 * thing that debits for listings.
 *
 * Idempotency is structural, not defensive: the ledger entry key is
 * `listing-daily:<companyId>:<YYYY-MM-DD>` and that column is uniquely indexed, so
 * running the job twice on the same day is a no-op. There is no lock to forget.
 *
 * Partial affordability is handled rather than all-or-nothing: a company that can pay
 * for 12 of its 20 listings keeps 12 running and has the other 8 paused, instead of
 * losing everything over a 4 MDL shortfall. Paused-for-balance listings come back
 * automatically on top-up.
 */

export interface BillingReport {
  day: string
  billingEnabled: boolean
  companiesProcessed: number
  companiesSkippedTrial: number
  totalChargedBani: number
  listingsCharged: number
  listingsPaused: number
  listingsResumed: number
  listingsExpired: number
  offersExpired: number
  lowBalanceWarnings: number
  errors: string[]
}

async function getListingDailyPriceBani(): Promise<number> {
  const tariff = await db.tariff.findUnique({ where: { key: 'LISTING_DAILY' } })
  if (tariff?.isActive) return tariff.priceBani
  return env.LISTING_DAILY_PRICE_BANI || DEFAULT_TARIFFS.LISTING_DAILY?.priceBani || 100
}

export async function runDailyBilling(now: Date = new Date()): Promise<BillingReport> {
  const day = chisinauDayKey(now)
  const billingEnabled = await isEnabled('BILLING_ENABLED')

  const report: BillingReport = {
    day,
    billingEnabled,
    companiesProcessed: 0,
    companiesSkippedTrial: 0,
    totalChargedBani: 0,
    listingsCharged: 0,
    listingsPaused: 0,
    listingsResumed: 0,
    listingsExpired: 0,
    offersExpired: 0,
    lowBalanceWarnings: 0,
    errors: [],
  }

  // Housekeeping runs whether or not billing is on.
  report.listingsExpired = await expireListings(now)
  report.offersExpired = await expireStaleOffers()

  if (!billingEnabled) return report

  const priceBani = await getListingDailyPriceBani()
  if (priceBani <= 0) return report

  const companies = await db.company.findMany({
    where: {
      status: 'ACTIVE',
      isSeller: true,
      products: { some: { status: 'ACTIVE', deletedAt: null } },
    },
    select: { id: true, displayName: true, balanceBani: true, trialEndsAt: true },
  })

  for (const company of companies) {
    try {
      if (company.trialEndsAt && company.trialEndsAt.getTime() > now.getTime()) {
        report.companiesSkippedTrial += 1
        continue
      }

      const result = await chargeCompany(company.id, priceBani, day)

      report.companiesProcessed += 1
      report.totalChargedBani += result.chargedBani
      report.listingsCharged += result.listingsCharged
      report.listingsPaused += result.listingsPaused

      const needsWarning =
        result.listingsPaused > 0 || result.balanceAfterBani < env.LOW_BALANCE_THRESHOLD_BANI

      if (needsWarning) {
        await notifyCompany(company.id, {
          type: 'LOW_BALANCE',
          params: {
            amount: String(result.balanceAfterBani),
            days: String(Math.floor(result.balanceAfterBani / Math.max(1, result.dailyCostBani))),
          },
          entityType: 'COMPANY',
          entityId: company.id,
          email: {
            template: 'lowBalance',
            params: {
              balanceBani: result.balanceAfterBani,
              dailyCostBani: result.dailyCostBani,
              url: `${env.APP_URL}/dashboard/balance`,
            },
          },
        })
        report.lowBalanceWarnings += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      report.errors.push(`${company.id}: ${message}`)
      reportError(error, { scope: 'daily-billing', companyId: company.id })
    }
  }

  return report
}

interface ChargeResult {
  chargedBani: number
  listingsCharged: number
  listingsPaused: number
  balanceAfterBani: number
  dailyCostBani: number
}

async function chargeCompany(
  companyId: string,
  priceBani: number,
  day: string,
): Promise<ChargeResult> {
  return transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { balanceBani: true },
    })
    if (!company) {
      return {
        chargedBani: 0,
        listingsCharged: 0,
        listingsPaused: 0,
        balanceAfterBani: 0,
        dailyCostBani: 0,
      }
    }

    const active = await tx.product.findMany({
      where: { companyId, status: 'ACTIVE', deletedAt: null },
      // Newest listings are the ones a seller is most likely to care about, so the
      // oldest are paused first when funds are short.
      orderBy: [{ bumpedAt: 'desc' }, { publishedAt: 'desc' }],
      select: { id: true },
    })

    if (active.length === 0) {
      return {
        chargedBani: 0,
        listingsCharged: 0,
        listingsPaused: 0,
        balanceAfterBani: company.balanceBani,
        dailyCostBani: 0,
      }
    }

    const dailyCostBani = active.length * priceBani
    const affordableCount = Math.min(active.length, Math.floor(company.balanceBani / priceBani))
    const chargedBani = affordableCount * priceBani

    let balanceAfterBani = company.balanceBani

    if (chargedBani > 0) {
      const entry = await appendEntryTx(tx, {
        companyId,
        amountBani: -chargedBani,
        type: 'LISTING_DAILY',
        idempotencyKey: `listing-daily:${companyId}:${day}`,
        description: `${affordableCount} × ${priceBani}`,
        entityType: 'COMPANY',
        entityId: companyId,
      })

      // Already applied today — leave listings alone and report nothing new.
      if (entry.deduplicated) {
        return {
          chargedBani: 0,
          listingsCharged: 0,
          listingsPaused: 0,
          balanceAfterBani: entry.balanceAfterBani,
          dailyCostBani,
        }
      }

      balanceAfterBani = entry.balanceAfterBani
    }

    const toPause = active.slice(affordableCount).map((product) => product.id)

    if (toPause.length > 0) {
      await tx.product.updateMany({
        where: { id: { in: toPause } },
        data: { status: 'PAUSED', pausedForBalance: true },
      })
    }

    return {
      chargedBani,
      listingsCharged: affordableCount,
      listingsPaused: toPause.length,
      balanceAfterBani,
      dailyCostBani,
    }
  })
}

/**
 * Brings back listings that were paused only because the balance ran out.
 * Called after every successful top-up — a seller who pays should not have to
 * re-publish by hand.
 */
export async function resumeListingsAfterTopUp(companyId: string): Promise<number> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { balanceBani: true },
  })
  if (!company || company.balanceBani <= 0) return 0

  const priceBani = await getListingDailyPriceBani()
  const affordable = priceBani > 0 ? Math.floor(company.balanceBani / priceBani) : Number.MAX_SAFE_INTEGER

  const paused = await db.product.findMany({
    where: { companyId, status: 'PAUSED', pausedForBalance: true, deletedAt: null },
    orderBy: [{ bumpedAt: 'desc' }, { publishedAt: 'desc' }],
    take: Math.max(0, affordable),
    select: { id: true },
  })

  if (paused.length === 0) return 0

  const result = await db.product.updateMany({
    where: { id: { in: paused.map((product) => product.id) } },
    data: { status: 'ACTIVE', pausedForBalance: false },
  })

  return result.count
}

/** Moves listings past their expiry date out of the catalogue. */
async function expireListings(now: Date): Promise<number> {
  const result = await db.product.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now }, deletedAt: null },
    data: { status: 'EXPIRED' },
  })
  return result.count
}

/**
 * How long the current balance lasts at today's burn rate.
 * Drives the "хватит на N дней" hint on the balance screen.
 */
export async function estimateRemainingDays(companyId: string): Promise<number | null> {
  if (!(await isEnabled('BILLING_ENABLED'))) return null

  const [company, activeCount, priceBani] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { balanceBani: true } }),
    db.product.count({ where: { companyId, status: 'ACTIVE', deletedAt: null } }),
    getListingDailyPriceBani(),
  ])

  if (!company || activeCount === 0 || priceBani <= 0) return null
  return Math.floor(company.balanceBani / (activeCount * priceBani))
}

/** Warns about listings and documents that are about to lapse. Part of the daily job. */
export async function sendExpiryWarnings(now: Date = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  let sent = 0

  const documents = await db.document.findMany({
    where: {
      status: 'APPROVED',
      expiresAt: { gte: now, lte: soon },
      expiryNotifiedAt: null,
    },
    select: { id: true, companyId: true, type: true, expiresAt: true },
  })

  for (const document of documents) {
    await notifyCompany(document.companyId, {
      type: 'DOCUMENT_EXPIRING',
      params: {
        document: document.type,
        date: document.expiresAt ? chisinauDayKey(document.expiresAt) : '',
      },
      entityType: 'DOCUMENT',
      entityId: document.id,
    })
    await db.document.update({
      where: { id: document.id },
      data: { expiryNotifiedAt: now },
    })
    sent += 1
  }

  return sent
}
