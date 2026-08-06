import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getLegalContent } from '@/content/legal'
import { LegalDocumentPage, buildLegalMetadata } from '@/components/legal/legal-page'

/** Partners page — associations, distributors, logistics, media and integrators. */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const doc = getLegalContent(locale).partners

  return buildLegalMetadata({
    title: doc.title,
    description: doc.description,
    segment: 'partners',
    locale,
  })
}

export default async function PartnersPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const content = getLegalContent(locale)

  return (
    <LegalDocumentPage
      document={content.partners}
      locale={locale}
      segment="partners"
      labels={{
        home: t.nav.home,
        breadcrumb: t.a11y.breadcrumb,
        updatedTemplate: t.legal.lastUpdated,
        tableOfContents: content.ui.tableOfContents,
      }}
    />
  )
}
