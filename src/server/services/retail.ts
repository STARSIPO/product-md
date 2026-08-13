import 'server-only'
import type { Prisma } from '@prisma/client'
import { db, transaction } from '@/server/db'
import { DomainError } from '@/server/actions/result'
import { AuthorizationError } from '@/server/auth/guards'
import { lineTotalBani } from '@/lib/money'
import { PAGE_SIZE, RETAIL_ORDER_TRANSITIONS, type RetailOrderStatus } from '@/lib/constants'
import { notifyCompany } from './notifications'

/**
 * The consumer-facing delivery storefront.
 *
 * A different market from the wholesale catalogue and deliberately a different code
 * path: here the buyer is a person with an address, not a company with an IDNO; the
 * quantities are one kilo rather than twenty; and the order carries several items from
 * one seller instead of one negotiated line.
 *
 * Product.md still touches no money. The shopper pays the seller directly on delivery
 * or by whatever the seller accepts — exactly as in the wholesale half.
 */

/** Retail price falls back to the wholesale one when the seller did not set a separate one. */
export function retailPriceOf(product: {
  priceBani: number
  retailPriceBani: number | null
}): number {
  return product.retailPriceBani ?? product.priceBani
}

export const RETAIL_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  priceBani: true,
  oldPriceBani: true,
  discountEndsAt: true,
  retailPriceBani: true,
  retailMinQty: true,
  unit: true,
  availability: true,
  photos: { select: { key: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
  category: {
    select: { id: true, slug: true, translations: { select: { locale: true, name: true, slug: true } } },
  },
  company: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      kind: true,
      ratingAvg: true,
      ratingCount: true,
      retailDeliveryFeeBani: true,
      retailFreeFromBani: true,
      locality: { select: { id: true, nameRu: true, nameRo: true } },
    },
  },
} satisfies Prisma.ProductSelect

export type RetailCard = Prisma.ProductGetPayload<{ select: typeof RETAIL_CARD_SELECT }>

export interface RetailSearchParams {
  q?: string
  category?: string
  companyId?: string
  page?: number
}

/** Only ACTIVE listings from companies that have switched retail on are ever visible. */
function retailWhere(extra: Prisma.ProductWhereInput[] = []): Prisma.ProductWhereInput {
  return {
    AND: [
      { status: 'ACTIVE' },
      { deletedAt: null },
      { isRetail: true },
      { availability: { not: 'OUT_OF_STOCK' } },
      { company: { status: 'ACTIVE', isRetail: true } },
      ...extra,
    ],
  }
}

