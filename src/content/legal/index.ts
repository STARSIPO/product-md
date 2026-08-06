import { LOCALE_TAGS, type Locale } from '@/lib/i18n/config'
import { ru, type LegalContentShape } from './ru'
import { ro } from './ro'

export type {
  ContactChannel,
  ContactsDocument,
  FaqGroup,
  FaqItem,
  HelpDocument,
  LegalContent,
  LegalContentShape,
  LegalDocument,
  LegalSection,
  LegalUiLabels,
} from './ru'

export { PLACEHOLDER } from './ru'

/**
 * Legal/static content per locale.
 *
 * Unlike the UI dictionary these documents are short enough that both languages can be
 * imported eagerly: they are plain data, they are needed by `generateMetadata` and the
 * page body in the same render, and an async loader here would buy nothing but a
 * `await` at every call site.
 */
const CONTENT: Record<Locale, LegalContentShape> = { ru, ro }

export function getLegalContent(locale: Locale): LegalContentShape {
  return CONTENT[locale]
}

/**
 * Stable anchor id for a section, used by the table of contents.
 *
 * Deliberately positional rather than derived from the heading: headings are Cyrillic
 * or Romanian prose, and slugifying them would produce either transliteration guesswork
 * or percent-encoded ids that differ between the two languages. Positional ids keep
 * `/ru/terms#section-5` and `/ro/termeni#section-5` pointing at the same clause.
 */
export function sectionId(index: number): string {
  return `section-${index + 1}`
}

/**
 * "2026-08-05" -> "5 августа 2026 г." / "5 august 2026".
 *
 * Parsed as UTC midnight on purpose: a bare `new Date('2026-08-05')` is already UTC,
 * and formatting it in the server's local zone could render the previous day west of
 * Greenwich. The document date is a calendar fact, not a moment in time.
 */
export function formatUpdated(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso

  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
