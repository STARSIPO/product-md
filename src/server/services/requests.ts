import 'server-only'
import type { Prisma } from '@prisma/client'
import { db, transaction } from '@/server/db'
import { DomainError } from '@/server/actions/result'
import { normalize, slugify } from '@/lib/normalize'
import { REQUEST_OPEN_STATUSES } from '@/lib/constants'
import type { PurchaseRequestInput } from '@/lib/validation'
import { getCategoryAttributes } from './categories'
import { notifyCompany } from './notifications'

/**
 * Buyer purchase requests (RFQs).
 *
 * This is the half of the marketplace that a classifieds board does not have: instead
 * of browsing supply, a buyer states demand and suppliers come to them. Everything
 * here therefore optimises for "describe the need once, reach every relevant supplier".
 */

async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`
    const existing = await db.purchaseRequest.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing || existing.id === excludeId) return candidate
  }

  return `${base}-${Date.now().toString(36)}`
}

async function buildSearchText(
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

  return normalize(
    [
      title,
      description ?? '',
      ...(category?.translations.map((translation) => translation.name) ?? []),
      ...synonyms.map((synonym) => synonym.term),
    ].join(' '),
  )
}

async function sanitizeAttributes(
  categoryId: string,
  values: PurchaseRequestInput['attributes'],
): Promise<Prisma.RequestAttributeValueCreateManyRequestInput[]> {
  if (!values || values.length === 0) return []

  const allowed = await getCategoryAttributes(categoryId, 'ru', 'REQUEST')
  const allowedById = new Map(allowed.map((attribute) => [attribute.id, attribute]))

  const out: Prisma.RequestAttributeValueCreateManyRequestInput[] = []

  for (const value of values) {
    const attribute = allowedById.get(value.attributeId)
    if (!attribute) continue

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

export async function createRequest(
  companyId: string,
  input: PurchaseRequestInput,
  options: { publish: boolean },
): Promise<{ id: string; slug: string; status: string }> {
  const category = await db.category.findUnique({
    where: { id: input.categoryId },
    select: { id: true, isActive: true },
  })
  if (!category?.isActive) throw new DomainError('validation')

  const [slug, searchText, attributes] = await Promise.all([
    uniqueSlug(input.title),
    buildSearchText(input.title, input.description ?? null, input.categoryId),
    sanitizeAttributes(input.categoryId, input.attributes),
  ])

  // Requests are free and carry no listing risk, so they publish without moderation.
  // Abuse is handled reactively through complaints, which keeps the buyer flow instant.
  const status = options.publish ? 'ACTIVE' : 'DRAFT'

  const created = await transaction(async (tx) => {
    const request = await tx.purchaseRequest.create({
      data: {
        companyId,
        categoryId: input.categoryId,
        slug,
        title: input.title,
        description: input.description ?? null,
        quantity: input.quantity,
        unit: input.unit,
        desiredPriceBani: input.desiredPriceBani ?? null,
        maxBudgetBani: input.maxBudgetBani ?? null,
        isRecurring: input.isRecurring ?? false,
        frequency: input.frequency ?? null,
        firstDeliveryAt: input.firstDeliveryAt ?? null,
        offersDeadlineAt: input.offersDeadlineAt ?? null,
        deliveryLocalityId: input.deliveryLocalityId ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
        supplierRadiusKm: input.supplierRadiusKm ?? null,
        documentRequirements: input.documentRequirements ?? null,
        packagingRequirements: input.packagingRequirements ?? null,
        storageConditions: input.storageConditions ?? null,
        allowPartial: input.allowPartial ?? false,
        verifiedOnly: input.verifiedOnly ?? false,
        isUrgent: input.isUrgent ?? false,
        visibility: input.visibility,
        status,
        searchText,
      },
      select: { id: true, slug: true, status: true },
    })

    if (attributes.length > 0) {
      await tx.requestAttributeValue.createMany({
        data: attributes.map((attribute) => ({ ...attribute, requestId: request.id })),
      })
    }

    return request
  })

  if (created.status === 'ACTIVE' && input.visibility === 'PUBLIC') {
    void notifyMatchingSuppliers(created.id, input.categoryId, input.title, companyId)
  }

  return created
}

/**
 * Tells suppliers who sell in this category that a matching request appeared.
 *
 * Matching is category-based rather than keyword-based on purpose: a supplier that
 * has an active listing in the category has already demonstrated they can fulfil it,
 * which is a far better signal than a text match on the request title.
 */
async function notifyMatchingSuppliers(
  requestId: string,
  categoryId: string,
  title: string,
  buyerCompanyId: string,
): Promise<void> {
  try {
    const { getSubtreeIds } = await import('./categories')
    const categoryIds = await getSubtreeIds(categoryId)

    const suppliers = await db.company.findMany({
      where: {
        id: { not: buyerCompanyId },
        status: 'ACTIVE',
        isSeller: true,
        products: {
          some: { categoryId: { in: categoryIds }, status: 'ACTIVE', deletedAt: null },
        },
      },
      select: { id: true },
      take: 200,
    })

    const category = await db.category.findUnique({
      where: { id: categoryId },
      include: { translations: { where: { locale: 'ru' }, select: { name: true } } },
    })

    await Promise.all(
      suppliers.map((supplier) =>
        notifyCompany(supplier.id, {
          type: 'NEW_REQUEST_MATCH',
          params: { category: category?.translations[0]?.name ?? '', title },
          entityType: 'REQUEST',
          entityId: requestId,
        }),
      ),
    )
  } catch {
    // A failed fan-out must not fail the request that was just created.
  }
}

export async function updateRequest(
  requestId: string,
  input: PurchaseRequestInput,
  options: { publish: boolean },
): Promise<{ id: string; slug: string }> {
  const existing = await db.purchaseRequest.findUnique({
    where: { id: requestId },
    select: { id: true, slug: true, title: true, status: true },
  })
  if (!existing) throw new DomainError('notFound')

  const [searchText, attributes] = await Promise.all([
    buildSearchText(input.title, input.description ?? null, input.categoryId),
    sanitizeAttributes(input.categoryId, input.attributes),
  ])

  const slug =
    existing.title === input.title ? existing.slug : await uniqueSlug(input.title, existing.id)

  return transaction(async (tx) => {
    const updated = await tx.purchaseRequest.update({
      where: { id: requestId },
      data: {
        categoryId: input.categoryId,
        slug,
        title: input.title,
        description: input.description ?? null,
        quantity: input.quantity,
        unit: input.unit,
        desiredPriceBani: input.desiredPriceBani ?? null,
        maxBudgetBani: input.maxBudgetBani ?? null,
        isRecurring: input.isRecurring ?? false,
        frequency: input.frequency ?? null,
        firstDeliveryAt: input.firstDeliveryAt ?? null,
        offersDeadlineAt: input.offersDeadlineAt ?? null,
        deliveryLocalityId: input.deliveryLocalityId ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
        supplierRadiusKm: input.supplierRadiusKm ?? null,
        documentRequirements: input.documentRequirements ?? null,
        packagingRequirements: input.packagingRequirements ?? null,
        storageConditions: input.storageConditions ?? null,
        allowPartial: input.allowPartial ?? false,
        verifiedOnly: input.verifiedOnly ?? false,
        isUrgent: input.isUrgent ?? false,
        visibility: input.visibility,
        searchText,
        ...(options.publish && existing.status === 'DRAFT' ? { status: 'ACTIVE' } : {}),
      },
      select: { id: true, slug: true },
    })

    await tx.requestAttributeValue.deleteMany({ where: { requestId } })
    if (attributes.length > 0) {
      await tx.requestAttributeValue.createMany({
        data: attributes.map((attribute) => ({ ...attribute, requestId })),
      })
    }

    return updated
  })
}

export async function setRequestStatus(
  requestId: string,
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED',
): Promise<void> {
  await db.purchaseRequest.update({ where: { id: requestId }, data: { status } })
}

export async function softDeleteRequest(requestId: string): Promise<void> {
  await db.purchaseRequest.update({
    where: { id: requestId },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
}

/** "Repeat purchase" — clones a finished request back into a draft. */
export async function duplicateRequest(requestId: string, companyId: string): Promise<string> {
  const source = await db.purchaseRequest.findFirst({
    where: { id: requestId, companyId },
    include: { attributes: true },
  })
  if (!source) throw new DomainError('notFound')

  const slug = await uniqueSlug(source.title)

  return transaction(async (tx) => {
    const created = await tx.purchaseRequest.create({
      data: {
        companyId,
        categoryId: source.categoryId,
        slug,
        title: source.title,
        description: source.description,
        quantity: source.quantity,
        unit: source.unit,
        desiredPriceBani: source.desiredPriceBani,
        maxBudgetBani: source.maxBudgetBani,
        isRecurring: source.isRecurring,
        frequency: source.frequency,
        deliveryLocalityId: source.deliveryLocalityId,
        deliveryAddress: source.deliveryAddress,
        supplierRadiusKm: source.supplierRadiusKm,
        documentRequirements: source.documentRequirements,
        packagingRequirements: source.packagingRequirements,
        storageConditions: source.storageConditions,
        allowPartial: source.allowPartial,
        verifiedOnly: source.verifiedOnly,
        visibility: source.visibility,
        searchText: source.searchText,
        status: 'DRAFT',
      },
      select: { id: true },
    })

    if (source.attributes.length > 0) {
      await tx.requestAttributeValue.createMany({
        data: source.attributes.map((attribute) => ({
          requestId: created.id,
          attributeId: attribute.attributeId,
          valueText: attribute.valueText,
          valueNumber: attribute.valueNumber,
          valueBool: attribute.valueBool,
          valueDate: attribute.valueDate,
          optionId: attribute.optionId,
        })),
      })
    }

    return created.id
  })
}

// --- reads -------------------------------------------------------------------

export const REQUEST_DETAIL_INCLUDE = {
  category: { include: { translations: true } },
  deliveryLocality: { include: { district: true } },
  attachments: true,
  attributes: {
    include: {
      attribute: { include: { translations: true } },
    },
  },
  company: {
    include: {
      district: true,
      locality: true,
      badges: { where: { status: 'APPROVED' } },
    },
  },
} satisfies Prisma.PurchaseRequestInclude

/**
 * A request by slug.
 *
 * Note what is NOT included: offers. The public page shows a count and nothing more —
 * offer contents are only ever read through src/server/services/offers.ts, which
 * scopes every query to a viewer.
 */
export async function getRequestBySlug(slug: string, viewerCompanyId: string | null) {
  const request = await db.purchaseRequest.findFirst({
    where: { slug, deletedAt: null },
    include: REQUEST_DETAIL_INCLUDE,
  })

  if (!request) return null

  const isOwner = viewerCompanyId !== null && request.companyId === viewerCompanyId
  if (!isOwner) {
    if (request.visibility !== 'PUBLIC') return null
    if (request.status === 'DRAFT') return null
  }

  return request
}

export async function listCompanyRequests(
  companyId: string,
  options: { status?: string; page?: number; pageSize?: number } = {},
) {
  const { status, page = 1, pageSize = 20 } = options
  const where: Prisma.PurchaseRequestWhereInput = {
    companyId,
    deletedAt: null,
    ...(status ? { status } : {}),
  }

  const [total, items] = await Promise.all([
    db.purchaseRequest.count({ where }),
    db.purchaseRequest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: { include: { translations: true } } },
    }),
  ])

  return { items, total }
}

export async function recordRequestView(requestId: string): Promise<void> {
  await db.purchaseRequest
    .update({ where: { id: requestId }, data: { viewsCount: { increment: 1 } } })
    .catch(() => undefined)
}

/** Closes requests whose offer deadline has passed. Part of the daily job. */
export async function expireRequests(): Promise<number> {
  const result = await db.purchaseRequest.updateMany({
    where: {
      offersDeadlineAt: { lt: new Date() },
      status: { in: [...REQUEST_OPEN_STATUSES] },
    },
    data: { status: 'EXPIRED' },
  })
  return result.count
}
