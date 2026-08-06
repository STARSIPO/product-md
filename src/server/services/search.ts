import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/server/db'
import { normalize, stem, tokenize } from '@/lib/normalize'
import { PAGE_SIZE, PUBLIC_PRODUCT_STATUSES, REQUEST_OPEN_STATUSES } from '@/lib/constants'
import type { ProductSearchParams, RequestSearchParams } from '@/lib/validation'
import type { Locale } from '@/lib/i18n/config'
import { getSubtreeIds, getCategoryBySlug, resolveQueryCategories } from './categories'

/**
 * Search over PostgreSQL/SQLite, without an external engine.
 *
 * Design notes:
 *   - Every product and request carries a precomputed `searchText`: its title,
 *     description, category names in BOTH languages, and the category's synonyms, all
 *     run through normalize(). One indexed column then answers "помидоры" for a
 *     listing titled "Томаты грунтовые".
 *   - Matching is AND-of-tokens (each token must appear), which behaves far better
 *     than OR for two-word queries like "говядина охлаждённая".
 *   - Query expansion adds category ids resolved from the same synonym table the
 *     typeahead uses, so a category-name query still finds listings whose title never
 *     mentions the category.
 *
 * This is a deliberate MVP choice, not a permanent one. `searchProducts` is the single
 * seam: swapping in Postgres full-text (tsvector + GIN) or Typesense/Elasticsearch
 * means reimplementing the `buildTextFilter` + ordering part only. See docs/DATABASE.md
 * for the Postgres GIN migration this is designed to grow into.
 */

export interface SearchPage<T> {
  items: T[]
  total: number
  page: number
  pageCount: number
}

/**
 * Every token must match. Tokens are also stem-matched: a `contains` on the stem
 * catches "помидор" inside "помидоры" without needing a real morphological index.
 */
function buildTextFilter(query: string | undefined): Prisma.ProductWhereInput[] {
  if (!query) return []

  const tokens = tokenize(query).filter((token) => token.length >= 2)
  if (tokens.length === 0) return []

  return tokens.map((token) => ({
    searchText: { contains: stem(token) },
  }))
}

function buildRequestTextFilter(query: string | undefined): Prisma.PurchaseRequestWhereInput[] {
  if (!query) return []
  const tokens = tokenize(query).filter((token) => token.length >= 2)
  if (tokens.length === 0) return []
  return tokens.map((token) => ({ searchText: { contains: stem(token) } }))
}

const SINCE_MS: Record<'24h' | '7d' | '30d', number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export const PRODUCT_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  priceBani: true,
  currency: true,
  unit: true,
  minOrderQty: true,
  availableQty: true,
  availability: true,
  pickupAvailable: true,
  deliveryPriceBani: true,
  isHighlighted: true,
  isUrgent: true,
  publishedAt: true,
  createdAt: true,
  viewsCount: true,
  photos: { select: { key: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
  category: {
    select: { id: true, slug: true, translations: { select: { locale: true, name: true, slug: true } } },
  },
  company: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      ratingAvg: true,
      ratingCount: true,
      district: { select: { id: true, nameRu: true, nameRo: true } },
      locality: { select: { id: true, nameRu: true, nameRo: true } },
      badges: { where: { status: 'APPROVED' }, select: { type: true } },
    },
  },
} satisfies Prisma.ProductSelect

export type ProductCard = Prisma.ProductGetPayload<{ select: typeof PRODUCT_CARD_SELECT }>

