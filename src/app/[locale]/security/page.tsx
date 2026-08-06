import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getLegalContent } from '@/content/legal'
import { LegalDocumentPage, buildLegalMetadata } from '@/components/legal/legal-page'

/**
 * Security page.
 *
 * Written in plain language on purpose: the audience is a restaurant owner deciding
 * whether to upload a veterinary certificate, not a security engineer. The
 * engineering-level detail lives in docs/SECURITY.md.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const doc = getLegalContent(locale).security

  return buildLegalMetadata({
    title: doc.title,
    description: doc.description,
    segment: 'security',
    locale,
  })
}

export default async function SecurityPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const content = getLegalContent(locale)

  return (
    <LegalDocumentPage
      document={content.security}
      locale={locale}
      segment="security"
      labels={{
        home: t.nav.home,
        breadcrumb: t.a11y.breadcrumb,
        updatedTemplate: t.legal.lastUpdated,
        tableOfContents: content.ui.tableOfContents,
      }}
    />
  )
}
