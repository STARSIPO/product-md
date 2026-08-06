import type { MetadataRoute } from 'next'
import { env } from '@/env'
import { db } from '@/server/db'
import { LOCALES, localePath } from '@/lib/i18n/config'

/**
 * Sitemap covering both locales.
 *
 * Every entry carries `alternates.languages` so Google treats /ru/products and
 * /ro/produse as translations of one page rather than duplicates competing with each
 * other — which is the whole reason the URLs are localized in the first place.
 *
 * Capped at a few thousand rows. Past that, split into a sitemap index (Next supports
 * `generateSitemaps`) — noted in docs/ARCHITECTURE.md.
 */
export const revalidate = 3600

const MAX_PRODUCTS = 5000
const MAX_REQUESTS = 1000
const MAX_COMPANIES = 2000

function alternates(segments: (string | number)[]) {
  return {
    languages: Object.fromEntries(
      LOCALES.map((locale) => [locale, `${env.APP_URL}${localePath(locale, ...segments)}`]),
    ),
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = []

  const staticSegments: { segments: (string | number)[]; priority: number; freq: 'daily' | 'weekly' | 'monthly' }[] = [
    { segments: [], priority: 1, freq: 'daily' },
    { segments: ['products'], priority: 0.9, freq: 'daily' },
    { segments: ['requests'], priority: 0.9, freq: 'daily' },
    { segments: ['suppliers'], priority: 0.8, freq: 'daily' },
    { segments: ['pricing'], priority: 0.5, freq: 'monthly' },
    { segments: ['help'], priority: 0.4, freq: 'monthly' },
    { segments: ['contacts'], priority: 0.4, freq: 'monthly' },
    { segments: ['security'], priority: 0.4, freq: 'monthly' },
    { segments: ['partners'], priority: 0.4, freq: 'monthly' },
    { segments: ['terms'], priority: 0.3, freq: 'monthly' },
    { segments: ['privacy'], priority: 0.3, freq: 'monthly' },
    { segments: ['rules'], priority: 0.3, freq: 'monthly' },
  ]

  for (const { segments, priority, freq } of staticSegments) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${env.APP_URL}${localePath(locale, ...segments)}`,
        lastModified: new Date(),
        changeFrequency: freq,
        priority,
        alternates: alternates(segments),
      })
    }
  }

  // The database may be empty or unreachable during a build; a sitemap is not worth
  // failing a deployment over.
  try {
    const [categories, products, requests, companies] = await Promise.all([
      db.category.findMany({
        where: { isActive: true },
        include: { translations: { select: { locale: true, slug: true } } },
      }),
      db.product.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: MAX_PRODUCTS,
      }),
      db.purchaseRequest.findMany({
        where: { status: { in: ['ACTIVE', 'RECEIVING_OFFERS'] }, visibility: 'PUBLIC', deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_REQUESTS,
      }),
      db.company.findMany({
        where: { status: 'ACTIVE', isSeller: true, deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { ratingAvg: 'desc' },
        take: MAX_COMPANIES,
      }),
    ])

    for (const category of categories) {
      // Category slugs differ per locale, so each alternate is looked up individually.
      const byLocale = new Map(category.translations.map((t) => [t.locale, t.slug]))
      const languages = Object.fromEntries(
        LOCALES.map((locale) => [
          locale,
          `${env.APP_URL}${localePath(locale, 'category', byLocale.get(locale) ?? category.slug)}`,
        ]),
      )

      for (const locale of LOCALES) {
        entries.push({
          url: `${env.APP_URL}${localePath(locale, 'category', byLocale.get(locale) ?? category.slug)}`,
          lastModified: category.updatedAt,
          changeFrequency: 'weekly',
          priority: 0.7,
          alternates: { languages },
        })
      }
    }

    const collections: [string, { slug: string; updatedAt: Date }[], number][] = [
      ['products', products, 0.8],
      ['requests', requests, 0.6],
      ['suppliers', companies, 0.6],
    ]

    for (const [segment, rows, priority] of collections) {
      for (const row of rows) {
        for (const locale of LOCALES) {
          entries.push({
            url: `${env.APP_URL}${localePath(locale, segment, row.slug)}`,
            lastModified: row.updatedAt,
            changeFrequency: 'weekly',
            priority,
            alternates: alternates([segment, row.slug]),
          })
        }
      }
    }
  } catch (error) {
    console.error('[sitemap] falling back to static entries only', error)
  }

  return entries
}
