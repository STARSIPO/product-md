import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createCategory,
  createCompany,
  createRequest,
  prisma,
  resetDatabase,
} from '../helpers/factories'
import {
  acceptOffer,
  createOffer,
  getMyOffer,
  getPublicOfferCount,
  listMyOffers,
  listOffersForBuyer,
  updateOffer,
  withdrawOffer,
} from '@/server/services/offers'
import { AuthorizationError } from '@/server/auth/guards'

/**
 * THE SEALED-BID GUARANTEE.
 *
 * Product.md's core promise to suppliers is that a competitor cannot see their price,
 * terms or attachments. If that leaks, suppliers pad their quotes and the marketplace
 * stops working. This file is the executable statement of that rule — it is required
 * by the specification and should be treated as a change-detector: if a future read
 * path returns offers without scoping them to a viewer, one of these fails.
 */
describe('sealed offer privacy', () => {
  let buyerCompanyId: string
  let buyerUserId: string
  let sellerAId: string
  let sellerBId: string
  let requestId: string
  let offerAId: string
  let offerBId: string

  beforeEach(async () => {
    await resetDatabase()

    const category = await createCategory()
    const buyer = await createCompany({ isBuyer: true, name: 'Restaurant Nistru' })
    const sellerA = await createCompany({ isSeller: true, name: 'Carne Balti' })
    const sellerB = await createCompany({ isSeller: true, name: 'Agro Prim' })

    buyerCompanyId = buyer.company.id
    buyerUserId = buyer.user.id
    sellerAId = sellerA.company.id
    sellerBId = sellerB.company.id

    const request = await createRequest(buyerCompanyId, category.id)
    requestId = request.id

    // Two competing bids on the same request, with clearly different prices.
    const a = await createOffer(sellerAId, {
      requestId,
      priceBani: 9500,
      quantity: 20,
      unit: 'KG',
      deliveryPriceBani: 5000,
      comment: 'Секретные условия поставщика A',
    })
    const b = await createOffer(sellerBId, {
      requestId,
      priceBani: 8800,
      quantity: 20,
      unit: 'KG',
      deliveryPriceBani: 0,
      comment: 'Секретные условия поставщика B',
    })

    offerAId = a.id
    offerBId = b.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('lets a seller read its own offer', async () => {
    const own = await getMyOffer(requestId, sellerAId)

    expect(own).not.toBeNull()
    expect(own?.id).toBe(offerAId)
    expect(own?.priceBani).toBe(9500)
    expect(own?.comment).toBe('Секретные условия поставщика A')
  })

  it("never returns a competitor's offer to a seller", async () => {
    // Seller B asks for the offer on this request, scoped to itself: it must get its
    // own row, never seller A's, even though both exist for the same request.
    const asSellerB = await getMyOffer(requestId, sellerBId)

    expect(asSellerB?.id).toBe(offerBId)
    expect(asSellerB?.id).not.toBe(offerAId)
    expect(asSellerB?.priceBani).toBe(8800)
    expect(asSellerB?.comment).not.toContain('поставщика A')
  })

  it('scopes the seller offer list to the seller company', async () => {
    const { items, total } = await listMyOffers(sellerAId)

    expect(total).toBe(1)
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe(offerAId)

    const serialized = JSON.stringify(items)
    expect(serialized).not.toContain('поставщика B')
    expect(serialized).not.toContain('8800')
  })

  it('refuses to list offers for a company that does not own the request', async () => {
    await expect(listOffersForBuyer(requestId, sellerAId)).rejects.toBeInstanceOf(
      AuthorizationError,
    )
    await expect(listOffersForBuyer(requestId, sellerBId)).rejects.toBeInstanceOf(
      AuthorizationError,
    )
  })

  it('gives the request owner every offer for comparison', async () => {
    const offers = await listOffersForBuyer(requestId, buyerCompanyId)

    expect(offers).toHaveLength(2)
    expect(offers.map((offer) => offer.id).sort()).toEqual([offerAId, offerBId].sort())
    // Cheapest first — the comparison table depends on this ordering.
    expect(offers[0]?.totalBani).toBeLessThanOrEqual(offers[1]?.totalBani ?? 0)
  })

  it('exposes only a count publicly', async () => {
    const count = await getPublicOfferCount(requestId)
    expect(count).toBe(2)
    expect(typeof count).toBe('number')
  })

  it('will not let a seller edit or withdraw a competitor offer', async () => {
    await expect(
      updateOffer(offerBId, sellerAId, {
        priceBani: 1,
        quantity: 1,
        unit: 'KG',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError)

    await expect(withdrawOffer(offerBId, sellerAId)).rejects.toBeInstanceOf(AuthorizationError)

    // Seller B's offer is untouched.
    const untouched = await getMyOffer(requestId, sellerBId)
    expect(untouched?.priceBani).toBe(8800)
    expect(untouched?.status).toBe('SENT')
  })

  it('will not let a non-owner accept an offer', async () => {
    await expect(acceptOffer(offerAId, sellerBId, buyerUserId)).rejects.toBeInstanceOf(
      AuthorizationError,
    )
  })

  it('rejects a second offer from the same seller on one request', async () => {
    await expect(
      createOffer(sellerAId, { requestId, priceBani: 9000, quantity: 20, unit: 'KG' }),
    ).rejects.toMatchObject({ key: 'offerExists' })
  })

  it('rejects an offer on your own request', async () => {
    await expect(
      createOffer(buyerCompanyId, { requestId, priceBani: 9000, quantity: 20, unit: 'KG' }),
    ).rejects.toMatchObject({ key: 'ownRequest' })
  })

  it('rejects an offer once the deadline has passed', async () => {
    const category = await createCategory('Овощи')
    const buyer = await createCompany({ isBuyer: true })
    const closed = await createRequest(buyer.company.id, category.id, {
      offersDeadlineAt: new Date(Date.now() - 60_000),
    })

    await expect(
      createOffer(sellerAId, { requestId: closed.id, priceBani: 800, quantity: 500, unit: 'KG' }),
    ).rejects.toMatchObject({ key: 'offerClosed' })
  })

  it('accepting one offer rejects the others and creates a single deal', async () => {
    const { dealId } = await acceptOffer(offerBId, buyerCompanyId, buyerUserId)

    const [winner, loser, deals, request] = await Promise.all([
      prisma.offer.findUnique({ where: { id: offerBId } }),
      prisma.offer.findUnique({ where: { id: offerAId } }),
      prisma.deal.findMany({ where: { requestId } }),
      prisma.purchaseRequest.findUnique({ where: { id: requestId } }),
    ])

    expect(winner?.status).toBe('ACCEPTED')
    expect(loser?.status).toBe('REJECTED')
    expect(deals).toHaveLength(1)
    expect(deals[0]?.id).toBe(dealId)
    expect(request?.status).toBe('SUPPLIER_SELECTED')

    // A second acceptance must not create a second deal.
    await expect(acceptOffer(offerAId, buyerCompanyId, buyerUserId)).rejects.toMatchObject({
      key: 'offerClosed',
    })
    expect(await prisma.deal.count({ where: { requestId } })).toBe(1)
  })
})
