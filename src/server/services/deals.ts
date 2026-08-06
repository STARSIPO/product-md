import 'server-only'
import { db, transaction } from '@/server/db'
import { env } from '@/env'
import { DomainError } from '@/server/actions/result'
import { AuthorizationError } from '@/server/auth/guards'
import { DEAL_TRANSITIONS, type DealStatus } from '@/lib/constants'
import { lineTotalBani, resolveTierPriceBani } from '@/lib/money'
import { notifyCompany } from './notifications'

/**
 * Deals — the agreement record between a buyer and a seller.
 *
 * Product.md is not a party to it and takes no payment for goods: this entity exists
 * so both sides see the same agreed numbers, can track fulfilment, and can leave a
 * review that is provably tied to a real transaction. The printable document at
 * /deals/[id]/document says exactly that.
 *
 * Status changes are validated against DEAL_TRANSITIONS on the server. The UI hides
 * impossible buttons, but a crafted POST is rejected by the same table.
 */

/** PMD-2026-000123 — human-quotable in a phone call or an invoice. */
async function nextDealNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `PMD-${year}-`

  const last = await db.deal.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })

  const lastSequence = last ? Number.parseInt(last.number.slice(prefix.length), 10) : 0
  const next = Number.isFinite(lastSequence) ? lastSequence + 1 : 1
  return `${prefix}${String(next).padStart(6, '0')}`
}

interface AcceptedOffer {
  id: string
  requestId: string
  sellerCompanyId: string
  priceBani: number
  quantity: number
  unit: string
  deliveryPriceBani: number
  totalBani: number
  deliveryAt: Date | null
  paymentMethod: string | null
  request: { id: string; title: string; deliveryAddress: string | null }
}

export async function createDealFromOffer(
  offer: AcceptedOffer,
  buyerCompanyId: string,
  actorUserId: string,
): Promise<string> {
  const number = await nextDealNumber()

  return transaction(async (tx) => {
    // Re-check inside the transaction: two clicks on "choose supplier" must not
    // produce two deals for the same request.
    const alreadyDecided = await tx.purchaseRequest.findFirst({
      where: {
        id: offer.requestId,
        status: { in: ['SUPPLIER_SELECTED', 'IN_PROGRESS', 'COMPLETED'] },
      },
      select: { id: true },
    })
    if (alreadyDecided) throw new DomainError('offerClosed')

    const deal = await tx.deal.create({
      data: {
        number,
        buyerCompanyId,
        sellerCompanyId: offer.sellerCompanyId,
        requestId: offer.requestId,
        offerId: offer.id,
        title: offer.request.title,
        quantity: offer.quantity,
        unit: offer.unit,
        unitPriceBani: offer.priceBani,
        deliveryPriceBani: offer.deliveryPriceBani,
        totalBani: offer.totalBani,
        deliveryAddress: offer.request.deliveryAddress,
        deliveryAt: offer.deliveryAt,
        paymentMethod: offer.paymentMethod,
        status: 'AWAITING_CONFIRMATION',
      },
      select: { id: true },
    })

    await tx.dealEvent.create({
      data: {
        dealId: deal.id,
        actorId: actorUserId,
        toStatus: 'AWAITING_CONFIRMATION',
        comment: 'createdFromOffer',
      },
    })

    await tx.offer.update({
      where: { id: offer.id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    })

    await tx.offer.updateMany({
      where: {
        requestId: offer.requestId,
        id: { not: offer.id },
        status: { notIn: ['WITHDRAWN', 'ACCEPTED'] },
      },
      data: { status: 'REJECTED', respondedAt: new Date() },
    })

    await tx.purchaseRequest.update({
      where: { id: offer.requestId },
      data: { status: 'SUPPLIER_SELECTED' },
    })

    return deal.id
  })
}

export interface DealFromProductInput {
  productId: string
  quantity: number
  deliveryAddress?: string
  deliveryAt?: Date
  paymentMethod?: string
  comment?: string
}

/** Direct purchase from a catalogue listing, priced through the wholesale ladder. */
export async function createDealFromProduct(
  buyerCompanyId: string,
  actorUserId: string,
  input: DealFromProductInput,
): Promise<string> {
  const product = await db.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      title: true,
      companyId: true,
      status: true,
      unit: true,
      priceBani: true,
      minOrderQty: true,
      deliveryPriceBani: true,
      deletedAt: true,
      priceTiers: { select: { minQty: true, maxQty: true, priceBani: true } },
    },
  })

  if (!product || product.deletedAt || product.status !== 'ACTIVE') throw new DomainError('notFound')
  if (product.companyId === buyerCompanyId) throw new DomainError('ownProduct')
  if (input.quantity < product.minOrderQty) throw new DomainError('validation')

  const unitPriceBani = resolveTierPriceBani(input.quantity, product.priceBani, product.priceTiers)
  const deliveryPriceBani = product.deliveryPriceBani ?? 0
  const totalBani = lineTotalBani(input.quantity, unitPriceBani) + deliveryPriceBani
  const number = await nextDealNumber()

  const dealId = await transaction(async (tx) => {
    const deal = await tx.deal.create({
      data: {
        number,
        buyerCompanyId,
        sellerCompanyId: product.companyId,
        productId: product.id,
        title: product.title,
        quantity: input.quantity,
        unit: product.unit,
        unitPriceBani,
        deliveryPriceBani,
        totalBani,
        deliveryAddress: input.deliveryAddress ?? null,
        deliveryAt: input.deliveryAt ?? null,
        paymentMethod: input.paymentMethod ?? null,
        comment: input.comment ?? null,
        status: 'AWAITING_CONFIRMATION',
        buyerConfirmedAt: new Date(),
      },
      select: { id: true },
    })

    await tx.dealEvent.create({
      data: { dealId: deal.id, actorId: actorUserId, toStatus: 'AWAITING_CONFIRMATION' },
    })

    return deal.id
  })

  await notifyCompany(product.companyId, {
    type: 'DEAL_STATUS',
    params: { number, status: 'AWAITING_CONFIRMATION' },
    entityType: 'DEAL',
    entityId: dealId,
  })

  return dealId
}

