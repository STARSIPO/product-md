import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getLegalContent } from '@/content/legal'
import { LegalDocumentPage, buildLegalMetadata } from '@/components/legal/legal-page'

/** Privacy policy — what is collected, why, for how long, and how to get it back. */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const doc = getLegalContent(locale).privacy

  return buildLegalMetadata({
    title: doc.title,
    description: doc.description,
    segment: 'privacy',
    locale,
  })
}

export default async function PrivacyPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const content = getLegalContent(locale)

  return (
    <LegalDocumentPage
      document={content.privacy}
      locale={locale}
      segment="privacy"
      labels={{
        home: t.nav.home,
        breadcrumb: t.a11y.breadcrumb,
        updatedTemplate: t.legal.lastUpdated,
        tableOfContents: content.ui.tableOfContents,
      }}
    />
  )
}
