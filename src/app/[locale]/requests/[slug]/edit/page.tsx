import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireBuyer } from '@/server/auth/guards'
import { db } from '@/server/db'
import { getRequestBySlug } from '@/server/services/requests'
import { getCategoryById } from '@/server/services/categories'
import { chisinauDayKey } from '@/lib/utils'
import type { AttributeValue } from '@/components/category/attribute-fields'
import {
  RequestWizard,
  type RequestDraftValues,
} from '@/components/request-form/request-wizard'

/**
 * Editing an existing request.
 *
 * Ownership is resolved by asking `getRequestBySlug` with the viewer's company id and
 * then comparing — a request that belongs to somebody else is a 404 here, not a 403,
 * so the edit URL cannot be used to probe which slugs exist.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.requestForm.editTitle, robots: { index: false, follow: false } }
}

export default async function EditRequestPage({
  params,
}: {
  params: { locale: string; slug: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireBuyer(locale, localePath(locale, 'requests', params.slug, 'edit'))

  const request = await getRequestBySlug(params.slug, user.companyId)
  if (!request || request.companyId !== user.companyId) notFound()

  const [category, districts, localities] = await Promise.all([
    getCategoryById(request.categoryId),
    db.district.findMany({
      select: { id: true, nameRu: true, nameRo: true },
      orderBy: locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' },
    }),
    db.locality.findMany({
      select: { id: true, districtId: true, nameRu: true, nameRo: true },
      orderBy: [{ isMajor: 'desc' }, locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' }],
      take: 2000,
    }),
  ])

  if (!category) notFound()

  const attributes: Record<string, AttributeValue> = {}
  for (const value of request.attributes) {
    attributes[value.attributeId] = {
      attributeId: value.attributeId,
      valueText: value.valueText ?? undefined,
      valueNumber: value.valueNumber ?? undefined,
      valueBool: value.valueBool ?? undefined,
      optionId: value.optionId ?? undefined,
    }
  }

  const existing: RequestDraftValues = {
    id: request.id,
    slug: request.slug,
    status: request.status,
    category: {
      id: category.id,
      name: category.names[locale],
      trail: category.trail.map((step) => step.name[locale]).join(' → '),
      defaultUnit: category.defaultUnit,
    },
    title: request.title,
    description: request.description ?? '',
    quantity: String(request.quantity),
    unit: request.unit,
    desiredPrice: request.desiredPriceBani === null ? '' : (request.desiredPriceBani / 100).toFixed(2),
    maxBudget: request.maxBudgetBani === null ? '' : (request.maxBudgetBani / 100).toFixed(2),
    isRecurring: request.isRecurring,
    frequency: request.frequency ?? 'WEEKLY',
    firstDeliveryAt: request.firstDeliveryAt ? chisinauDayKey(request.firstDeliveryAt) : '',
    offersDeadlineAt: request.offersDeadlineAt ? chisinauDayKey(request.offersDeadlineAt) : '',
    documentRequirements: request.documentRequirements ?? '',
    packagingRequirements: request.packagingRequirements ?? '',
    storageConditions: request.storageConditions ?? '',
    allowPartial: request.allowPartial,
    verifiedOnly: request.verifiedOnly,
    isUrgent: request.isUrgent,
    visibility: request.visibility,
    deliveryDistrictId: request.deliveryLocality?.districtId ?? '',
    deliveryLocalityId: request.deliveryLocalityId ?? '',
    deliveryAddress: request.deliveryAddress ?? '',
    supplierRadiusKm: request.supplierRadiusKm === null ? '' : String(request.supplierRadiusKm),
    attributes,
  }

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-h1">{t.requestForm.editTitle}</h1>

      <div className="mt-6">
        <RequestWizard
          districts={districts.map((district) => ({
            id: district.id,
            name: locale === 'ro' ? district.nameRo : district.nameRu,
          }))}
          localities={localities.map((locality) => ({
            id: locality.id,
            districtId: locality.districtId,
            name: locale === 'ro' ? locality.nameRo : locality.nameRu,
          }))}
          existing={existing}
          attachments={request.attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            sizeByte: attachment.sizeByte,
          }))}
        />
      </div>
    </div>
  )
}
