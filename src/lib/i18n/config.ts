/**
 * Locale + localized-URL configuration.
 *
 * Public URLs are translated, not just prefixed: /ru/products and /ro/produse are the
 * same route. The middleware rewrites the localized segment back to its canonical
 * form so the App Router only ever sees one folder structure, and `localePath()`
 * renders links the other way round. That keeps one page component per route while
 * still giving each language its own indexable URLs.
 */

export const LOCALES = ['ru', 'ro'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ru'

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value)
}

/** BCP-47 tags used for Intl formatting and the `lang` attribute. */
export const LOCALE_TAGS: Record<Locale, string> = {
  ru: 'ru-MD',
  ro: 'ro-MD',
}

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: 'Русский',
  ro: 'Română',
}

/**
 * canonical segment -> per-locale segment.
 * The canonical name matches the folder name under src/app/[locale]/.
 */
export const ROUTE_SEGMENTS = {
  products: { ru: 'products', ro: 'produse' },
  category: { ru: 'category', ro: 'categorie' },
  suppliers: { ru: 'suppliers', ro: 'furnizori' },
  requests: { ru: 'requests', ro: 'cereri' },
  search: { ru: 'search', ro: 'cautare' },
  favorites: { ru: 'favorites', ro: 'favorite' },
  messages: { ru: 'messages', ro: 'mesaje' },
  notifications: { ru: 'notifications', ro: 'notificari' },
  dashboard: { ru: 'dashboard', ro: 'cabinet' },
  deals: { ru: 'deals', ro: 'tranzactii' },
  offers: { ru: 'offers', ro: 'oferte' },
  balance: { ru: 'balance', ro: 'balanta' },
  pricing: { ru: 'pricing', ro: 'tarife' },
  verification: { ru: 'verification', ro: 'verificare' },
  analytics: { ru: 'analytics', ro: 'analiza' },
  settings: { ru: 'settings', ro: 'setari' },
  login: { ru: 'login', ro: 'autentificare' },
  register: { ru: 'register', ro: 'inregistrare' },
  logout: { ru: 'logout', ro: 'iesire' },
  onboarding: { ru: 'onboarding', ro: 'configurare' },
  new: { ru: 'new', ro: 'nou' },
  help: { ru: 'help', ro: 'ajutor' },
  contacts: { ru: 'contacts', ro: 'contacte' },
  terms: { ru: 'terms', ro: 'termeni' },
  privacy: { ru: 'privacy', ro: 'confidentialitate' },
  rules: { ru: 'rules', ro: 'reguli' },
  security: { ru: 'security', ro: 'securitate' },
  partners: { ru: 'partners', ro: 'parteneri' },
  admin: { ru: 'admin', ro: 'admin' },
  moderation: { ru: 'moderation', ro: 'moderare' },
} as const satisfies Record<string, Record<Locale, string>>

export type CanonicalSegment = keyof typeof ROUTE_SEGMENTS

/** Reverse lookup: localized segment -> canonical, per locale. Built once at module load. */
const REVERSE_SEGMENTS: Record<Locale, Map<string, string>> = {
  ru: new Map(),
  ro: new Map(),
}

for (const [canonical, translations] of Object.entries(ROUTE_SEGMENTS)) {
  for (const locale of LOCALES) {
    REVERSE_SEGMENTS[locale].set(translations[locale], canonical)
  }
}

/** "produse" + "ro" -> "products". Unknown segments (slugs, ids) pass through. */
export function toCanonicalSegment(segment: string, locale: Locale): string {
  return REVERSE_SEGMENTS[locale].get(segment) ?? segment
}

/** "products" + "ro" -> "produse". */
export function toLocalizedSegment(segment: string, locale: Locale): string {
  const entry = (ROUTE_SEGMENTS as Record<string, Record<Locale, string> | undefined>)[segment]
  return entry ? entry[locale] : segment
}

/**
 * Builds a public href from canonical segments.
 *
 *   localePath('ro', 'products')            -> /ro/produse
 *   localePath('ru', 'suppliers', 'agro-x') -> /ru/suppliers/agro-x
 *
 * Only the segments declared in ROUTE_SEGMENTS get translated; slugs and ids are
 * emitted verbatim.
 */
export function localePath(locale: Locale, ...segments: (string | number)[]): string {
  const parts = segments
    .filter((segment) => segment !== '' && segment !== undefined && segment !== null)
    .map((segment) => (typeof segment === 'number' ? String(segment) : segment))
    .map((segment) => toLocalizedSegment(segment, locale))
  return `/${[locale, ...parts].join('/')}`
}

/**
 * Rewrites an already-built localized pathname into another locale, keeping slugs.
 * Used by the language switcher so a user does not lose the page they are on.
 */
export function switchLocalePath(pathname: string, from: Locale, to: Locale): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] === from) segments.shift()

  const translated = segments.map((segment) => {
    const canonical = toCanonicalSegment(segment, from)
    return toLocalizedSegment(canonical, to)
  })

  return `/${[to, ...translated].join('/')}`
}
