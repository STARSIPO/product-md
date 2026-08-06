import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireBuyer } from '@/server/auth/guards'
import { db } from '@/server/db'
import { RequestWizard } from '@/components/request-form/request-wizard'

/**
 * "Create a request" — free, unmoderated and instant by design. Demand is the scarce
 * side of this marketplace, so nothing stands between a buyer and a published need.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.requestForm.createTitle, robots: { index: false, follow: false } }
}

export default async function NewRequestPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  await requireBuyer(locale, localePath(locale, 'requests', 'new'))

  const [districts, localities] = await Promise.all([
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

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="text-h1">{t.requestForm.createTitle}</h1>

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
          existing={null}
          attachments={[]}
        />
      </div>
    </div>
  )
}
