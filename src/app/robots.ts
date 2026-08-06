import type { MetadataRoute } from 'next'
import { env } from '@/env'

/**
 * Everything under an authenticated or transactional path is disallowed: those pages
 * are useless to a crawler and, in the case of /deals and /messages, would be an
 * information leak if a URL ever escaped.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/ru/dashboard/',
          '/ro/cabinet/',
          '/ru/admin/',
          '/ro/admin/',
          '/ru/moderation/',
          '/ro/moderare/',
          '/ru/messages/',
          '/ro/mesaje/',
          '/ru/deals/',
          '/ro/tranzactii/',
          '/ru/notifications/',
          '/ro/notificari/',
          '/ru/favorites/',
          '/ro/favorite/',
          '/ru/login',
          '/ro/autentificare',
          '/ru/register',
          '/ro/inregistrare',
          '/ru/onboarding',
          '/ro/configurare',
        ],
      },
    ],
    sitemap: `${env.APP_URL}/sitemap.xml`,
    host: env.APP_URL,
  }
}
