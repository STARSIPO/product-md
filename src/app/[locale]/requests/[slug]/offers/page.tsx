import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireBuyer, assertOwnsRequest } from '@/server/auth/guards'
import { getRequestBySlug } from '@/server/services/requests'
import { listOffersForBuyer, markOffersViewed } from '@/server/services/offers'
import { storage } from '@/server/storage'
import { Breadcrumbs, EmptyState, buttonVariants } from '@/components/ui'
import {
  OfferComparison,
  type ComparisonOffer,
} from '@/components/offer/offer-comparison'

/**
 * The buyer's comparison table — the only screen where more than one sealed offer is
 * visible, and only to the company that published the request.
 *
 * Three independent checks stand in front of the data: `requireBuyer` (a signed-in buyer
 * company), `assertOwnsRequest` (this company owns this request), and
 * `listOffersForBuyer`, which re-verifies ownership in the database before it returns a
 * single row. Removing any one of them would still leave the offers sealed.
 */

const EARTH_RADIUS_KM = 6371

interface Point {
  latitude: number | null
  longitude: number | null
}

/**
 * Great-circle distance between two localities. Returns null when either side has no
 * coordinates — an invented number would be worse than an honest dash, because a buyer
 * uses this column to judge delivery cost.
 */
function haversineKm(from: Point | null | undefined, to: Point | null | undefined): number | null {
  if (!from || !to) return null
  if (
    from.latitude === null ||
    from.longitude === null ||
    to.latitude === null ||
    to.longitude === null
  ) {
    return null
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(to.latitude - from.latitude)
  const deltaLon = toRadians(to.longitude - from.longitude)

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.offer.compareTitle, robots: { index: false, follow: false } }
}

export default async function RequestOffersPage({
  params,
}: {
  params: { locale: string; slug: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireBuyer(
    locale,
    localePath(locale, 'requests', params.slug, 'offers'),
  )

  const request = await getRequestBySlug(params.slug, user.companyId)
  if (!request) notFound()

  // Ownership again, this time against the row itself. A buyer company that merely knows
  // the slug gets a 404, never a table.
  try {
    await assertOwnsRequest(request.id)
  } catch {
    notFound()
  }

  const offers = await listOffersForBuyer(request.id, user.companyId)

  // Marked after reading, so unseen offers still render as "new" on this first visit.
  await markOffersViewed(request.id, user.companyId)

  const origin = request.deliveryLocality ?? request.company.locality

  const rows: ComparisonOffer[] = await Promise.all(
    offers.map(async (offer) => ({
      id: offer.id,
      status: offer.status,
      priceBani: offer.priceBani,
      quantity: offer.quantity,
      unit: offer.unit,
      deliveryPriceBani: offer.deliveryPriceBani,
      totalBani: offer.totalBani,
      deliveryAt: offer.deliveryAt,
      deliveryDays: offer.deliveryDays,
      paymentMethod: offer.paymentMethod,
      validUntil: offer.validUntil,
      regularity: offer.regularity,
      comment: offer.comment,
      attachmentName: offer.attachmentName,
      attachmentUrl: offer.attachmentKey
        ? await storage.signedUrl(offer.attachmentKey, 600)
        : null,
      distanceKm: haversineKm(origin, offer.sellerCompany.locality),
      supplier: {
        id: offer.sellerCompany.id,
        slug: offer.sellerCompany.slug,
        displayName: offer.sellerCompany.displayName,
        ratingAvg: offer.sellerCompany.ratingAvg,
        ratingCount: offer.sellerCompany.ratingCount,
        dealsCompleted: offer.sellerCompany.dealsCompleted,
        avgResponseMinutes: offer.sellerCompany.avgResponseMinutes,
        hasDocuments: offer.sellerCompany.badges.some(
          (badge) =>
            badge.type === 'DOCUMENTS' ||
            badge.type === 'ANSA' ||
            badge.type === 'TRUSTED_SUPPLIER',
        ),
        localityName: offer.sellerCompany.locality
          ? locale === 'ro'
            ? offer.sellerCompany.locality.nameRo
            : offer.sellerCompany.locality.nameRu
          : (offer.sellerCompany.district
              ? locale === 'ro'
                ? offer.sellerCompany.district.nameRo
                : offer.sellerCompany.district.nameRu
              : null),
      },
      alternativeProduct: offer.alternativeProduct,
    })),
  )

  const decided =
    request.status === 'SUPPLIER_SELECTED' ||
    request.status === 'IN_PROGRESS' ||
    request.status === 'COMPLETED' ||
    request.status === 'CANCELLED'

  return (
    <div className="container py-10">
      <Breadcrumbs
        label={t.a11y.breadcrumb}
        items={[
          { label: t.request.title, href: localePath(locale, 'requests') },
          { label: request.title, href: localePath(locale, 'requests', request.slug) },
          { label: t.offer.compareTitle },
        ]}
      />

      <div className="mt-4">
        <h1 className="text-h1">{t.offer.compareTitle}</h1>
        <p className="mt-2 text-muted-foreground">
          {fmt(t.offer.compareSubtitle, { title: request.title })}
        </p>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            className="surface"
            icon={<Inbox aria-hidden />}
            title={t.offer.compareEmpty}
            description={t.offer.compareEmptyText}
            action={
              <Link
                href={localePath(locale, 'requests', request.slug)}
                className={buttonVariants({ variant: 'outline' })}
              >
                {t.request.single}
              </Link>
            }
          />
        ) : (
          <OfferComparison offers={rows} requestSlug={request.slug} decided={decided} />
        )}
      </div>
    </div>
  )
}
