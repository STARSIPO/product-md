import 'server-only'
import { db } from '@/server/db'

/**
 * Queries shared by several admin screens.
 *
 * Colocated under `_lib` rather than in `src/server/services`: none of this is domain
 * logic the rest of the product needs, it exists so the overview page and the balances
 * page cannot drift apart on what "the balance does not add up" means. The underscore
 * keeps the folder out of the router.
 */

export interface BalanceMismatch {
  companyId: string
  displayName: string
  /** `Company.balanceBani` — the cached value the app reads on every page. */
  cached: number
  /** The sum of the company's ledger entries, which is the truth. */
  computed: number
}

/**
 * Companies whose cached balance disagrees with their ledger.
 *
 * `Company.balanceBani` is a cache of the newest `balanceAfterBani` and is only ever
 * written inside the transaction that appends an entry, so a difference here is not
 * drift — it means a write escaped that boundary, which is a bug worth waking up for.
 *
 * Two queries regardless of how many companies exist: one grouped sum, one lookup of
 * the cached values. The per-company `reconcileBalance()` is the right tool for a single
 * company; running it in a loop is not the right tool for a dashboard.
 */
export async function findBalanceMismatches(): Promise<BalanceMismatch[]> {
  const sums = await db.ledgerEntry.groupBy({
    by: ['companyId'],
    _sum: { amountBani: true },
  })

  if (sums.length === 0) return []

  const companies = await db.company.findMany({
    where: { id: { in: sums.map((row) => row.companyId) } },
    select: { id: true, displayName: true, balanceBani: true },
  })

  const byId = new Map(companies.map((company) => [company.id, company]))

  const mismatches: BalanceMismatch[] = []
  for (const row of sums) {
    const company = byId.get(row.companyId)
    if (!company) continue
    const computed = row._sum.amountBani ?? 0
    if (company.balanceBani === computed) continue
    mismatches.push({
      companyId: company.id,
      displayName: company.displayName,
      cached: company.balanceBani,
      computed,
    })
  }

  return mismatches
}

/**
 * A payment is "stuck" once it has been PENDING longer than a checkout could plausibly
 * take. Anything younger is a customer still on the provider's page, not an incident.
 */
export const STUCK_PAYMENT_MINUTES = 30

export function stuckPaymentsWhere() {
  return {
    status: 'PENDING',
    createdAt: { lt: new Date(Date.now() - STUCK_PAYMENT_MINUTES * 60_000) },
  }
}