export async function searchRetailProducts(params: RetailSearchParams) {
  const extra: Prisma.ProductWhereInput[] = []

  if (params.companyId) extra.push({ companyId: params.companyId })
  if (params.q) {
    const { stem, tokenize } = await import('@/lib/normalize')
    const tokens = tokenize(params.q).filter((token) => token.length >= 2)
    if (tokens.length > 0) {
      extra.push({ AND: tokens.map((token) => ({ searchText: { contains: stem(token) } })) })
    }
  }
  if (params.category) {
    const { getCategoryBySlug, getSubtreeIds } = await import('./categories')
    const category = await getCategoryBySlug(params.category, 'ru')
    extra.push(
      category
        ? { categoryId: { in: await getSubtreeIds(category.id) } }
        : { id: '__no_such_category__' },
    )
  }

  const where = retailWhere(extra)
  const page = Math.max(1, params.page ?? 1)

  const [total, items] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      select: RETAIL_CARD_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** Shops that currently have something to sell — the storefront's entry list. */
export async function listRetailCompanies() {
  return db.company.findMany({
    where: {
      status: 'ACTIVE',
      isRetail: true,
      products: { some: { status: 'ACTIVE', isRetail: true, deletedAt: null } },
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
      kind: true,
      logoKey: true,
      ratingAvg: true,
      ratingCount: true,
      retailDeliveryFeeBani: true,
      retailFreeFromBani: true,
      retailDeliveryNote: true,
      locality: { select: { nameRu: true, nameRo: true } },
      _count: { select: { products: { where: { status: 'ACTIVE', isRetail: true } } } },
    },
    orderBy: [{ ratingAvg: 'desc' }, { displayName: 'asc' }],
  })
}

// --- orders ------------------------------------------------------------------

export interface CartLine {
  productId: string
  quantity: number
}

export interface PlaceOrderInput {
  sellerCompanyId: string
  lines: CartLine[]
  customerName: string
  customerPhone: string
  customerEmail?: string
  deliveryAddress: string
  deliveryLocalityId?: string
  deliveryNote?: string
  paymentMethod?: string
}

/** PMD-R-2026-000123 — the R keeps retail numbering clear of wholesale deal numbers. */
async function nextOrderNumber(): Promise<string> {
  const prefix = `PMD-R-${new Date().getFullYear()}-`
  const last = await db.retailOrder.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const previous = last ? Number.parseInt(last.number.slice(prefix.length), 10) : 0
  const next = Number.isFinite(previous) ? previous + 1 : 1
  return `${prefix}${String(next).padStart(6, '0')}`
}

/**
 * Places an order.
 *
 * Prices are re-read from the database and totals recomputed server-side: what the cart
 * claimed an item costs is never trusted. A cart assembled an hour ago against a since
 * changed price is repriced, not rejected — but it is repriced from the row, not from
 * the payload.
 */
export async function placeRetailOrder(
  input: PlaceOrderInput,
  customerUserId: string | null,
): Promise<{ id: string; number: string; totalBani: number }> {
  if (input.lines.length === 0) throw new DomainError('validation')

  const company = await db.company.findFirst({
    where: { id: input.sellerCompanyId, status: 'ACTIVE', isRetail: true },
    select: {
      id: true,
      retailDeliveryFeeBani: true,
      retailFreeFromBani: true,
    },
  })
  if (!company) throw new DomainError('notFound')

  const products = await db.product.findMany({
    where: {
      id: { in: input.lines.map((line) => line.productId) },
      companyId: company.id,
      status: 'ACTIVE',
      isRetail: true,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      unit: true,
      priceBani: true,
      retailPriceBani: true,
      retailMinQty: true,
    },
  })

  const byId = new Map(products.map((product) => [product.id, product]))

  const items = input.lines.map((line) => {
    const product = byId.get(line.productId)
    // A line whose product vanished or left the storefront invalidates the order rather
    // than silently dropping — the shopper must see what changed.
    if (!product) throw new DomainError('notFound')

    const quantity = Math.max(line.quantity, product.retailMinQty)
    const unitPriceBani = retailPriceOf(product)

    return {
      productId: product.id,
      title: product.title,
      unit: product.unit,
      unitPriceBani,
      quantity,
      totalBani: lineTotalBani(quantity, unitPriceBani),
    }
  })

  const itemsTotalBani = items.reduce((sum, item) => sum + item.totalBani, 0)

  const freeFrom = company.retailFreeFromBani
  const deliveryFeeBani =
    freeFrom !== null && itemsTotalBani >= freeFrom ? 0 : (company.retailDeliveryFeeBani ?? 0)

  const number = await nextOrderNumber()

  const order = await transaction(async (tx) => {
    const created = await tx.retailOrder.create({
      data: {
        number,
        customerUserId,
        sellerCompanyId: company.id,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail ?? null,
        deliveryAddress: input.deliveryAddress,
        deliveryLocalityId: input.deliveryLocalityId ?? null,
        deliveryNote: input.deliveryNote ?? null,
        itemsTotalBani,
        deliveryFeeBani,
        totalBani: itemsTotalBani + deliveryFeeBani,
        paymentMethod: input.paymentMethod ?? 'CASH',
        status: 'NEW',
      },
      select: { id: true, number: true, totalBani: true },
    })

    await tx.retailOrderItem.createMany({
      data: items.map((item) => ({ ...item, orderId: created.id })),
    })

    return created
  })

  await notifyCompany(company.id, {
    type: 'DEAL_STATUS',
    params: { number: order.number, status: 'NEW' },
    entityType: 'RETAIL_ORDER',
    entityId: order.id,
  })

  return order
}

export const RETAIL_ORDER_SELECT = {
  id: true,
  number: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  deliveryAddress: true,
  deliveryNote: true,
  deliveryAt: true,
  itemsTotalBani: true,
  deliveryFeeBani: true,
  totalBani: true,
  currency: true,
  paymentMethod: true,
  status: true,
  cancelReason: true,
  createdAt: true,
  sellerCompanyId: true,
  customerUserId: true,
  sellerCompany: { select: { id: true, slug: true, displayName: true, phone: true } },
  locality: { select: { nameRu: true, nameRo: true } },
  items: {
    select: {
      id: true,
      title: true,
      unit: true,
      quantity: true,
      unitPriceBani: true,
      totalBani: true,
      product: { select: { slug: true } },
    },
  },
} satisfies Prisma.RetailOrderSelect

export async function listSellerOrders(sellerCompanyId: string, status?: string, page = 1) {
  const where: Prisma.RetailOrderWhereInput = {
    sellerCompanyId,
    ...(status ? { status } : {}),
  }

  const [total, items] = await Promise.all([
    db.retailOrder.count({ where }),
    db.retailOrder.findMany({
      where,
      select: RETAIL_ORDER_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20,
    }),
  ])

  return { items, total }
}

export async function listCustomerOrders(customerUserId: string) {
  return db.retailOrder.findMany({
    where: { customerUserId },
    select: RETAIL_ORDER_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

/** Readable by the seller who owns it, or by the customer who placed it. Nobody else. */
export async function getOrderForViewer(
  orderId: string,
  viewer: { userId: string | null; companyId: string | null },
) {
  return db.retailOrder.findFirst({
    where: {
      id: orderId,
      OR: [
        ...(viewer.companyId ? [{ sellerCompanyId: viewer.companyId }] : []),
        ...(viewer.userId ? [{ customerUserId: viewer.userId }] : []),
      ],
    },
    select: RETAIL_ORDER_SELECT,
  })
}

/**
 * Moves an order along. Only the selling company drives it forward; the customer may
 * cancel while it has not left the shop.
 */
export async function transitionOrder(
  orderId: string,
  sellerCompanyId: string,
  toStatus: RetailOrderStatus,
  reason?: string,
): Promise<void> {
  const order = await db.retailOrder.findFirst({
    where: { id: orderId, sellerCompanyId },
    select: { id: true, status: true },
  })
  if (!order) throw new AuthorizationError('notFound')

  const from = order.status as RetailOrderStatus
  if (!RETAIL_ORDER_TRANSITIONS[from].includes(toStatus)) {
    throw new DomainError('dealTransitionInvalid')
  }

  await db.retailOrder.update({
    where: { id: order.id },
    data: {
      status: toStatus,
      ...(toStatus === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
      ...(toStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      ...(toStatus === 'CANCELLED'
        ? { cancelledAt: new Date(), cancelReason: reason ?? null }
        : {}),
    },
  })
}
