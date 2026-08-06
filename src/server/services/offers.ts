import 'server-only'
import { db, transaction } from '@/server/db'
import { env } from '@/env'
import { DomainError } from '@/server/actions/result'
import { AuthorizationError } from '@/server/auth/guards'
import { lineTotalBani } from '@/lib/money'
import { REQUEST_OPEN_STATUSES } from '@/lib/constants'
import type { OfferInput } from '@/lib/validation'
import { notifyCompany } from './notifications'
import { createDealFromOffer } from './deals'

/**
 * Sealed commercial offers.
 *
 * THE INVARIANT: a supplier may read exactly one offer per request — its own. The
 * buyer who owns the request reads all of them. Nobody else reads any of them, ever,
 * including on the public request page, which is limited to `offersCount`.
 *
 * This is the product's core promise: suppliers only bid honestly if they are certain
 * competitors cannot see their price. Every read below therefore takes the caller's
 * company id as a *required* argument and filters on it in the database query — not
 * after fetching, and never with a caller-supplied "isOwner" flag.
 *
 * Guarded by tests/integration/offer-privacy.test.ts. Do not add a read path that
 * returns offers without scoping them to a viewer.
 */

/** Fields a seller is allowed to see on its own offer. */
const SELLER_OFFER_SELECT = {
  id: true,
  requestId: true,
  priceBani: true,
  quantity: true,
  unit: true,
  deliveryPriceBani: true,
  totalBani: true,
  currency: true,
  deliveryAt: true,
  deliveryDays: true,
  paymentMethod: true,
  validUntil: true,
  regularity: true,
  comment: true,
  attachmentKey: true,
  attachmentName: true,
  alternativeProductId: true,
  status: true,
  viewedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

/** What the buyer sees, plus the supplier context needed to compare offers. */
const BUYER_OFFER_SELECT = {
  ...SELLER_OFFER_SELECT,
  sellerCompanyId: true,
  sellerCompany: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      ratingAvg: true,
      ratingCount: true,
      dealsCompleted: true,
      avgResponseMinutes: true,
      district: { select: { id: true, nameRu: true, nameRo: true } },
      locality: { select: { id: true, nameRu: true, nameRo: true, latitude: true, longitude: true } },
      badges: { where: { status: 'APPROVED' }, select: { type: true } },
    },
  },
  alternativeProduct: { select: { id: true, slug: true, title: true } },
} as const

export type SellerOffer = Awaited<ReturnType<typeof getMyOffer>>
export type BuyerOffer = Awaited<ReturnType<typeof listOffersForBuyer>>[number]

// --- writes ------------------------------------------------------------------

export async function createOffer(
  sellerCompanyId: string,
  input: OfferInput,
): Promise<{ id: string }> {
  const request = await db.purchaseRequest.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      slug: true,
      title: true,
      companyId: true,
      status: true,
      visibility: true,
      verifiedOnly: true,
      offersDeadlineAt: true,
      deletedAt: true,
    },
  })

  if (!request || request.deletedAt) throw new DomainError('notFound')
  if (request.companyId === sellerCompanyId) throw new DomainError('ownRequest')
  if (!REQUEST_OPEN_STATUSES.includes(request.status as never)) throw new DomainError('offerClosed')
  if (request.offersDeadlineAt && request.offersDeadlineAt.getTime() < Date.now()) {
    throw new DomainError('offerClosed')
  }

  if (request.verifiedOnly) {
    const verified = await db.verificationBadge.findFirst({
      where: {
        companyId: sellerCompanyId,
        type: { in: ['TRUSTED_SUPPLIER', 'DOCUMENTS', 'COMPANY'] },
        status: 'APPROVED',
      },
      select: { id: true },
    })
    if (!verified) throw new DomainError('forbidden')
  }

  const duplicate = await db.offer.findUnique({
    where: { requestId_sellerCompanyId: { requestId: request.id, sellerCompanyId } },
    select: { id: true },
  })
  if (duplicate) throw new DomainError('offerExists')

  const totalBani = lineTotalBani(input.quantity, input.priceBani) + (input.deliveryPriceBani ?? 0)

  const offer = await transaction(async (tx) => {
    const created = await tx.offer.create({
      data: {
        requestId: request.id,
        sellerCompanyId,
        priceBani: input.priceBani,
        quantity: input.quantity,
        unit: input.unit,
        deliveryPriceBani: input.deliveryPriceBani ?? 0,
        totalBani,
        deliveryAt: input.deliveryAt ?? null,
        deliveryDays: input.deliveryDays ?? null,
        paymentMethod: input.paymentMethod ?? null,
        validUntil: input.validUntil ?? null,
        regularity: input.regularity ?? null,
        comment: input.comment ?? null,
        alternativeProductId: input.alternativeProductId ?? null,
        status: 'SENT',
      },
      select: { id: true },
    })

    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: {
        offersCount: { increment: 1 },
        // First offer moves the request out of plain ACTIVE so the buyer sees activity.
        ...(request.status === 'ACTIVE' ? { status: 'RECEIVING_OFFERS' } : {}),
      },
    })

    return created
  })

  const seller = await db.company.findUnique({
    where: { id: sellerCompanyId },
    select: { displayName: true },
  })

  await notifyCompany(request.companyId, {
    type: 'NEW_OFFER',
    params: { supplier: seller?.displayName ?? '', request: request.title },
    entityType: 'REQUEST',
    entityId: request.id,
    // Locale-less path: the middleware redirects it to whichever language the
    // recipient browses in, so one URL works for both.
    email: {
      template: 'newOffer',
      params: {
        requestTitle: request.title,
        supplierName: seller?.displayName ?? '',
        totalBani,
        url: `${env.APP_URL}/requests/${request.slug}/offers`,
      },
    },
  })

  return offer
}

