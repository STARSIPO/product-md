import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getLegalContent } from '@/content/legal'
import { LegalDocumentPage, buildLegalMetadata } from '@/components/legal/legal-page'

/**
 * Terms of use.
 *
 * Static prose with no database access: the copy lives in `src/content/legal` rather
 * than in a CMS table, so it is versioned with the code and reviewed like code.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const doc = getLegalContent(locale).terms

  return buildLegalMetadata({
    title: doc.title,
    description: doc.description,
    segment: 'terms',
    locale,
  })
}

export default async function TermsPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const content = getLegalContent(locale)

  return (
    <LegalDocumentPage
      document={content.terms}
      locale={locale}
      segment="terms"
      labels={{
        home: t.nav.home,
        breadcrumb: t.a11y.breadcrumb,
        updatedTemplate: t.legal.lastUpdated,
        tableOfContents: content.ui.tableOfContents,
      }}
    />
  )
}
