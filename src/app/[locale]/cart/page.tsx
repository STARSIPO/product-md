import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/auth/session'
import { CartView } from '@/components/retail/cart-view'

/**
 * Checkout.
 *
 * A thin server shell: the basket itself lives in the browser, so all this page does is
 * hand the client view the things only the server knows — the locality list, and the
 * signed-in visitor's own contacts so they are not retyped.
 *
 * No guard. A household ordering two kilos of tomatoes is not a company and is not asked
 * to register; `placeRetailOrder` accepts a null customer. Being able to buy without an
 * account is the whole difference between this half of the marketplace and the other.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)

  return {
    title: t.retail.cartTitle,
    // A basket is per-visitor and has nothing to index.
    robots: { index: false, follow: true },
  }
}

export default async function CartPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)

  const [user, localities] = await Promise.all([
    getCurrentUser(),
    db.locality.findMany({
      select: { id: true, nameRu: true, nameRo: true },
      orderBy: [{ isMajor: 'desc' }, locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' }],
      take: 2000,
    }),
  ])

  return (
    <CartView
      isAuthenticated={user !== null}
      defaults={{
        name: user?.name ?? '',
        phone: user?.phone ?? '',
        email: user?.email ?? '',
      }}
      localities={localities.map((locality) => ({
        id: locality.id,
        name: locale === 'ro' ? locality.nameRo : locality.nameRu,
      }))}
      ordersHref={localePath(locale, 'orders')}
      deliveryHref={localePath(locale, 'delivery')}
    />
  )
}