export async function updateOffer(
  offerId: string,
  sellerCompanyId: string,
  input: Omit<OfferInput, 'requestId'>,
): Promise<void> {
  // Scoped update: a wrong company id simply matches no rows.
  const offer = await db.offer.findFirst({
    where: { id: offerId, sellerCompanyId },
    select: { id: true, status: true },
  })

  if (!offer) throw new AuthorizationError('notFound')
  if (offer.status === 'ACCEPTED' || offer.status === 'WITHDRAWN') {
    throw new DomainError('offerClosed')
  }

  const totalBani = lineTotalBani(input.quantity, input.priceBani) + (input.deliveryPriceBani ?? 0)

  await db.offer.update({
    where: { id: offer.id },
    data: {
      priceBani: input.priceBani,
      quantity: input.quantity,
      unit: input.unit,
      deliveryPriceBani: input.deliveryPriceBani ?? 0,
      totalBani,
      deliveryAt: input.deliveryAt ?? null,
      deliveryDays: input.deliveryDays ?? null,
      paymentMethod: input.paymentMethod ?? null,
      validUntil: input.validUntil ?? null,
      regularity: input.regularity ?? null,
      comment: input.comment ?? null,
      alternativeProductId: input.alternativeProductId ?? null,
      // Re-submitting resets the buyer's read state so the change is noticed.
      status: 'SENT',
      viewedAt: null,
    },
  })
}

export async function withdrawOffer(offerId: string, sellerCompanyId: string): Promise<void> {
  const offer = await db.offer.findFirst({
    where: { id: offerId, sellerCompanyId },
    select: { id: true, requestId: true, status: true },
  })

  if (!offer) throw new AuthorizationError('notFound')
  if (offer.status === 'ACCEPTED') throw new DomainError('offerClosed')

  await transaction(async (tx) => {
    await tx.offer.update({ where: { id: offer.id }, data: { status: 'WITHDRAWN' } })
    await tx.purchaseRequest.update({
      where: { id: offer.requestId },
      data: { offersCount: { decrement: 1 } },
    })
  })
}

// --- seller reads ------------------------------------------------------------

/**
 * The seller's own offer for a request, or null.
 * `sellerCompanyId` is part of the WHERE clause, so this can never return someone
 * else's row even if `offerId` is guessed or leaked.
 */
export async function getMyOffer(requestId: string, sellerCompanyId: string) {
  return db.offer.findFirst({
    where: { requestId, sellerCompanyId },
    select: SELLER_OFFER_SELECT,
  })
}

