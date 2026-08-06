import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import '@/app/globals.css'

import { LOCALES, LOCALE_TAGS, isLocale, localePath } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n'
import { I18nProvider } from '@/lib/i18n/provider'
import { ToastProvider } from '@/components/ui'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { MobileNav } from '@/components/layout/mobile-nav'
import { getCurrentUser } from '@/server/auth/session'
import { getHeaderCounters } from '@/server/services/counters'
import { getPopularCategories } from '@/server/services/categories'
import { env } from '@/env'

/**
 * This is the root layout.
 *
 * There is deliberately no src/app/layout.tsx: putting <html> here is what lets the
 * `lang` attribute be the actual page language. A root layout above the [locale]
 * segment cannot read the locale, so it would have to hardcode one — which breaks
 * screen readers and hyphenation on every Romanian page.
 */

const inter = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  display: 'swap',
  variable: '--font-sans',
})

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  const locale = isLocale(params.locale) ? params.locale : 'ru'

  return {
    metadataBase: new URL(env.APP_URL),
    title: {
      default: `${t.meta.siteName} — ${t.meta.tagline}`,
      template: `%s — ${t.meta.siteName}`,
    },
    description: t.meta.defaultDescription,
    applicationName: t.meta.siteName,
    alternates: {
      canonical: localePath(locale),
      languages: {
        ru: '/ru',
        ro: '/ro',
        'x-default': '/ru',
      },
    },
    openGraph: {
      type: 'website',
      siteName: t.meta.siteName,
      title: `${t.meta.siteName} — ${t.meta.tagline}`,
      description: t.meta.defaultDescription,
      locale: LOCALE_TAGS[locale].replace('-', '_'),
      url: localePath(locale),
    },
    twitter: { card: 'summary_large_image' },
    robots: { index: true, follow: true },
  }
}

export const viewport: Viewport = {
  themeColor: '#0F6B45',
  width: 'device-width',
  initialScale: 1,
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!isLocale(params.locale)) notFound()
  const locale = params.locale

  const [t, user, categories] = await Promise.all([
    getDictionary(locale),
    getCurrentUser(),
    getPopularCategories(8),
  ])

  const counters = await getHeaderCounters(user?.id ?? null)

  return (
    <html lang={LOCALE_TAGS[locale]} className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-base text-foreground">
        <I18nProvider locale={locale} dictionary={t}>
          <ToastProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-card focus:px-4 focus:py-2 focus:shadow-pop"
            >
              {t.a11y.skipToContent}
            </a>

            {/*
              The bottom-navigation offset sits on the whole column, not on <main>:
              the footer is a sibling of <main>, so padding applied there left the last
              rows of the footer underneath the fixed bar on every phone.
            */}
            <div className="flex min-h-dvh flex-col pb-safe-nav md:pb-0">
              <SiteHeader
                user={
                  user
                    ? {
                        name: user.name,
                        companyName: user.companyName,
                        companySlug: user.companySlug,
                        role: user.role,
                        isSeller: user.isSeller,
                        isBuyer: user.isBuyer,
                        hasCompany: user.companyId !== null,
                      }
                    : null
                }
                counters={counters}
                popularCategories={categories.map((category) => ({
                  id: category.id,
                  name: category.names[locale],
                  slug: category.slugs[locale],
                  icon: category.icon,
                }))}
              />

              <main id="main" className="flex-1">
                {children}
              </main>

              <SiteFooter />
            </div>

            <MobileNav
              isAuthenticated={user !== null}
              unreadMessages={counters.unreadMessages}
            />
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
