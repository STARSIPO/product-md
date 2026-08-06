import type { Metadata } from 'next'
import { ChevronDown } from 'lucide-react'

import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatUpdated, getLegalContent, sectionId } from '@/content/legal'
import {
  LegalLinkCards,
  LegalPage,
  ProseSection,
  buildLegalMetadata,
} from '@/components/legal/legal-page'

/**
 * Help / FAQ.
 *
 * The accordion is `<details>`/`<summary>` and nothing else: it opens without
 * JavaScript, it is keyboard operable and screen-reader announced for free, browser
 * find-in-page can open a closed answer, and the whole page still works if the JS
 * bundle fails. A custom React accordion would cost bytes and give back nothing.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const doc = getLegalContent(locale).help

  return buildLegalMetadata({
    title: doc.title,
    description: doc.description,
    segment: 'help',
    locale,
  })
}

export default async function HelpPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const content = getLegalContent(locale)
  const doc = content.help

  const toc = doc.groups.map((group, index) => ({
    id: sectionId(index),
    label: group.title,
  }))

  return (
    <LegalPage
      title={doc.title}
      updated={doc.updated}
      updatedLabel={fmt(t.legal.lastUpdated, { date: formatUpdated(doc.updated, locale) })}
      intro={doc.intro}
      breadcrumbs={[
        { label: t.nav.home, href: localePath(locale) },
        { label: doc.title, href: localePath(locale, 'help') },
      ]}
      breadcrumbLabel={t.a11y.breadcrumb}
      toc={{ label: content.ui.tableOfContents, items: toc }}
    >
      <p className="text-caption text-muted-foreground">{content.ui.faqHint}</p>

      <div className="mt-6 space-y-10">
        {doc.groups.map((group, groupIndex) => (
          <section key={group.title} id={toc[groupIndex]?.id} className="scroll-mt-24">
            <h2 className="text-h3">{group.title}</h2>

            <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {group.items.map((item) => (
                <details key={item.question} className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">{item.question}</span>
                  </summary>
                  <div className="px-4 pb-4 pl-11">
                    {item.answer.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="mt-1.5 text-sm leading-[1.7] text-muted-foreground"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12">
        <ProseSection section={doc.outro} />
      </div>

      <LegalLinkCards
        heading={content.contacts.linksHeading}
        links={[
          {
            label: content.contacts.title,
            description: content.contacts.description,
            href: localePath(locale, 'contacts'),
          },
          {
            label: content.rules.title,
            description: content.rules.description,
            href: localePath(locale, 'rules'),
          },
          {
            label: content.terms.title,
            description: content.terms.description,
            href: localePath(locale, 'terms'),
          },
          {
            label: content.security.title,
            description: content.security.description,
            href: localePath(locale, 'security'),
          },
        ]}
      />
    </LegalPage>
  )
}
