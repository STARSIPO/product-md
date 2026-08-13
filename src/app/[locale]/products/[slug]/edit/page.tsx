import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath, LOCALE_TAGS, type Locale } from '@/lib/i18n/config'
import { decodeStringArray } from '@/lib/json'
import { AVAILABILITY, UNITS, type Availability, type Unit } from '@/lib/constants'
import { requireSeller } from '@/server/auth/guards'
import { db } from '@/server/db'
import { storage } from '@/server/storage'
import { getProductBySlug } from '@/server/services/products'
import { getCategoryById } from '@/server/services/categories'
import { isEnabled } from '@/server/services/feature-flags'
import type { AttributeValue } from '@/components/category/attribute-fields'
import type { PickedCategory } from '@/components/category/category-picker'
import {
  ProductWizard,
  type DistrictOption,
  type DocumentOption,
} from '@/components/product-form/product-wizard'
// Not from `product-wizard`: that module is `'use client'`, and a value imported across
// the boundary arrives here as a client reference rather than the function itself.
import { emptyWizardValues, type WizardValues } from '@/components/product-form/wizard-values'

/**
 * Editing an existing listing.
 *
 * The route is `products/[slug]/edit`, not `products/[id]/edit`: the App Router forbids
 * two different dynamic parameter names at the same path level and `products/[slug]`
 * already exists.
 *
 * Everything the wizard receives is rebuilt from the stored row — bani back into the
 * "95.50" the seller will edit, the JSON region column back into an array, photo keys
 * back into public URLs — so the form the seller reopens is the listing they published.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.productForm.editTitle, robots: { index: false, follow: false } }
}

/** Integer bani back into the decimal string the price input works with. */
function baniToInput(bani: number | null): string {
  if (bani === null) return ''
  return (bani / 100).toFixed(2)
}

function dateToInput(value: Date | null): string {
  return value === null ? '' : value.toISOString().slice(0, 10)
}

function toUnit(value: string): Unit {
  return (UNITS as readonly string[]).includes(value) ? (value as Unit) : 'KG'
}

function toAvailability(value: string): Availability {
  return (AVAILABILITY as readonly string[]).includes(value)
    ? (value as Availability)
    : 'IN_STOCK'
}

export default async function EditProductPage({
  params,
}: {
  params: { locale: string; slug: string }
}) {
  const locale = resolveLocale(params.locale)
  const user = await requireSeller(
    locale,
    localePath(locale, 'products', params.slug, 'edit'),
  )

  const product = await getProductBySlug(params.slug, user.companyId)
  // Staff moderate through their own surface; this page only ever edits your own listing.
  if (!product || product.companyId !== user.companyId || product.deletedAt) notFound()

  const [districtRows, documentRows, attachedDocuments, categoryNode, requireModeration] =
    await Promise.all([
      db.district.findMany({ select: { id: true, nameRu: true, nameRo: true } }),
      db.document.findMany({
        where: { companyId: user.companyId, status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, number: true, expiresAt: true, isPublic: true },
      }),
      db.productDocument.findMany({
        where: { productId: product.id },
        select: { documentId: true },
      }),
      getCategoryById(product.categoryId),
      isEnabled('REQUIRE_MODERATION'),
    ])

  const districts: DistrictOption[] = districtRows
    .map((district) => ({
      id: district.id,
      name: locale === 'ro' ? district.nameRo : district.nameRu,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, LOCALE_TAGS[locale]))

  const documents: DocumentOption[] = documentRows.map((document) => ({
    id: document.id,
    type: document.type,
    number: document.number,
    expiresAt: document.expiresAt?.toISOString() ?? null,
    isPublic: document.isPublic,
  }))

  const initialCategory: PickedCategory | null = categoryNode
    ? {
        id: categoryNode.id,
        name: categoryNode.names[locale],
        trail: categoryNode.trail.map((step) => step.name[locale]).join(' → '),
        defaultUnit: categoryNode.defaultUnit,
      }
    : null

  const initialAttributes: Record<string, AttributeValue> = {}
  for (const row of product.attributes) {
    initialAttributes[row.attributeId] = {
      attributeId: row.attributeId,
      valueText: row.valueText ?? (row.valueDate ? dateToInput(row.valueDate) : undefined),
      valueNumber: row.valueNumber ?? undefined,
      valueBool: row.valueBool ?? undefined,
      optionId: row.optionId ?? undefined,
    }
  }

  const initialValues: WizardValues = {
    ...emptyWizardValues(),
    title: product.title,
    description: product.description ?? '',
    priceBani: baniToInput(product.priceBani),
    currency: product.currency,
    unit: toUnit(product.unit),
    minOrderQty: String(product.minOrderQty),
    availableQty: product.availableQty === null ? '' : String(product.availableQty),
    availability: toAvailability(product.availability),
    priceTiers: product.priceTiers.map((tier) => ({
      minQty: String(tier.minQty),
      maxQty: tier.maxQty === null ? '' : String(tier.maxQty),
      priceBani: baniToInput(tier.priceBani),
    })),
    originCountry: product.originCountry ?? '',
    productionPlace: product.productionPlace ?? '',
    manufacturer: product.manufacturer ?? '',
    batchNumber: product.batchNumber ?? '',
    producedAt: dateToInput(product.producedAt),
    bestBefore: dateToInput(product.bestBefore),
    storageConditions: product.storageConditions ?? '',
    storageTempC: product.storageTempC ?? '',
    allergens: product.allergens ?? '',
    composition: product.composition ?? '',
    packaging: product.packaging ?? '',
    supplyRegularity: product.supplyRegularity ?? '',
    deliveryTerms: product.deliveryTerms ?? '',
    deliveryPriceBani: baniToInput(product.deliveryPriceBani),
    pickupAvailable: product.pickupAvailable,
    deliveryRegions: decodeStringArray(product.deliveryRegions),
    videoUrl: product.videoUrl ?? '',
    photos: product.photos.map((photo) => ({
      key: photo.key,
      url: storage.publicUrl(photo.key),
    })),
    documentIds: attachedDocuments.map((row) => row.documentId),
  }

  const location = buildLocation(product.company, locale)

  return (
    <ProductWizard
      mode="edit"
      productId={product.id}
      districts={districts}
      documents={documents}
      requireModeration={requireModeration}
      company={{ displayName: product.company.displayName, location }}
      initialCategory={initialCategory}
      initialValues={initialValues}
      initialAttributes={initialAttributes}
    />
  )
}

function buildLocation(
  company: {
    district: { nameRu: string; nameRo: string } | null
    locality: { nameRu: string; nameRo: string } | null
  },
  locale: Locale,
): string | null {
  const parts = [
    locale === 'ro' ? company.locality?.nameRo : company.locality?.nameRu,
    locale === 'ro' ? company.district?.nameRo : company.district?.nameRu,
  ].filter((part): part is string => Boolean(part))

  return parts.length === 0 ? null : parts.join(', ')
}
