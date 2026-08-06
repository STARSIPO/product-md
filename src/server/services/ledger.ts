import 'server-only'
import { db, transaction, type Tx } from '@/server/db'
import { DomainError } from '@/server/actions/result'
import type { LedgerType } from '@/lib/constants'

/**
 * Append-only balance ledger.
 *
 * `Company.balanceBani` is a *cache* of the newest `balanceAfterBani`, never an
 * independently mutated number. Both are written inside one transaction, so the two
 * can never disagree; `reconcileBalance()` proves it and is exercised by the tests.
 *
 * Every entry carries an `idempotencyKey` with a unique index. That single constraint
 * is what makes the daily charge safe: re-running the job — after a crash, a retried
 * webhook, an operator running it twice — inserts nothing the second time. The billing
 * job therefore needs no distributed lock.
 */

export interface AppendEntryInput {
  companyId: string
  /** Signed: positive credits the company, negative debits it. Always bani. */
  amountBani: number
  type: LedgerType
  idempotencyKey: string
  description?: string
  entityType?: string
  entityId?: string
  /** Reject the debit when the balance would go negative. */
  requireFunds?: boolean
}

export interface LedgerEntryResult {
  id: string
  balanceAfterBani: number
  /** True when this key had already been applied and nothing new was written. */
  deduplicated: boolean
}

async function appendWithin(tx: Tx, input: AppendEntryInput): Promise<LedgerEntryResult> {
  const existing = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, balanceAfterBani: true },
  })

  if (existing) {
    return { id: existing.id, balanceAfterBani: existing.balanceAfterBani, deduplicated: true }
  }

  const company = await tx.company.findUnique({
    where: { id: input.companyId },
    select: { balanceBani: true },
  })

  if (!company) throw new DomainError('notFound')

  const balanceBefore = company.balanceBani
  const balanceAfter = balanceBefore + input.amountBani

  if (input.requireFunds && balanceAfter < 0) {
    throw new DomainError('insufficientBalance')
  }

  const entry = await tx.ledgerEntry.create({
    data: {
      companyId: input.companyId,
      amountBani: input.amountBani,
      type: input.type,
      balanceBeforeBani: balanceBefore,
      balanceAfterBani: balanceAfter,
      description: input.description ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      idempotencyKey: input.idempotencyKey,
    },
    select: { id: true, balanceAfterBani: true },
  })

  await tx.company.update({
    where: { id: input.companyId },
    data: { balanceBani: balanceAfter },
  })

  return { id: entry.id, balanceAfterBani: entry.balanceAfterBani, deduplicated: false }
}

export function appendEntry(input: AppendEntryInput): Promise<LedgerEntryResult> {
  return transaction((tx) => appendWithin(tx, input))
}

/** For callers that already own a transaction (e.g. promotion purchase + activation). */
export function appendEntryTx(tx: Tx, input: AppendEntryInput): Promise<LedgerEntryResult> {
  return appendWithin(tx, input)
}

export async function getBalance(companyId: string): Promise<number> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { balanceBani: true },
  })
  return company?.balanceBani ?? 0
}

export interface LedgerPage {
  entries: {
    id: string
    amountBani: number
    type: string
    balanceBeforeBani: number
    balanceAfterBani: number
    description: string | null
    createdAt: Date
  }[]
  total: number
}

export async function getLedgerHistory(
  companyId: string,
  page = 1,
  pageSize = 30,
): Promise<LedgerPage> {
  const [total, entries] = await Promise.all([
    db.ledgerEntry.count({ where: { companyId } }),
    db.ledgerEntry.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        amountBani: true,
        type: true,
        balanceBeforeBani: true,
        balanceAfterBani: true,
        description: true,
        createdAt: true,
      },
    }),
  ])

  return { entries, total }
}

/**
 * Recomputes the balance from the entry history and compares it with the cached
 * value. Used by the admin "system status" page and by tests — a mismatch means a
 * write escaped the transaction boundary and is a genuine bug, not a rounding issue.
 */
export async function reconcileBalance(companyId: string): Promise<{
  cached: number
  computed: number
  consistent: boolean
}> {
  const [company, aggregate] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { balanceBani: true } }),
    db.ledgerEntry.aggregate({ where: { companyId }, _sum: { amountBani: true } }),
  ])

  const cached = company?.balanceBani ?? 0
  const computed = aggregate._sum.amountBani ?? 0

  return { cached, computed, consistent: cached === computed }
}
