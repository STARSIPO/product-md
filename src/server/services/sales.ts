import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/server/db'
import { PAGE_SIZE, MIN_DISCOUNT_PERCENT } from '@/lib/constants'
import { PRODUCT_CARD_SELECT } from './search'
import type { Locale } from '@/lib/i18n/config'

/**
 * «Акции» — listings whose price actually went down.
 *
 * Not to be confused with the `Promotion` model, which is paid visibility (bump, pin,
 * homepage). Nothing on this surface can be bought: a listing appears here because the
 * seller lowered the price, never because they paid to be seen. That distinction is the
 * whole reason this lives in its own service rather than reusing the promotion queries.
 */

export const SALE_CARD_SELECT = {
  ...PRODUCT_CARD_SELECT,
  oldPriceBani: true,
  discountEndsAt: true,
} satisfies Prisma.ProductSelect

export type SaleCard = Prisma.ProductGetPayload<{ select: typeof SALE_CARD_SELECT }>

/**
 * A live sale needs a higher previous price and, when one was set, an end date still
 * ahead. `oldPriceBani: { gt: … }` cannot reference another column in Prisma, so the
 * final comparison is done in memory — the index on (status, discountEndsAt) keeps the
 * candidate set small enough that this costs nothing.
 */
function saleWhere(extra: Prisma.ProductWhereInput[] = []): Prisma.ProductWhereInput {
  return {
    AND: [
      { status: 'ACTIVE' },
      { deletedAt: null },
      { company: { status: 'ACTIVE' } },
      { oldPriceBani: { not: null } },
      { OR: [{ discountEndsAt: null }, { discountEndsAt: { gt: new Date() } }] },
      ...extra,
    ],
  }
}

function isRealSaving(product: { priceBani: number; oldPriceBani: number | null }): boolean {
  if (product.oldPriceBani === null) return false
  const percent = Math.round(
    ((product.oldPriceBani - product.priceBani) / product.oldPriceBani) * 100,
  )
  return percent >= MIN_DISCOUNT_PERCENT
}

export interface SaleSearchParams {
  category?: string
  district?: string
  page?: number
}

export async function searchSales(params: SaleSearchParams, locale: Locale) {
  const extra: Prisma.ProductWhereInput[] = []

  if (params.district) extra.push({ company: { districtId: params.district, status: 'ACTIVE' } })

  if (params.category) {
    const { getCategoryBySlug, getSubtreeIds } = await import('./categories')
    const category = await getCategoryBySlug(params.category, locale)
    extra.push(
      category
        ? { categoryId: { in: await getSubtreeIds(category.id) } }
        : { id: '__no_such_category__' },
    )
  }

  const where = saleWhere(extra)
  const page = Math.max(1, params.page ?? 1)

  // Over-fetch a little, because the sub-threshold rows are dropped after the query.
  const [candidates, total] = await Promise.all([
    db.product.findMany({
      where,
      select: SALE_CARD_SELECT,
      orderBy: [{ discountEndsAt: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE * 2,
    }),
    db.product.count({ where }),
  ])

  const items = candidates.filter(isRealSaving).slice(0, PAGE_SIZE)

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** The homepage rail. Deliberately small; returns [] when nothing is discounted. */
export async function getSaleHighlights(limit = 4): Promise<SaleCard[]> {
  const candidates = await db.product.findMany({
    where: saleWhere(),
    select: SALE_CARD_SELECT,
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    take: limit * 3,
  })

  return candidates.filter(isRealSaving).slice(0, limit)
}

export async function countActiveSales(): Promise<number> {
  const candidates = await db.product.findMany({
    where: saleWhere(),
    select: { priceBani: true, oldPriceBani: true },
    take: 500,
  })
  return candidates.filter(isRealSaving).length
}

/** A seller's own discounted listings, for the «Акции» tab in their account. */
export async function listCompanySales(companyId: string) {
  return db.product.findMany({
    where: {
      companyId,
      deletedAt: null,
      oldPriceBani: { not: null },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      unit: true,
      priceBani: true,
      oldPriceBani: true,
      discountEndsAt: true,
      photos: { select: { key: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
    },
    orderBy: [{ discountEndsAt: 'asc' }, { updatedAt: 'desc' }],
  })
}

/**
 * Sets or clears a discount on one listing.
 *
 * `oldPriceBani` holds what the price WAS, so clearing a sale restores it rather than
 * leaving the reduced figure as the new normal — a seller who ends a promotion should
 * not have to remember their own original price.
 */
export async function setProductSale(
  productId: string,
  companyId: string,
  input: { salePriceBani: number | null; endsAt: Date | null },
): Promise<void> {
  const product = await db.product.findFirst({
    where: { id: productId, companyId, deletedAt: null },
    select: { id: true, priceBani: true, oldPriceBani: true },
  })
  if (!product) return

  if (input.salePriceBani === null) {
    // Ending a sale: put the original price back where it belongs.
    await db.product.update({
      where: { id: product.id },
      data: {
        priceBani: product.oldPriceBani ?? product.priceBani,
        oldPriceBani: null,
        discountEndsAt: null,
      },
    })
    return
  }

  // Starting or changing a sale: remember the original only the first time, otherwise
  // a second reduction would record the already-discounted price as "before".
  const original = product.oldPriceBani ?? product.priceBani
  if (input.salePriceBani >= original) return

  await db.product.update({
    where: { id: product.id },
    data: {
      priceBani: input.salePriceBani,
      oldPriceBani: original,
      discountEndsAt: input.endsAt,
    },
  })
}

/** Expires finished sales, restoring the original price. Part of the daily job. */
export async function expireSales(now: Date = new Date()): Promise<number> {
  const finished = await db.product.findMany({
    where: { discountEndsAt: { lt: now }, oldPriceBani: { not: null } },
    select: { id: true, oldPriceBani: true },
  })

  for (const product of finished) {
    await db.product.update({
      where: { id: product.id },
      data: {
        priceBani: product.oldPriceBani as number,
        oldPriceBani: null,
        discountEndsAt: null,
      },
    })
  }

  return finished.length
}
