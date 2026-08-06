import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getLegalContent } from '@/content/legal'
import { LegalDocumentPage, buildLegalMetadata } from '@/components/legal/legal-page'

/** Publication rules — the practical half of the terms, written for people who post. */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const doc = getLegalContent(locale).rules

  return buildLegalMetadata({
    title: doc.title,
    description: doc.description,
    segment: 'rules',
    locale,
  })
}

export default async function RulesPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const content = getLegalContent(locale)

  return (
    <LegalDocumentPage
      document={content.rules}
      locale={locale}
      segment="rules"
      labels={{
        home: t.nav.home,
        breadcrumb: t.a11y.breadcrumb,
        updatedTemplate: t.legal.lastUpdated,
        tableOfContents: content.ui.tableOfContents,
      }}
    />
  )
}
