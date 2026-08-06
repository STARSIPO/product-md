import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createCategory, createCompany, createProduct, prisma, resetDatabase } from '../helpers/factories'
import { appendEntry, getBalance, reconcileBalance } from '@/server/services/ledger'
import { runDailyBilling, resumeListingsAfterTopUp } from '@/server/services/billing'
import { invalidateFeatureFlags } from '@/server/services/feature-flags'
import { chisinauDayKey } from '@/lib/utils'

/**
 * Money rules.
 *
 * Two properties matter more than any feature here: the daily charge must never be
 * applied twice, and the cached `Company.balanceBani` must always equal the sum of the
 * ledger. Both are asserted directly rather than inferred from UI behaviour.
 */
describe('ledger', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('keeps the cached balance equal to the sum of entries', async () => {
    const { company } = await createCompany({ isSeller: true })

    await appendEntry({
      companyId: company.id,
      amountBani: 30_000,
      type: 'TOP_UP',
      idempotencyKey: 'topup-1',
    })
    await appendEntry({
      companyId: company.id,
      amountBani: -1_200,
      type: 'PROMOTION',
      idempotencyKey: 'promo-1',
    })

    expect(await getBalance(company.id)).toBe(28_800)

    const reconciliation = await reconcileBalance(company.id)
    expect(reconciliation.consistent).toBe(true)
    expect(reconciliation.computed).toBe(28_800)
  })

  it('records before/after on every entry', async () => {
    const { company } = await createCompany({ isSeller: true })

    await appendEntry({
      companyId: company.id,
      amountBani: 9_000,
      type: 'TOP_UP',
      idempotencyKey: 'topup-a',
    })
    await appendEntry({
      companyId: company.id,
      amountBani: -100,
      type: 'LISTING_DAILY',
      idempotencyKey: 'charge-a',
    })

    const entries = await prisma.ledgerEntry.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'asc' },
    })

    expect(entries[0]?.balanceBeforeBani).toBe(0)
    expect(entries[0]?.balanceAfterBani).toBe(9_000)
    expect(entries[1]?.balanceBeforeBani).toBe(9_000)
    expect(entries[1]?.balanceAfterBani).toBe(8_900)
  })

  it('applies an idempotency key exactly once', async () => {
    const { company } = await createCompany({ isSeller: true })

    const first = await appendEntry({
      companyId: company.id,
      amountBani: 18_000,
      type: 'TOP_UP',
      idempotencyKey: 'payment:abc123',
    })
    const replay = await appendEntry({
      companyId: company.id,
      amountBani: 18_000,
      type: 'TOP_UP',
      idempotencyKey: 'payment:abc123',
    })

    expect(first.deduplicated).toBe(false)
    expect(replay.deduplicated).toBe(true)
    expect(replay.balanceAfterBani).toBe(first.balanceAfterBani)
    expect(await getBalance(company.id)).toBe(18_000)
    expect(await prisma.ledgerEntry.count({ where: { companyId: company.id } })).toBe(1)
  })

  it('refuses a debit that would overdraw when funds are required', async () => {
    const { company } = await createCompany({ isSeller: true, balanceBani: 500 })

    await expect(
      appendEntry({
        companyId: company.id,
        amountBani: -1_000,
        type: 'PROMOTION',
        idempotencyKey: 'promo-overdraw',
        requireFunds: true,
      }),
    ).rejects.toMatchObject({ key: 'insufficientBalance' })

    expect(await getBalance(company.id)).toBe(500)
  })
})

