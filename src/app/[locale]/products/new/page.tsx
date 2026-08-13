import type { Metadata } from 'next'

import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath, LOCALE_TAGS } from '@/lib/i18n/config'
import { requireSeller } from '@/server/auth/guards'
import { db } from '@/server/db'
import { isEnabled } from '@/server/services/feature-flags'
import {
  ProductWizard,
  type DistrictOption,
  type DocumentOption,
} from '@/components/product-form/product-wizard'
// Not from `product-wizard`: that module is `'use client'`, and a value imported across
// the boundary arrives here as a client reference rather than the function itself.
import { emptyWizardValues } from '@/components/product-form/wizard-values'

/**
 * «Разместить товар».
 *
 * A server component does the three things the wizard cannot: it proves the visitor is
 * a seller with a company, reads the district list and the company's approved documents
 * straight from the database, and resolves the moderation flag that decides whether the
 * final button says "publish" or "send for review".
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.productForm.createTitle, robots: { index: false, follow: false } }
}

export default async function NewProductPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const user = await requireSeller(locale, localePath(locale, 'products', 'new'))

  const [districtRows, documentRows, company, requireModeration] = await Promise.all([
    db.district.findMany({ select: { id: true, nameRu: true, nameRo: true } }),
    db.document.findMany({
      where: { companyId: user.companyId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, number: true, expiresAt: true, isPublic: true },
    }),
    db.company.findUnique({
      where: { id: user.companyId },
      select: {
        displayName: true,
        district: { select: { nameRu: true, nameRo: true } },
        locality: { select: { nameRu: true, nameRo: true } },
      },
    }),
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

  const location = [
    locale === 'ro' ? company?.locality?.nameRo : company?.locality?.nameRu,
    locale === 'ro' ? company?.district?.nameRo : company?.district?.nameRu,
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ')

  return (
    <ProductWizard
      mode="create"
      districts={districts}
      documents={documents}
      requireModeration={requireModeration}
      company={{
        displayName: company?.displayName ?? user.companyName ?? '',
        location: location === '' ? null : location,
      }}
      initialCategory={null}
      initialValues={emptyWizardValues()}
      initialAttributes={{}}
    />
  )
}
