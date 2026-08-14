import 'server-only'
import type { Prisma } from '@prisma/client'
import { db, transaction } from '@/server/db'
import { DomainError } from '@/server/actions/result'
import { slugify } from '@/lib/normalize'
import { chisinauDayKey } from '@/lib/utils'
import { PUBLIC_PRODUCT_STATUSES } from '@/lib/constants'
import type { ProductInput } from '@/lib/validation'
import { buildProductSearchText } from './search'
import { isEnabled } from './feature-flags'
import { getCategoryAttributes } from './categories'

/**
 * Seller listings.
 *
 * Two things are centralized here on purpose:
 *   - `searchText` is rebuilt on every write, so the search index cannot drift from
 *     the row it describes
 *   - the publish path decides DRAFT → PENDING → ACTIVE based on the
 *     REQUIRE_MODERATION flag, so turning moderation off is a flag flip rather than a
 *     code change
 */

async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`
    const existing = await db.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing || existing.id === excludeId) return candidate
  }

  return `${base}-${Date.now().toString(36)}`
}

/** Rejects attribute values that do not belong to the chosen category. */
async function sanitizeAttributes(
  categoryId: string,
  values: ProductInput['attributes'],
): Promise<Prisma.ProductAttributeValueCreateManyProductInput[]> {
  if (!values || values.length === 0) return []

  const allowed = await getCategoryAttributes(categoryId, 'ru', 'PRODUCT')
  const allowedById = new Map(allowed.map((attribute) => [attribute.id, attribute]))

  const out: Prisma.ProductAttributeValueCreateManyProductInput[] = []

  for (const value of values) {
    const attribute = allowedById.get(value.attributeId)
    if (!attribute) continue

    // A SELECT must reference one of its own options — never free text.
    if (attribute.type === 'SELECT' || attribute.type === 'MULTISELECT') {
      if (!value.optionId || !attribute.options.some((option) => option.id === value.optionId)) {
        continue
      }
    }

    out.push({
      attributeId: attribute.id,
      valueText: value.valueText ?? null,
      valueNumber: value.valueNumber ?? null,
      valueBool: value.valueBool ?? null,
      valueDate: value.valueDate ?? null,
      optionId: value.optionId ?? null,
    })
  }

  return out
}

/**
 * The retail half of a listing.
 *
 * A listing sold to households keeps its wholesale price untouched: `retailPriceBani`
 * is a second price, and leaving it empty means "the same one" rather than "free" —
 * which is why it is nullable and `retailPriceOf()` in services/retail.ts, not a
 * default of 0, decides what a shopper pays.
 *
 * The minimum is a quantity, so it is a float (0.5 kg of cheese is a real order) and
 * never falls below one unit of nothing: an omitted or zero minimum becomes 1.
 */
function retailColumns(input: ProductInput) {
  const isRetail = input.isRetail ?? false

  return {
    isRetail,
    retailPriceBani: isRetail ? (input.retailPriceBani ?? null) : null,
    retailMinQty: isRetail && input.retailMinQty ? input.retailMinQty : 1,
  }
}

export interface CreateProductOptions {
  publish: boolean
}

export async function createProduct(
  companyId: string,
  input: ProductInput,
  options: CreateProductOptions,
): Promise<{ id: string; slug: string; status: string }> {
  const category = await db.category.findUnique({
    where: { id: input.categoryId },
    select: { id: true, isActive: true },
  })
  if (!category?.isActive) throw new DomainError('validation')

  const [slug, searchText, attributes] = await Promise.all([
    uniqueSlug(input.title),
    buildProductSearchText(input.title, input.description ?? null, input.categoryId),
    sanitizeAttributes(input.categoryId, input.attributes),
  ])

  const status = options.publish ? await resolvePublishStatus() : 'DRAFT'

  const product = await transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        companyId,
        categoryId: input.categoryId,
        slug,
        title: input.title,
        description: input.description ?? null,
        priceBani: input.priceBani,
        unit: input.unit,
        minOrderQty: input.minOrderQty,
        availableQty: input.availableQty ?? null,
        availability: input.availability,
        originCountry: input.originCountry ?? null,
        productionPlace: input.productionPlace ?? null,
        manufacturer: input.manufacturer ?? null,
        batchNumber: input.batchNumber ?? null,
        producedAt: input.producedAt ?? null,
        bestBefore: input.bestBefore ?? null,
        storageConditions: input.storageConditions ?? null,
        storageTempC: input.storageTempC ?? null,
        allergens: input.allergens ?? null,
        composition: input.composition ?? null,
        packaging: input.packaging ?? null,
        supplyRegularity: input.supplyRegularity ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        deliveryPriceBani: input.deliveryPriceBani ?? null,
        pickupAvailable: input.pickupAvailable ?? false,
        deliveryRegions: input.deliveryRegions ? JSON.stringify(input.deliveryRegions) : null,
        videoUrl: input.videoUrl ?? null,
        ...retailColumns(input),
        searchText,
        status,
        publishedAt: status === 'ACTIVE' ? new Date() : null,
      },
      select: { id: true, slug: true, status: true },
    })

    if (attributes.length > 0) {
      await tx.productAttributeValue.createMany({
        data: attributes.map((attribute) => ({ ...attribute, productId: created.id })),
      })
    }

    if (input.priceTiers && input.priceTiers.length > 0) {
      await tx.priceTier.createMany({
        data: input.priceTiers.map((tier) => ({
          productId: created.id,
          minQty: tier.minQty,
          maxQty: tier.maxQty ?? null,
          priceBani: tier.priceBani,
        })),
      })
    }

    if (status === 'PENDING') {
      await tx.moderationTask.create({
        data: { entityType: 'PRODUCT', entityId: created.id, kind: 'REVIEW_NEW', status: 'OPEN' },
      })
    }

    return created
  })

  return product
}

async function resolvePublishStatus(): Promise<'PENDING' | 'ACTIVE'> {
  return (await isEnabled('REQUIRE_MODERATION')) ? 'PENDING' : 'ACTIVE'
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
  options: { publish: boolean; isStaff: boolean },
): Promise<{ id: string; slug: string; status: string }> {
  const existing = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, title: true, status: true },
  })
  if (!existing) throw new DomainError('notFound')

  const [searchText, attributes] = await Promise.all([
    buildProductSearchText(input.title, input.description ?? null, input.categoryId),
    sanitizeAttributes(input.categoryId, input.attributes),
  ])

  const slug =
    existing.title === input.title ? existing.slug : await uniqueSlug(input.title, existing.id)

  // Editing a live listing sends it back through moderation unless staff made the edit.
  let status = existing.status
  if (options.publish) {
    status =
      existing.status === 'DRAFT' || existing.status === 'CHANGES_REQUESTED'
        ? await resolvePublishStatus()
        : options.isStaff || existing.status !== 'ACTIVE'
          ? existing.status
          : await resolvePublishStatus()
  }

  return transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        categoryId: input.categoryId,
        slug,
        title: input.title,
        description: input.description ?? null,
        priceBani: input.priceBani,
        unit: input.unit,
        minOrderQty: input.minOrderQty,
        availableQty: input.availableQty ?? null,
        availability: input.availability,
        originCountry: input.originCountry ?? null,
        productionPlace: input.productionPlace ?? null,
        manufacturer: input.manufacturer ?? null,
        batchNumber: input.batchNumber ?? null,
        producedAt: input.producedAt ?? null,
        bestBefore: input.bestBefore ?? null,
        storageConditions: input.storageConditions ?? null,
        storageTempC: input.storageTempC ?? null,
        allergens: input.allergens ?? null,
        composition: input.composition ?? null,
        packaging: input.packaging ?? null,
        supplyRegularity: input.supplyRegularity ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        deliveryPriceBani: input.deliveryPriceBani ?? null,
        pickupAvailable: input.pickupAvailable ?? false,
        deliveryRegions: input.deliveryRegions ? JSON.stringify(input.deliveryRegions) : null,
        videoUrl: input.videoUrl ?? null,
        ...retailColumns(input),
        searchText,
        status,
        moderatorComment: status === 'PENDING' ? null : undefined,
        publishedAt: status === 'ACTIVE' && !existing.status.includes('ACTIVE') ? new Date() : undefined,
      },
      select: { id: true, slug: true, status: true },
    })

    await tx.productAttributeValue.deleteMany({ where: { productId } })
    if (attributes.length > 0) {
      await tx.productAttributeValue.createMany({
        data: attributes.map((attribute) => ({ ...attribute, productId })),
      })
    }

    await tx.priceTier.deleteMany({ where: { productId } })
    if (input.priceTiers && input.priceTiers.length > 0) {
      await tx.priceTier.createMany({
        data: input.priceTiers.map((tier) => ({
          productId,
          minQty: tier.minQty,
          maxQty: tier.maxQty ?? null,
          priceBani: tier.priceBani,
        })),
      })
    }

    if (status === 'PENDING') {
      await tx.moderationTask.upsert({
        where: {
          entityType_entityId_status: {
            entityType: 'PRODUCT',
            entityId: productId,
            status: 'OPEN',
          },
        },
        create: {
          entityType: 'PRODUCT',
          entityId: productId,
          kind: 'REVIEW_EDIT',
          status: 'OPEN',
        },
        update: {},
      })
    }

    return updated
  })
}

export async function setProductStatus(
  productId: string,
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'SOLD_OUT',
): Promise<void> {
  await db.product.update({
    where: { id: productId },
    data: {
      status,
      // A manual resume clears the billing pause, otherwise the next top-up would
      // resurrect a listing the seller deliberately stopped.
      pausedForBalance: false,
      ...(status === 'ACTIVE' ? { publishedAt: new Date() } : {}),
    },
  })
}

export async function duplicateProduct(productId: string, companyId: string): Promise<string> {
  const source = await db.product.findFirst({
    where: { id: productId, companyId },
    include: { priceTiers: true, attributes: true, photos: true },
  })
  if (!source) throw new DomainError('notFound')

  const title = `${source.title} (2)`
  const slug = await uniqueSlug(title)

  return transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        companyId,
        categoryId: source.categoryId,
        slug,
        title,
        description: source.description,
        priceBani: source.priceBani,
        unit: source.unit,
        minOrderQty: source.minOrderQty,
        availableQty: source.availableQty,
        availability: source.availability,
        originCountry: source.originCountry,
        productionPlace: source.productionPlace,
        manufacturer: source.manufacturer,
        storageConditions: source.storageConditions,
        storageTempC: source.storageTempC,
        allergens: source.allergens,
        composition: source.composition,
        packaging: source.packaging,
        supplyRegularity: source.supplyRegularity,
        deliveryTerms: source.deliveryTerms,
        deliveryPriceBani: source.deliveryPriceBani,
        pickupAvailable: source.pickupAvailable,
        deliveryRegions: source.deliveryRegions,
        searchText: source.searchText,
        status: 'DRAFT',
      },
      select: { id: true },
    })

    if (source.priceTiers.length > 0) {
      await tx.priceTier.createMany({
        data: source.priceTiers.map((tier) => ({
          productId: created.id,
          minQty: tier.minQty,
          maxQty: tier.maxQty,
          priceBani: tier.priceBani,
        })),
      })
    }

    if (source.attributes.length > 0) {
      await tx.productAttributeValue.createMany({
        data: source.attributes.map((attribute) => ({
          productId: created.id,
          attributeId: attribute.attributeId,
          valueText: attribute.valueText,
          valueNumber: attribute.valueNumber,
          valueBool: attribute.valueBool,
          valueDate: attribute.valueDate,
          optionId: attribute.optionId,
        })),
      })
    }

    if (source.photos.length > 0) {
      await tx.productPhoto.createMany({
        data: source.photos.map((photo) => ({
          productId: created.id,
          key: photo.key,
          alt: photo.alt,
          sortOrder: photo.sortOrder,
        })),
      })
    }

    return created.id
  })
}

export async function softDeleteProduct(productId: string): Promise<void> {
  await db.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  })
}

// --- reads -------------------------------------------------------------------

export const PRODUCT_DETAIL_INCLUDE = {
  photos: { orderBy: { sortOrder: 'asc' } },
  priceTiers: { orderBy: { minQty: 'asc' } },
  category: { include: { translations: true } },
  attributes: {
    include: {
      attribute: { include: { translations: true } },
      option: { include: { translations: true } },
    },
  },
  documents: {
    where: { document: { status: 'APPROVED', isPublic: true } },
    include: { document: { select: { id: true, type: true, number: true, expiresAt: true } } },
  },
  company: {
    include: {
      district: true,
      locality: true,
      badges: { where: { status: 'APPROVED' } },
    },
  },
} satisfies Prisma.ProductInclude

export async function getProductBySlug(slug: string, viewerCompanyId: string | null) {
  const product = await db.product.findFirst({
    where: { slug, deletedAt: null },
    include: PRODUCT_DETAIL_INCLUDE,
  })

  if (!product) return null

  // Owners and staff may preview a listing that the public cannot see yet.
  const isOwner = viewerCompanyId !== null && product.companyId === viewerCompanyId
  if (!isOwner && !PUBLIC_PRODUCT_STATUSES.includes(product.status as never)) return null

  return product
}

export async function listCompanyProducts(
  companyId: string,
  options: { status?: string; page?: number; pageSize?: number } = {},
) {
  const { status, page = 1, pageSize = 20 } = options
  const where: Prisma.ProductWhereInput = {
    companyId,
    deletedAt: null,
    ...(status ? { status } : {}),
  }

  const [total, items] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        photos: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { include: { translations: true } },
      },
    }),
  ])

  return { items, total }
}

/**
 * Records a view. Deliberately fire-and-forget and de-duplicated per day per product
 * at the daily-stat level — an accurate analytics pipeline is not worth blocking a
 * page render for.
 */
export async function recordProductView(productId: string): Promise<void> {
  const day = chisinauDayKey()

  await Promise.all([
    db.product.update({ where: { id: productId }, data: { viewsCount: { increment: 1 } } }),
    db.productStatDaily.upsert({
      where: { productId_day: { productId, day } },
      create: { productId, day, views: 1 },
      update: { views: { increment: 1 } },
    }),
  ]).catch(() => undefined)
}

export async function recordProductContact(productId: string): Promise<void> {
  const day = chisinauDayKey()
  await Promise.all([
    db.product.update({ where: { id: productId }, data: { contactsCount: { increment: 1 } } }),
    db.productStatDaily.upsert({
      where: { productId_day: { productId, day } },
      create: { productId, day, contacts: 1 },
      update: { contacts: { increment: 1 } },
    }),
  ]).catch(() => undefined)
}

export async function getSimilarProducts(
  productId: string,
  categoryId: string,
  limit = 4,
) {
  return db.product.findMany({
    where: {
      id: { not: productId },
      categoryId,
      status: 'ACTIVE',
      deletedAt: null,
    },
    orderBy: { viewsCount: 'desc' },
    take: limit,
    include: {
      photos: { orderBy: { sortOrder: 'asc' }, take: 1 },
      company: { select: { id: true, slug: true, displayName: true, ratingAvg: true } },
    },
  })
}
