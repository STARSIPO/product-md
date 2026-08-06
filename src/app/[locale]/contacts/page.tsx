import type { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'

import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath, type CanonicalSegment } from '@/lib/i18n/config'
import { PLACEHOLDER, formatUpdated, getLegalContent, sectionId } from '@/content/legal'
import {
  LegalLinkCards,
  LegalPage,
  ProseSection,
  buildLegalMetadata,
} from '@/components/legal/legal-page'
import { Badge } from '@/components/ui'

/**
 * Contacts.
 *
 * There is deliberately no contact form here. Nothing on the server is wired to accept
 * one yet, and a form that silently discards a complaint is worse than no form: the
 * user believes they have been heard. Until the owner fills in the real addresses,
 * every channel below renders its `PLACEHOLDER` marker in plain sight, and the working
 * routes — help, publication rules, the in-app complaint buttons — are linked instead.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const doc = getLegalContent(locale).contacts

  return buildLegalMetadata({
    title: doc.title,
    description: doc.description,
    segment: 'contacts',
    locale,
  })
}

export default async function ContactsPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const content = getLegalContent(locale)
  const doc = content.contacts

  const toc = [
    { id: 'channels', label: doc.channelsHeading },
    ...doc.sections.map((section, index) => ({
      id: sectionId(index),
      label: section.heading,
    })),
  ]

  const targets: Record<(typeof doc.links)[number]['target'], CanonicalSegment> = {
    help: 'help',
    rules: 'rules',
    security: 'security',
    privacy: 'privacy',
  }

  return (
    <LegalPage
      title={doc.title}
      updated={doc.updated}
      updatedLabel={fmt(t.legal.lastUpdated, { date: formatUpdated(doc.updated, locale) })}
      intro={doc.intro}
      breadcrumbs={[
        { label: t.nav.home, href: localePath(locale) },
        { label: doc.title, href: localePath(locale, 'contacts') },
      ]}
      breadcrumbLabel={t.a11y.breadcrumb}
      toc={{ label: content.ui.tableOfContents, items: toc }}
    >
      {/* --------------------------------------------- honest placeholder notice */}
      <aside className="rounded-lg border border-warning/40 bg-warning-soft/40 p-4" role="note">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          {doc.placeholderNotice.heading}
        </h2>
        {doc.placeholderNotice.paragraphs.map((paragraph) => (
          <p key={paragraph} className="mt-2 text-sm leading-[1.7] text-muted-foreground">
            {paragraph}
          </p>
        ))}
      </aside>

      {/* ------------------------------------------------------------- channels */}
      <section id="channels" className="mt-10 scroll-mt-24">
        <h2 className="text-h3">{doc.channelsHeading}</h2>

        <dl className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {doc.channels.map((channel) => (
            <div key={channel.label} className="px-4 py-4 sm:flex sm:gap-6">
              <dt className="text-sm font-medium sm:w-56 sm:shrink-0">{channel.label}</dt>
              <dd className="mt-1.5 min-w-0 flex-1 sm:mt-0">
                {channel.isPlaceholder ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-caption font-semibold text-foreground">
                      {PLACEHOLDER}
                    </code>
                    <Badge variant="warning" size="sm">
                      {content.ui.placeholderBadge}
                    </Badge>
                  </p>
                ) : channel.hrefPrefix ? (
                  <a
                    href={`${channel.hrefPrefix}${channel.value}`}
                    className="text-sm font-medium text-primary hover:text-primary-hover"
                  >
                    {channel.value}
                  </a>
                ) : (
                  <p className="text-sm font-medium">{channel.value}</p>
                )}
                <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
                  {channel.note}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ------------------------------------------------------------- guidance */}
      <div className="mt-12 space-y-8">
        {doc.sections.map((section, index) => (
          <ProseSection key={section.heading} section={section} id={sectionId(index)} />
        ))}
      </div>

      <LegalLinkCards
        heading={doc.linksHeading}
        links={doc.links.map((link) => ({
          label: link.label,
          description: link.description,
          href: localePath(locale, targets[link.target]),
        }))}
      />
    </LegalPage>
  )
}
