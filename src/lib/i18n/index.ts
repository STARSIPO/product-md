import { DEFAULT_LOCALE, isLocale, type Locale } from './config'
import type { Dictionary } from './messages/ru'

export type { Dictionary }
export * from './config'

/**
 * Dictionaries are loaded lazily so a page only ships the language it renders.
 *
 * Components read strings off the dictionary object directly (`t.home.heroTitle`)
 * rather than through a string-keyed lookup: a renamed or deleted key then becomes a
 * TypeScript error at build time instead of an "home.heroTitle" leaking into the UI.
 */
const loaders: Record<Locale, () => Promise<Dictionary>> = {
  ru: () => import('./messages/ru').then((m) => m.ru),
  ro: () => import('./messages/ro').then((m) => m.ro),
}

const cache = new Map<Locale, Dictionary>()

export async function getDictionary(locale: string | undefined): Promise<Dictionary> {
  const resolved: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE

  const cached = cache.get(resolved)
  if (cached) return cached

  const dictionary = await loaders[resolved]()
  cache.set(resolved, dictionary)
  return dictionary
}

export function resolveLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/**
 * Fills {placeholders} in a translated string.
 *
 *   fmt(t.errors.rateLimited, { seconds: 30 }) -> "Слишком много попыток. Повторите через 30 с."
 *
 * An unknown placeholder is left untouched rather than replaced with "undefined",
 * so a mistake degrades to visible-but-harmless instead of nonsense.
 */
export function fmt(
  template: string,
  params: Record<string, string | number | undefined> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

/**
 * Picks the best locale from an Accept-Language header.
 * Used only for the first visit, before the NEXT_LOCALE cookie exists.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...rest] = part.trim().split(';')
      const qPart = rest.find((chunk) => chunk.trim().startsWith('q='))
      const quality = qPart ? Number(qPart.trim().slice(2)) : 1
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 }
    })
    .sort((a, b) => b.quality - a.quality)

  for (const { tag } of ranked) {
    const base = tag.split('-')[0]
    if (base === 'ro' || base === 'md') return 'ro'
    if (base === 'ru') return 'ru'
  }

  return DEFAULT_LOCALE
}