/**
 * Moves a deal to a new status.
 *
 * Beyond the transition table there are role rules: only the seller ships, only the
 * buyer confirms delivery is complete. Encoding them here keeps the two sides honest
 * without a workflow engine.
 */
const SELLER_ONLY: readonly DealStatus[] = ['PREPARING', 'SHIPPED']
const BUYER_ONLY: readonly DealStatus[] = ['COMPLETED']

export async function transitionDeal(
  dealId: string,
  actorUserId: string,
  side: 'buyer' | 'seller',
  toStatus: DealStatus,
  comment?: string,
): Promise<void> {
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      number: true,
      status: true,
      buyerCompanyId: true,
      sellerCompanyId: true,
      buyerConfirmedAt: true,
      sellerConfirmedAt: true,
    },
  })

  if (!deal) throw new AuthorizationError('notFound')

  const from = deal.status as DealStatus
  if (!DEAL_TRANSITIONS[from].includes(toStatus)) throw new DomainError('dealTransitionInvalid')
  if (SELLER_ONLY.includes(toStatus) && side !== 'seller') throw new AuthorizationError('forbidden')
  if (BUYER_ONLY.includes(toStatus) && side !== 'buyer') throw new AuthorizationError('forbidden')

  // CONFIRMED requires both sides; the first click only records that side's consent.
  if (toStatus === 'CONFIRMED') {
    const buyerConfirmed = side === 'buyer' ? new Date() : deal.buyerConfirmedAt
    const sellerConfirmed = side === 'seller' ? new Date() : deal.sellerConfirmedAt
    const bothConfirmed = buyerConfirmed !== null && sellerConfirmed !== null

    await transaction(async (tx) => {
      await tx.deal.update({
        where: { id: deal.id },
        data: {
          buyerConfirmedAt: buyerConfirmed,
          sellerConfirmedAt: sellerConfirmed,
          ...(bothConfirmed ? { status: 'CONFIRMED' } : {}),
        },
      })
      if (bothConfirmed) {
        await tx.dealEvent.create({
          data: { dealId: deal.id, actorId: actorUserId, fromStatus: from, toStatus: 'CONFIRMED' },
        })
      }
    })

    if (!bothConfirmed) return
  } else {
    await transaction(async (tx) => {
      await tx.deal.update({
        where: { id: deal.id },
        data: {
          status: toStatus,
          ...(toStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
          ...(toStatus === 'CANCELLED'
            ? { cancelledAt: new Date(), cancelReason: comment ?? null }
            : {}),
        },
      })

      await tx.dealEvent.create({
        data: { dealId: deal.id, actorId: actorUserId, fromStatus: from, toStatus, comment: comment ?? null },
      })

      if (toStatus === 'COMPLETED') {
        // A completed deal is what unlocks reviews and feeds the public counter.
        await tx.company.update({
          where: { id: deal.buyerCompanyId },
          data: { dealsCompleted: { increment: 1 } },
        })
        await tx.company.update({
          where: { id: deal.sellerCompanyId },
          data: { dealsCompleted: { increment: 1 } },
        })
      }
    })
  }

  const counterpartyId = side === 'buyer' ? deal.sellerCompanyId : deal.buyerCompanyId
  await notifyCompany(counterpartyId, {
    type: 'DEAL_STATUS',
    params: { number: deal.number, status: toStatus },
    entityType: 'DEAL',
    entityId: deal.id,
    // The status label has to be translated, and a deal can involve two companies
    // reading in different languages — so the payload is built per recipient.
    email: async (locale) => {
      const { getDictionary } = await import('@/lib/i18n')
      const t = await getDictionary(locale)
      return {
        template: 'dealStatusChanged',
        params: {
          dealNumber: deal.number,
          statusLabel: t.dealStatus[toStatus],
          url: `${env.APP_URL}/deals/${deal.id}`,
        },
      }
    },
  })
}

