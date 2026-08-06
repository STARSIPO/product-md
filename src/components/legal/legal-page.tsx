import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'

import { Breadcrumbs } from '@/components/ui'
import { formatUpdated, sectionId, type LegalDocument, type LegalSection } from '@/content/legal'
import { fmt } from '@/lib/i18n'
import { LOCALES, localePath, type CanonicalSegment, type Locale } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'

/**
 * Shared reading layout for the static/legal documents.
 *
 * Three decisions carry the whole thing:
 *
 *  - The prose column is capped at ~68 characters. Legal text is read linearly, and a
 *    line longer than that costs the reader the return sweep on every line.
 *  - The table of contents is a real `<nav>` of same-page anchors, sticky only from
 *    `lg` up. On a phone it renders inline above the text, where it doubles as a
 *    summary of what the document covers.
 *  - Nothing here contains a user-facing sentence: every string arrives as a prop from
 *    `src/content/legal/*`, so the Romanian page cannot silently inherit Russian copy.
 */

export interface TocItem {
  id: string
  label: string
}

export interface LegalPageProps {
  title: string
  /** ISO date (YYYY-MM-DD) — machine-readable half of the "updated" line. */
  updated: string
  /** Already formatted, e.g. "Обновлено: 5 августа 2026 г." */
  updatedLabel: string
  intro?: string
  breadcrumbs: { label: string; href?: string }[]
  breadcrumbLabel: string
  toc?: { label: string; items: TocItem[] }
  children: React.ReactNode
}

export function LegalPage({
  title,
  updated,
  updatedLabel,
  intro,
  breadcrumbs,
  breadcrumbLabel,
  toc,
  children,
}: LegalPageProps) {
  const hasToc = toc !== undefined && toc.items.length > 0

  return (
    <div className="container py-8 md:py-12">
      <Breadcrumbs items={breadcrumbs} label={breadcrumbLabel} className="mb-6" />

      <header className="max-w-[68ch]">
        <h1 className="text-h1 md:text-display">{title}</h1>
        <p className="mt-3 text-caption text-muted-foreground">
          <time dateTime={updated}>{updatedLabel}</time>
        </p>
        {intro ? (
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{intro}</p>
        ) : null}
      </header>

      <div
        className={cn(
          'mt-10',
          hasToc && 'lg:grid lg:grid-cols-[minmax(0,68ch)_15rem] lg:items-start lg:gap-12',
        )}
      >
        {hasToc ? (
          <nav
            aria-label={toc.label}
            className="order-2 mb-8 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-24 lg:mb-0 lg:bg-transparent lg:p-0 lg:pl-6"
          >
            <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              {toc.label}
            </h2>
            <ol className="mt-3 space-y-1.5">
              {toc.items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="block rounded text-sm leading-snug text-muted-foreground transition-colors hover:text-primary"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="order-1 min-w-0 max-w-[68ch]">{children}</div>
      </div>
    </div>
  )
}

/** A single `{ heading, paragraphs, list }` block rendered as readable prose. */
export function ProseSection({
  section,
  id,
  headingLevel = 2,
}: {
  section: LegalSection
  id?: string
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <section className="scroll-mt-24 border-t border-border pt-8 first:border-t-0 first:pt-0" id={id}>
      <Heading className={headingLevel === 2 ? 'text-h3' : 'text-base font-semibold'}>
        {section.heading}
      </Heading>

      {section.paragraphs.map((paragraph) => (
        <p key={paragraph} className="mt-4 leading-[1.75] text-muted-foreground">
          {paragraph}
        </p>
      ))}

      {section.list ? (
        <ul className="mt-4 space-y-2.5">
          {section.list.map((item) => (
            <li key={item} className="flex gap-2.5 leading-[1.7] text-muted-foreground">
              <Check className="mt-[5px] h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** Renders the full section list of a document, wiring the table-of-contents anchors. */
export function ProseSections({
  sections,
  ids,
}: {
  sections: readonly LegalSection[]
  ids?: readonly string[]
}) {
  return (
    <div className="space-y-8">
      {sections.map((section, index) => (
        <ProseSection key={section.heading} section={section} id={ids?.[index]} />
      ))}
    </div>
  )
}

export interface LegalDocumentLabels {
  /** Breadcrumb root, e.g. t.nav.home. */
  home: string
  /** Accessible name of the breadcrumb nav, e.g. t.a11y.breadcrumb. */
  breadcrumb: string
  /** Template with a {date} placeholder, e.g. t.legal.lastUpdated. */
  updatedTemplate: string
  /** Heading of the table of contents, from the content module. */
  tableOfContents: string
}

/**
 * Terms, privacy, publication rules, security and partners are structurally the same
 * document, so they share one renderer. Each route file stays a five-line server
 * component whose only job is picking which document to show.
 */
export function LegalDocumentPage({
  document: doc,
  locale,
  segment,
  labels,
  children,
}: {
  document: LegalDocument
  locale: Locale
  segment: CanonicalSegment
  labels: LegalDocumentLabels
  children?: React.ReactNode
}) {
  const toc = doc.sections.map((section, index) => ({
    id: sectionId(index),
    label: section.heading,
  }))

  return (
    <LegalPage
      title={doc.title}
      updated={doc.updated}
      updatedLabel={fmt(labels.updatedTemplate, { date: formatUpdated(doc.updated, locale) })}
      intro={doc.intro}
      breadcrumbs={[
        { label: labels.home, href: localePath(locale) },
        { label: doc.title, href: localePath(locale, segment) },
      ]}
      breadcrumbLabel={labels.breadcrumb}
      toc={{ label: labels.tableOfContents, items: toc }}
    >
      <ProseSections
        sections={doc.sections}
        ids={toc.map((item) => item.id)}
      />
      {children}
    </LegalPage>
  )
}

/**
 * Metadata for a static page: indexable, canonical to its own localized URL, with a
 * `languages` map so Google knows /ru/terms and /ro/termeni are the same document.
 */
export function buildLegalMetadata({
  title,
  description,
  segment,
  locale,
}: {
  title: string
  description: string
  segment: CanonicalSegment
  locale: Locale
}): Metadata {
  const languages: Record<string, string> = {}
  for (const other of LOCALES) languages[other] = localePath(other, segment)

  return {
    title,
    description,
    alternates: {
      canonical: localePath(locale, segment),
      languages: { ...languages, 'x-default': localePath('ru', segment) },
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url: localePath(locale, segment),
    },
    robots: { index: true, follow: true },
  }
}

/** Card of related pages, used at the bottom of the shorter documents. */
export function LegalLinkCards({
  heading,
  links,
}: {
  heading: string
  links: { label: string; description: string; href: string }[]
}) {
  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="text-h3">{heading}</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block h-full rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-primary-soft/30"
            >
              <span className="block text-sm font-medium">{link.label}</span>
              <span className="mt-1 block text-caption leading-relaxed text-muted-foreground">
                {link.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
