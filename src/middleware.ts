import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LOCALE, LOCALES, isLocale, toCanonicalSegment } from '@/lib/i18n/config'
import { negotiateLocale } from '@/lib/i18n'

/**
 * Locale routing only.
 *
 * Two jobs:
 *   1. Send a locale-less URL to the visitor's language (cookie first, then
 *      Accept-Language) with a 307, so /catalog never renders untranslated.
 *   2. Rewrite localized segments back to canonical ones — /ro/produse/oua-de-tara
 *      is *served* by src/app/[locale]/products/[slug] while the address bar keeps
 *      the Romanian URL. That gives each language its own indexable path without
 *      duplicating a single page component.
 *
 * Authorization deliberately does NOT live here. Middleware runs on the edge where
 * Prisma is unavailable, so a check here could only inspect an unverified cookie.
 * Every protected route resolves the session against the database in its own server
 * component — see src/server/auth/guards.ts.
 */

const LOCALE_COOKIE = 'NEXT_LOCALE'

const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|webmanifest|css|js|map)$/i

function shouldSkip(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/uploads/') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/favicon.ico' ||
    PUBLIC_FILE.test(pathname)
  )
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (shouldSkip(pathname)) return NextResponse.next()

  const segments = pathname.split('/').filter(Boolean)
  const maybeLocale = segments[0]

  // --- no locale in the URL: choose one and redirect ------------------------
  if (!isLocale(maybeLocale)) {
    const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
    const locale = isLocale(cookieLocale)
      ? cookieLocale
      : negotiateLocale(request.headers.get('accept-language'))

    const url = request.nextUrl.clone()
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
    const response = NextResponse.redirect(url, 307)
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
    return response
  }

  const locale = maybeLocale
  const rest = segments.slice(1)

  // --- translate localized segments back to the canonical folder names ------
  const canonical = rest.map((segment) => toCanonicalSegment(segment, locale))
  const changed = canonical.some((segment, index) => segment !== rest[index])

  const response = changed
    ? NextResponse.rewrite(
        new URL(`/${[locale, ...canonical].join('/')}${search}`, request.url),
      )
    : NextResponse.next()

  // Remember the language the visitor is actually browsing in.
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

export { LOCALES, DEFAULT_LOCALE }