describe('daily billing', () => {
  beforeEach(async () => {
    await resetDatabase()
    await prisma.featureFlag.create({ data: { key: 'BILLING_ENABLED', enabled: true } })
    await prisma.tariff.create({ data: { key: 'LISTING_DAILY', priceBani: 100, unit: 'DAY' } })
    // Flags are cached for 30s in-process; production invalidates via setFlag().
    invalidateFeatureFlags()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('charges one MDL per active listing per day', async () => {
    const category = await createCategory()
    const { company } = await createCompany({ isSeller: true, balanceBani: 10_000 })

    await createProduct(company.id, category.id, { title: 'Товар 1' })
    await createProduct(company.id, category.id, { title: 'Товар 2' })
    await createProduct(company.id, category.id, { title: 'Черновик', status: 'DRAFT' })

    const report = await runDailyBilling()

    // Only the two ACTIVE listings are billable.
    expect(report.listingsCharged).toBe(2)
    expect(report.totalChargedBani).toBe(200)
    expect(await getBalance(company.id)).toBe(9_800)
  })

  it('is idempotent across repeated runs on the same day', async () => {
    const category = await createCategory()
    const { company } = await createCompany({ isSeller: true, balanceBani: 10_000 })
    await createProduct(company.id, category.id)

    const now = new Date()
    await runDailyBilling(now)
    await runDailyBilling(now)
    await runDailyBilling(now)

    expect(await getBalance(company.id)).toBe(9_900)

    const charges = await prisma.ledgerEntry.findMany({
      where: { companyId: company.id, type: 'LISTING_DAILY' },
    })
    expect(charges).toHaveLength(1)
    expect(charges[0]?.idempotencyKey).toBe(`listing-daily:${company.id}:${chisinauDayKey(now)}`)
  })

  it('pauses only the listings the balance cannot cover', async () => {
    const category = await createCategory()
    // 250 bani covers 2 of 4 listings at 100 bani each.
    const { company } = await createCompany({ isSeller: true, balanceBani: 250 })

    for (let index = 0; index < 4; index += 1) {
      await createProduct(company.id, category.id, { title: `Товар ${index}` })
    }

    const report = await runDailyBilling()

    expect(report.listingsCharged).toBe(2)
    expect(report.listingsPaused).toBe(2)
    expect(await getBalance(company.id)).toBe(50)

    const paused = await prisma.product.count({
      where: { companyId: company.id, status: 'PAUSED', pausedForBalance: true },
    })
    expect(paused).toBe(2)
    expect(await prisma.product.count({ where: { companyId: company.id, status: 'ACTIVE' } })).toBe(2)
  })

  it('resumes balance-paused listings after a top-up', async () => {
    const category = await createCategory()
    const { company } = await createCompany({ isSeller: true, balanceBani: 0 })

    await createProduct(company.id, category.id, { title: 'A' })
    await createProduct(company.id, category.id, { title: 'B' })

    await runDailyBilling()
    expect(await prisma.product.count({ where: { companyId: company.id, status: 'ACTIVE' } })).toBe(0)

    await appendEntry({
      companyId: company.id,
      amountBani: 3_000,
      type: 'TOP_UP',
      idempotencyKey: 'topup-resume',
    })
    const resumed = await resumeListingsAfterTopUp(company.id)

    expect(resumed).toBe(2)
    expect(await prisma.product.count({ where: { companyId: company.id, status: 'ACTIVE' } })).toBe(2)
  })

  it('charges nothing while the billing flag is off', async () => {
    await prisma.featureFlag.update({
      where: { key: 'BILLING_ENABLED' },
      data: { enabled: false },
    })
    invalidateFeatureFlags()

    const category = await createCategory()
    const { company } = await createCompany({ isSeller: true, balanceBani: 10_000 })
    await createProduct(company.id, category.id)

    const report = await runDailyBilling()

    expect(report.billingEnabled).toBe(false)
    expect(report.totalChargedBani).toBe(0)
    expect(await getBalance(company.id)).toBe(10_000)
  })

  it('skips a company that is still inside its free trial', async () => {
    const category = await createCategory()
    const { company } = await createCompany({ isSeller: true, balanceBani: 10_000 })
    await prisma.company.update({
      where: { id: company.id },
      data: { trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    })
    await createProduct(company.id, category.id)

    const report = await runDailyBilling()

    expect(report.companiesSkippedTrial).toBe(1)
    expect(await getBalance(company.id)).toBe(10_000)
  })
})
