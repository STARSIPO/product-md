import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { env } from '@/env'
import { requireUser } from '@/server/auth/guards'
import { db } from '@/server/db'
import { OnboardingWizard } from './onboarding-wizard'

/**
 * Account setup.
 *
 * The one screen between signing up and being able to do anything, so it is kept as
 * short as the data model allows: a role, two names, and everything else optional.
 * A user who already has a company is sent straight on — this page has nothing left
 * to ask them.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.onboarding.title, robots: { index: false, follow: false } }
}

export default async function OnboardingPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireUser(locale, localePath(locale, 'onboarding'))
  if (user.companyId) redirect(localePath(locale, 'dashboard'))

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
      <h1 className="text-h1">{t.onboarding.title}</h1>

      <div className="mt-6">
        <OnboardingWizard
          districts={districts.map((district) => ({
            id: district.id,
            name: locale === 'ro' ? district.nameRo : district.nameRu,
          }))}
          localities={localities.map((locality) => ({
            id: locality.id,
            districtId: locality.districtId,
            name: locale === 'ro' ? locality.nameRo : locality.nameRu,
          }))}
          trialDays={env.SELLER_TRIAL_DAYS}
        />
      </div>
    </div>
  )
}