export async function listMyOffers(sellerCompanyId: string, page = 1, pageSize = 20) {
  const where = { sellerCompanyId }

  const [total, items] = await Promise.all([
    db.offer.count({ where }),
    db.offer.findMany({
      where,
      select: {
        ...SELLER_OFFER_SELECT,
        request: {
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            quantity: true,
            unit: true,
            offersDeadlineAt: true,
            company: { select: { id: true, slug: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { items, total }
}

// --- buyer reads -------------------------------------------------------------

/**
 * Every offer on a request — but only for the company that owns the request.
 * Ownership is verified against the database first; the caller cannot assert it.
 */
export async function listOffersForBuyer(requestId: string, buyerCompanyId: string) {
  const request = await db.purchaseRequest.findFirst({
    where: { id: requestId, companyId: buyerCompanyId },
    select: { id: true },
  })

  if (!request) throw new AuthorizationError('forbidden')

  return db.offer.findMany({
    where: { requestId, status: { notIn: ['WITHDRAWN'] } },
    select: BUYER_OFFER_SELECT,
    orderBy: [{ totalBani: 'asc' }, { createdAt: 'asc' }],
  })
}

/** Marks unseen offers as viewed when the buyer opens the comparison screen. */
export async function markOffersViewed(requestId: string, buyerCompanyId: string): Promise<void> {
  const request = await db.purchaseRequest.findFirst({
    where: { id: requestId, companyId: buyerCompanyId },
    select: { id: true },
  })
  if (!request) throw new AuthorizationError('forbidden')

  await db.offer.updateMany({
    where: { requestId, status: 'SENT' },
    data: { status: 'VIEWED', viewedAt: new Date() },
  })
}

export async function shortlistOffer(
  offerId: string,
  buyerCompanyId: string,
  shortlisted: boolean,
): Promise<void> {
  const offer = await db.offer.findFirst({
    where: { id: offerId, request: { companyId: buyerCompanyId } },
    select: { id: true, status: true },
  })

  if (!offer) throw new AuthorizationError('forbidden')
  if (offer.status === 'ACCEPTED' || offer.status === 'WITHDRAWN') {
    throw new DomainError('offerClosed')
  }

  await db.offer.update({
    where: { id: offer.id },
    data: { status: shortlisted ? 'SHORTLISTED' : 'VIEWED' },
  })
}

export async function rejectOffer(offerId: string, buyerCompanyId: string): Promise<void> {
  const offer = await db.offer.findFirst({
    where: { id: offerId, request: { companyId: buyerCompanyId } },
    select: { id: true, status: true, sellerCompanyId: true, request: { select: { title: true } } },
  })

  if (!offer) throw new AuthorizationError('forbidden')
  if (offer.status === 'ACCEPTED') throw new DomainError('offerClosed')

  await db.offer.update({
    where: { id: offer.id },
    data: { status: 'REJECTED', respondedAt: new Date() },
  })

  await notifyCompany(offer.sellerCompanyId, {
    type: 'OFFER_REJECTED',
    params: { request: offer.request.title },
    entityType: 'OFFER',
    entityId: offer.id,
  })
}

/**
 * Accepts an offer: creates the deal, marks the winner, rejects the rest and moves the
 * request to SUPPLIER_SELECTED — all in one transaction, so two buyers clicking twice
 * cannot produce two deals for one request.
 */
export async function acceptOffer(
  offerId: string,
  buyerCompanyId: string,
  actorUserId: string,
): Promise<{ dealId: string }> {
  const offer = await db.offer.findFirst({
    where: { id: offerId, request: { companyId: buyerCompanyId } },
    select: {
      id: true,
      requestId: true,
      sellerCompanyId: true,
      priceBani: true,
      quantity: true,
      unit: true,
      deliveryPriceBani: true,
      totalBani: true,
      deliveryAt: true,
      paymentMethod: true,
      status: true,
      request: {
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          companyId: true,
          deliveryAddress: true,
          company: { select: { displayName: true } },
        },
      },
    },
  })

  if (!offer) throw new AuthorizationError('forbidden')
  if (offer.status === 'WITHDRAWN' || offer.status === 'EXPIRED') {
    throw new DomainError('offerClosed')
  }
  if (offer.request.status === 'SUPPLIER_SELECTED' || offer.request.status === 'COMPLETED') {
    throw new DomainError('offerClosed')
  }

  const dealId = await createDealFromOffer(offer, buyerCompanyId, actorUserId)

  const losers = await db.offer.findMany({
    where: { requestId: offer.requestId, id: { not: offer.id }, status: { not: 'WITHDRAWN' } },
    select: { id: true, sellerCompanyId: true },
  })

  await Promise.all([
    notifyCompany(offer.sellerCompanyId, {
      type: 'OFFER_ACCEPTED',
      params: { request: offer.request.title },
      entityType: 'DEAL',
      entityId: dealId,
      email: {
        template: 'offerAccepted',
        params: {
          requestTitle: offer.request.title,
          buyerName: offer.request.company.displayName,
          url: `${env.APP_URL}/deals/${dealId}`,
        },
      },
    }),
    ...losers.map((loser) =>
      notifyCompany(loser.sellerCompanyId, {
        type: 'OFFER_REJECTED',
        params: { request: offer.request.title },
        entityType: 'OFFER',
        entityId: loser.id,
      }),
    ),
  ])

  return { dealId }
}

// --- public ------------------------------------------------------------------

/**
 * The ONLY offer information a non-owner may read: how many there are.
 * Deliberately a count query rather than a list, so there is no shape to over-fetch.
 */
export async function getPublicOfferCount(requestId: string): Promise<number> {
  return db.offer.count({
    where: { requestId, status: { notIn: ['WITHDRAWN', 'EXPIRED'] } },
  })
}

/** Expires offers past their validUntil date. Called by the daily job. */
export async function expireStaleOffers(): Promise<number> {
  const result = await db.offer.updateMany({
    where: {
      validUntil: { lt: new Date() },
      status: { in: ['SENT', 'VIEWED', 'SHORTLISTED'] },
    },
    data: { status: 'EXPIRED' },
  })
  return result.count
}