export const DEAL_DETAIL_SELECT = {
  id: true,
  number: true,
  title: true,
  quantity: true,
  unit: true,
  unitPriceBani: true,
  deliveryPriceBani: true,
  totalBani: true,
  currency: true,
  deliveryAddress: true,
  deliveryAt: true,
  paymentMethod: true,
  comment: true,
  status: true,
  buyerConfirmedAt: true,
  sellerConfirmedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  buyerCompanyId: true,
  sellerCompanyId: true,
  productId: true,
  requestId: true,
  offerId: true,
  buyerCompany: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      legalName: true,
      idno: true,
      phone: true,
      email: true,
      address: true,
    },
  },
  sellerCompany: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      legalName: true,
      idno: true,
      phone: true,
      email: true,
      address: true,
    },
  },
  product: { select: { id: true, slug: true, title: true } },
  request: { select: { id: true, slug: true, title: true } },
  events: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      comment: true,
      createdAt: true,
      actor: { select: { id: true, name: true } },
    },
  },
  reviews: { select: { id: true, direction: true, authorCompanyId: true } },
} as const

export async function getDealForParticipant(dealId: string, companyId: string) {
  return db.deal.findFirst({
    where: {
      id: dealId,
      OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
    },
    select: DEAL_DETAIL_SELECT,
  })
}

export async function listDeals(companyId: string, page = 1, pageSize = 20) {
  const where = {
    OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
  }

  const [total, items] = await Promise.all([
    db.deal.count({ where }),
    db.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        title: true,
        quantity: true,
        unit: true,
        totalBani: true,
        status: true,
        createdAt: true,
        buyerCompanyId: true,
        sellerCompanyId: true,
        buyerCompany: { select: { id: true, slug: true, displayName: true } },
        sellerCompany: { select: { id: true, slug: true, displayName: true } },
      },
    }),
  ])

  return { items, total }
}
