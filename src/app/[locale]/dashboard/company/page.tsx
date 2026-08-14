import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { decodeJson, decodeStringArray } from '@/lib/json'
import { workingHoursSchema } from '@/lib/validation'
import { requireCompany } from '@/server/auth/guards'
import { db } from '@/server/db'
import { storage } from '@/server/storage'
import {
  CompanyForm,
  DEFAULT_WORKING_HOURS,
  type CompanyFormValues,
  type WorkingHoursDraft,
} from './company-form'

/**
 * The company profile editor.
 *
 * Reads are scoped to the company the session belongs to — `requireCompany` resolves
 * that id from the database, so there is no company parameter for a caller to swap.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.company.profileTitle, robots: { index: false, follow: false } }
}

/** Integer bani back into something an <input> can hold without inventing precision. */
function baniToInput(bani: number): string {
  if (bani <= 0) return ''
  return bani % 100 === 0 ? String(bani / 100) : (bani / 100).toFixed(2)
}

/**
 * The same, for a nullable column where zero is a genuine answer.
 *
 * `minOrderBani` defaults to 0 and means "no minimum", so `baniToInput` blanks it. A
 * retail delivery fee of 0 means "we deliver free" and must survive a round trip
 * through the form, which is why it cannot share that function.
 */
function nullableBaniToInput(bani: number | null): string {
  if (bani === null) return ''
  return bani % 100 === 0 ? String(bani / 100) : (bani / 100).toFixed(2)
}

export default async function DashboardCompanyPage({
  params,
}: {
  params: { locale: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireCompany(locale, localePath(locale, 'dashboard', 'company'))

  const [company, districts, localities] = await Promise.all([
    db.company.findUnique({
      where: { id: user.companyId },
      include: { photos: { orderBy: { sortOrder: 'asc' } } },
    }),
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

  if (!company) notFound()

  const workingHours: WorkingHoursDraft = decodeJson(
    company.workingHours,
    workingHoursSchema,
    DEFAULT_WORKING_HOURS,
  )

  const initial: CompanyFormValues = {
    legalName: company.legalName,
    displayName: company.displayName,
    idno: company.idno ?? '',
    orgType: company.orgType,
    description: company.description ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    website: company.website ?? '',
    contactPerson: company.contactPerson ?? '',
    districtId: company.districtId ?? '',
    localityId: company.localityId ?? '',
    address: company.address ?? '',
    deliveryTerms: company.deliveryTerms ?? '',
    minOrder: baniToInput(company.minOrderBani),
    pickupAvailable: company.pickupAvailable,
    isBuyer: company.isBuyer,
    isSeller: company.isSeller,
    languages: decodeStringArray(company.languages),
    paymentMethods: decodeStringArray(company.paymentMethods),
    deliveryZones: decodeStringArray(company.deliveryZones),
    workingHours,
    kind: company.kind,
    isRetail: company.isRetail,
    // NULL means "not set" and has to come back as an empty input, not as "0" — a shop
    // that never named a delivery fee is not a shop that delivers for nothing.
    retailDeliveryFee: nullableBaniToInput(company.retailDeliveryFeeBani),
    retailFreeFrom: nullableBaniToInput(company.retailFreeFromBani),
    retailNote: company.retailDeliveryNote ?? '',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-h1">{t.company.profileTitle}</h1>

      <CompanyForm
        districts={districts.map((district) => ({
          id: district.id,
          name: locale === 'ro' ? district.nameRo : district.nameRu,
        }))}
        localities={localities.map((locality) => ({
          id: locality.id,
          districtId: locality.districtId,
          name: locale === 'ro' ? locality.nameRo : locality.nameRu,
        }))}
        initial={initial}
        initialLogoUrl={company.logoKey ? storage.publicUrl(company.logoKey) : null}
        initialPhotos={company.photos.map((photo) => ({
          id: photo.id,
          url: storage.publicUrl(photo.key),
        }))}
        publicHref={localePath(locale, 'suppliers', company.slug)}
      />
    </div>
  )
}