export async function searchProducts(
  params: ProductSearchParams,
  locale: Locale,
): Promise<SearchPage<ProductCard>> {
  const and: Prisma.ProductWhereInput[] = [
    { status: { in: [...PUBLIC_PRODUCT_STATUSES] } },
    { deletedAt: null },
    { company: { status: 'ACTIVE' } },
  ]

  // --- category ---------------------------------------------------------------
  let categoryIds: string[] = []
  if (params.category) {
    const category = await getCategoryBySlug(params.category, locale)
    if (category) {
      categoryIds = await getSubtreeIds(category.id)
      and.push({ categoryId: { in: categoryIds } })
    } else {
      // An unknown category slug must return nothing, not everything.
      and.push({ id: '__no_such_category__' })
    }
  }

  // --- free text --------------------------------------------------------------
  if (params.q) {
    const textFilters = buildTextFilter(params.q)
    const expandedCategoryIds = await resolveQueryCategories(params.q, locale)

    const expandedSubtree =
      expandedCategoryIds.length > 0
        ? (await Promise.all(expandedCategoryIds.map(getSubtreeIds))).flat()
        : []

    if (textFilters.length > 0 || expandedSubtree.length > 0) {
      and.push({
        OR: [
          ...(textFilters.length > 0 ? [{ AND: textFilters }] : []),
          ...(expandedSubtree.length > 0 ? [{ categoryId: { in: expandedSubtree } }] : []),
        ],
      })
    }
  }

  // --- facets -----------------------------------------------------------------
  if (params.priceMin !== undefined) and.push({ priceBani: { gte: params.priceMin } })
  if (params.priceMax !== undefined) and.push({ priceBani: { lte: params.priceMax } })
  if (params.unit) and.push({ unit: params.unit })
  if (params.minOrderMax !== undefined) and.push({ minOrderQty: { lte: params.minOrderMax } })
  if (params.district) and.push({ company: { districtId: params.district } })
  if (params.pickup) and.push({ pickupAvailable: true })
  if (params.delivery) and.push({ NOT: { deliveryTerms: null } })
  if (params.origin) and.push({ originCountry: { contains: params.origin } })
  if (params.availability) and.push({ availability: params.availability })
  if (params.regular) {
    and.push({ supplyRegularity: { in: ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CONSTANT'] } })
  }
  if (params.ratingMin !== undefined) {
    and.push({ company: { ratingAvg: { gte: params.ratingMin } } })
  }
  if (params.verified) {
    and.push({
      company: {
        badges: { some: { type: 'TRUSTED_SUPPLIER', status: 'APPROVED' } },
      },
    })
  }
  if (params.since) {
    and.push({ publishedAt: { gte: new Date(Date.now() - SINCE_MS[params.since]) } })
  }

  const where: Prisma.ProductWhereInput = { AND: and }

  // --- ordering ---------------------------------------------------------------
  // Promoted listings always float first; the chosen sort then applies within.
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ isHomepagePinned: 'desc' }]

  switch (params.sort) {
    case 'price_asc':
      orderBy.push({ priceBani: 'asc' })
      break
    case 'price_desc':
      orderBy.push({ priceBani: 'desc' })
      break
    case 'rating':
      orderBy.push({ company: { ratingAvg: 'desc' } })
      break
    case 'popular':
      orderBy.push({ viewsCount: 'desc' })
      break
    case 'newest':
      orderBy.push({ publishedAt: 'desc' })
      break
    case 'relevance':
    default:
      // Without a real relevance score, freshness plus a manual bump is the honest
      // proxy — and it is what a supplier paying for "поднятие" expects to buy.
      orderBy.push({ bumpedAt: 'desc' }, { publishedAt: 'desc' })
      break
  }
  orderBy.push({ id: 'asc' })

  const page = Math.max(1, params.page)
  const [total, items] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      select: PRODUCT_CARD_SELECT,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export const REQUEST_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  quantity: true,
  unit: true,
  maxBudgetBani: true,
  desiredPriceBani: true,
  isRecurring: true,
  frequency: true,
  firstDeliveryAt: true,
  offersDeadlineAt: true,
  allowPartial: true,
  verifiedOnly: true,
  isUrgent: true,
  offersCount: true,
  status: true,
  createdAt: true,
  category: {
    select: { id: true, slug: true, translations: { select: { locale: true, name: true, slug: true } } },
  },
  deliveryLocality: { select: { id: true, nameRu: true, nameRo: true } },
  company: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      ratingAvg: true,
      ratingCount: true,
      badges: { where: { status: 'APPROVED' }, select: { type: true } },
    },
  },
} satisfies Prisma.PurchaseRequestSelect

export type RequestCard = Prisma.PurchaseRequestGetPayload<{
  select: typeof REQUEST_CARD_SELECT
}>

export async function searchRequests(
  params: RequestSearchParams,
  locale: Locale,
): Promise<SearchPage<RequestCard>> {
  const and: Prisma.PurchaseRequestWhereInput[] = [
    // Private requests never appear in a public listing, whatever else matches.
    { visibility: 'PUBLIC' },
    { status: { in: [...REQUEST_OPEN_STATUSES] } },
    { deletedAt: null },
    { company: { status: 'ACTIVE' } },
  ]

  if (params.category) {
    const category = await getCategoryBySlug(params.category, locale)
    if (category) {
      and.push({ categoryId: { in: await getSubtreeIds(category.id) } })
    } else {
      and.push({ id: '__no_such_category__' })
    }
  }

  if (params.q) {
    const textFilters = buildRequestTextFilter(params.q)
    const expanded = await resolveQueryCategories(params.q, locale)
    const expandedSubtree =
      expanded.length > 0 ? (await Promise.all(expanded.map(getSubtreeIds))).flat() : []

    if (textFilters.length > 0 || expandedSubtree.length > 0) {
      and.push({
        OR: [
          ...(textFilters.length > 0 ? [{ AND: textFilters }] : []),
          ...(expandedSubtree.length > 0 ? [{ categoryId: { in: expandedSubtree } }] : []),
        ],
      })
    }
  }

  if (params.district) and.push({ deliveryLocality: { districtId: params.district } })
  if (params.recurring) and.push({ isRecurring: true })
  if (params.urgent) and.push({ isUrgent: true })

  const where: Prisma.PurchaseRequestWhereInput = { AND: and }

  const orderBy: Prisma.PurchaseRequestOrderByWithRelationInput[] = [{ isUrgent: 'desc' }]
  switch (params.sort) {
    case 'deadline':
      orderBy.push({ offersDeadlineAt: 'asc' })
      break
    case 'budget_desc':
      orderBy.push({ maxBudgetBani: 'desc' })
      break
    case 'offers':
      orderBy.push({ offersCount: 'desc' })
      break
    case 'newest':
    default:
      orderBy.push({ createdAt: 'desc' })
      break
  }
  orderBy.push({ id: 'asc' })

  const page = Math.max(1, params.page)
  const [total, items] = await Promise.all([
    db.purchaseRequest.count({ where }),
    db.purchaseRequest.findMany({
      where,
      select: REQUEST_CARD_SELECT,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

// --- global search overlay ---------------------------------------------------

export interface GlobalSearchResult {
  categories: { id: string; name: string; slug: string; trail: string }[]
  products: { id: string; slug: string; title: string; priceBani: number; unit: string }[]
  suppliers: { id: string; slug: string; displayName: string; ratingAvg: number }[]
  requests: { id: string; slug: string; title: string; quantity: number; unit: string }[]
  districts: { id: string; name: string }[]
}

/** Grouped results for the search overlay. Deliberately small and fast. */
export async function globalSearch(query: string, locale: Locale): Promise<GlobalSearchResult> {
  const normalized = normalize(query)
  if (normalized.length < 2) {
    return { categories: [], products: [], suppliers: [], requests: [], districts: [] }
  }

  const { suggestCategories } = await import('./categories')
  const textFilters = buildTextFilter(query)

  const [categorySuggestions, products, suppliers, requests, districts] = await Promise.all([
    suggestCategories(query, locale, 4),
    db.product.findMany({
      where: {
        AND: [
          { status: { in: [...PUBLIC_PRODUCT_STATUSES] } },
          { deletedAt: null },
          ...(textFilters.length > 0 ? textFilters : [{ id: '__none__' }]),
        ],
      },
      select: { id: true, slug: true, title: true, priceBani: true, unit: true },
      orderBy: [{ viewsCount: 'desc' }],
      take: 5,
    }),
    db.company.findMany({
      where: {
        status: 'ACTIVE',
        isSeller: true,
        displayName: { contains: query.trim() },
      },
      select: { id: true, slug: true, displayName: true, ratingAvg: true },
      orderBy: { ratingAvg: 'desc' },
      take: 4,
    }),
    db.purchaseRequest.findMany({
      where: {
        AND: [
          { visibility: 'PUBLIC' },
          { status: { in: [...REQUEST_OPEN_STATUSES] } },
          { deletedAt: null },
          ...(buildRequestTextFilter(query).length > 0
            ? buildRequestTextFilter(query)
            : [{ id: '__none__' }]),
        ],
      },
      select: { id: true, slug: true, title: true, quantity: true, unit: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    }),
    db.district.findMany({
      where: locale === 'ro' ? { nameRo: { contains: query.trim() } } : { nameRu: { contains: query.trim() } },
      select: { id: true, nameRu: true, nameRo: true },
      take: 3,
    }),
  ])

  return {
    categories: categorySuggestions.map((item) => ({
      id: item.category.id,
      name: item.category.names[locale],
      slug: item.category.slugs[locale],
      trail: item.trailLabel,
    })),
    products,
    suppliers,
    requests,
    districts: districts.map((district) => ({
      id: district.id,
      name: locale === 'ro' ? district.nameRo : district.nameRu,
    })),
  }
}

/** Feeds "popular queries" on the empty search overlay. */
export async function getPopularQueries(locale: Locale, limit = 6): Promise<string[]> {
  const rows = await db.searchQueryLog.groupBy({
    by: ['normalized'],
    where: {
      locale,
      resultsCount: { gt: 0 },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    _count: { normalized: true },
    orderBy: { _count: { normalized: 'desc' } },
    take: limit,
  })

  return rows.map((row) => row.normalized)
}

export async function logSearchQuery(
  query: string,
  locale: Locale,
  resultsCount: number,
  userId: string | null,
): Promise<void> {
  const normalized = normalize(query)
  if (normalized.length < 2) return

  await db.searchQueryLog
    .create({ data: { query: query.slice(0, 200), normalized, locale, resultsCount, userId } })
    .catch(() => undefined)
}

/**
 * Rebuilds the denormalized search column for a product.
 * Called on every create/update so the index can never drift from the row.
 */
export async function buildProductSearchText(
  title: string,
  description: string | null,
  categoryId: string,
): Promise<string> {
  const [category, synonyms] = await Promise.all([
    db.category.findUnique({
      where: { id: categoryId },
      include: { translations: { select: { name: true } } },
    }),
    db.categorySynonym.findMany({ where: { categoryId }, select: { term: true } }),
  ])

  const parts = [
    title,
    description ?? '',
    ...(category?.translations.map((translation) => translation.name) ?? []),
    ...synonyms.map((synonym) => synonym.term),
  ]

  return normalize(parts.join(' '))
}
