import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CalendarClock,
  Eye,
  FileCheck2,
  MapPin,
  MessageSquare,
  MessageSquareQuote,
  Package,
  Pencil,
  Repeat,
  Truck,
} from 'lucide-react'
import { env } from '@/env'
import { getDictionary, fmt, resolveLocale, type Dictionary } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { formatDate, formatDateShort } from '@/lib/i18n/format'
import { formatMoney, formatQuantity } from '@/lib/money'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/auth/session'
import {
  getProductBySlug,
  getSimilarProducts,
  recordProductView,
} from '@/server/services/products'
import { getCategoryById, type CategoryNode } from '@/server/services/categories'
import { ProductGallery } from '@/components/product/product-gallery'
import { PriceCalculator } from '@/components/product/price-calculator'
import { PriceTiersTable } from '@/components/product/price-tiers-table'
import { ProductCard } from '@/components/product/product-card'
import { FavoriteButton } from '@/components/product/favorite-button'
import { VerificationBadges } from '@/components/company/verification-badges'
import { Avatar, Badge, Breadcrumbs, Rating, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * A single listing.
 *
 * Two rules shape this page:
 *   - the buyer's question is «what will this actually cost me», so the price ladder and
 *     the calculator sit next to the price, not below the fold;
 *   - verification is shown as a *result*. The documents block prints the type and the
 *     validity of an approved, publicly-opted-in document and never a link to the file —
 *     documents live in private storage and stay there.
 */

const AVAILABILITY_SCHEMA: Record<string, string> = {
  IN_STOCK: 'https://schema.org/InStock',
  PRE_ORDER: 'https://schema.org/PreOrder',
  OUT_OF_STOCK: 'https://schema.org/OutOfStock',
}

const AVAILABILITY_VARIANT: Record<string, 'success' | 'warning' | 'neutral'> = {
  IN_STOCK: 'success',
  PRE_ORDER: 'warning',
  OUT_OF_STOCK: 'neutral',
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const product = await getProductBySlug(params.slug, null)

  if (!product) {
    return { title: t.states.notFoundTitle, robots: { index: false, follow: false } }
  }

  const unitLabel = t.units[product.unit as keyof typeof t.units] ?? product.unit
  const price = fmt(t.product.pricePerUnit, {
    price: formatMoney(product.priceBani, locale),
    unit: unitLabel,
  })

  return {
    title: fmt(t.seo.productTitle, { title: product.title, price }),
    description: product.description?.slice(0, 160) ?? t.seo.catalogDescription,
    openGraph: {
      type: 'website',
      title: product.title,
      description: product.description?.slice(0, 200) ?? t.seo.catalogDescription,
      images: product.photos[0] ? [product.photos[0].key] : undefined,
    },
  }
}

export default async function ProductPage({
  params,
}: {
  params: { locale: string; slug: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await getCurrentUser()

  const product = await getProductBySlug(params.slug, user?.companyId ?? null)
  if (!product) notFound()

  const isOwner = user?.companyId != null && user.companyId === product.companyId
  // Fire-and-forget: an analytics write must never delay the first paint.
  if (!isOwner) void recordProductView(product.id)

  const categoryNode = await getCategoryById(product.categoryId)
  const [trailNodes, similar, reviews, isFavorite, deliveryDistricts] = await Promise.all([
    categoryNode
      ? Promise.all(categoryNode.trail.map((step) => getCategoryById(step.id)))
      : Promise.resolve([]),
    getSimilarProducts(product.id, product.categoryId, 4),
    db.review.findMany({
      where: { targetCompanyId: product.companyId, status: 'PUBLISHED' },
      select: {
        id: true,
        overall: true,
        comment: true,
        createdAt: true,
        authorCompany: { select: { displayName: true } },
        reply: { select: { body: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
    user
      ? db.favorite
          .findFirst({ where: { userId: user.id, productId: product.id }, select: { id: true } })
          .then((row) => row !== null)
      : Promise.resolve(false),
    resolveDeliveryDistricts(product.deliveryRegions, locale),
  ])

  const trail = trailNodes.filter((node): node is CategoryNode => node !== null)
  const unitLabel = t.units[product.unit as keyof typeof t.units] ?? product.unit
  const place = product.company.locality ?? product.company.district
  const placeName = place ? (locale === 'ro' ? place.nameRo : place.nameRu) : null
  const availabilityLabel =
    t.availability[product.availability as keyof typeof t.availability] ?? product.availability

  const productUrl = `${env.APP_URL}${localePath(locale, 'products', product.slug)}`
  const supplierPath = localePath(locale, 'suppliers', product.company.slug)
  const contactHref = user
    ? `${localePath(locale, 'messages')}?product=${product.id}`
    : `${localePath(locale, 'login')}?next=${encodeURIComponent(
        localePath(locale, 'products', product.slug),
      )}`
  const categorySlug =
    product.category.translations.find((translation) => translation.locale === locale)?.slug ??
    product.category.slug
  const categoryName =
    product.category.translations.find((translation) => translation.locale === locale)?.name ??
    product.category.translations[0]?.name ??
    ''
  const requestOfferHref = `${localePath(locale, 'requests', 'new')}?category=${encodeURIComponent(
    categorySlug,
  )}`

  const specs = buildSpecs(product, locale, t)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    ...(product.description ? { description: product.description.slice(0, 500) } : {}),
    ...(product.photos.length > 0 ? { image: product.photos.map((photo) => photo.key) } : {}),
    ...(categoryName ? { category: categoryName } : {}),
    ...(product.manufacturer
      ? { brand: { '@type': 'Organization', name: product.manufacturer } }
      : {}),
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: product.currency,
      price: (product.priceBani / 100).toFixed(2),
      availability: AVAILABILITY_SCHEMA[product.availability] ?? AVAILABILITY_SCHEMA.IN_STOCK,
      seller: { '@type': 'Organization', name: product.company.displayName },
      ...(product.availableQty !== null ? { inventoryLevel: product.availableQty } : {}),
    },
  }

  return (
    <div className="container py-6 pb-28 md:pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <Breadcrumbs
        label={t.a11y.breadcrumb}
        items={[
          { label: t.catalog.breadcrumbHome, href: localePath(locale) },
          { label: t.catalog.title, href: localePath(locale, 'products') },
          ...trail.map((node) => ({
            label: node.names[locale],
            href: localePath(locale, 'category', node.slugs[locale]),
          })),
          { label: product.title },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={AVAILABILITY_VARIANT[product.availability] ?? 'neutral'} size="sm">
              {availabilityLabel}
            </Badge>
            {product.isUrgent ? (
              <Badge variant="accent" size="sm">
                {t.request.badgeUrgent}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-2 text-h1">{product.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
            {product.publishedAt ? (
              <span>
                {fmt(t.product.publishedAt, { date: formatDate(product.publishedAt, locale) })}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {fmt(t.product.viewsCount, { count: product.viewsCount })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <FavoriteButton
            productId={product.id}
            initial={isFavorite}
            label={isFavorite ? t.product.inFavorites : t.product.addToFavorites}
          />
          {isOwner ? (
            <Link
              href={localePath(locale, 'products', product.slug, 'edit')}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {t.common.edit}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ------------------------------------------------------------ main */}
        <div className="min-w-0">
          <ProductGallery
            photos={product.photos.map((photo) => ({
              id: photo.id,
              key: photo.key,
              alt: photo.alt,
            }))}
            title={product.title}
          />

          {product.description ? (
            <Section id="description" title={t.product.description}>
              <p className="whitespace-pre-line text-base leading-relaxed">{product.description}</p>
            </Section>
          ) : null}

          {specs.length > 0 ? (
            <Section id="attributes" title={t.product.attributes}>
              <dl className="divide-y divide-border rounded-lg border border-border bg-card">
                {specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5"
                  >
                    <dt className="text-sm text-muted-foreground">{spec.label}</dt>
                    <dd className="text-sm font-medium">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          ) : null}

          {product.priceTiers.length > 0 ? (
            <Section id="price-tiers" title={t.product.priceTiers}>
              <PriceTiersTable
                tiers={product.priceTiers}
                basePriceBani={product.priceBani}
                unitLabel={unitLabel}
                locale={locale}
                t={t}
              />
            </Section>
          ) : null}

          <Section id="delivery" title={t.product.delivery}>
            <dl className="space-y-3 text-sm">
              <Fact
                icon={<Truck className="h-4 w-4" aria-hidden />}
                label={t.product.deliveryPrice}
                value={
                  product.deliveryPriceBani === null
                    ? t.product.deliveryNegotiable
                    : product.deliveryPriceBani === 0
                      ? t.product.deliveryFree
                      : formatMoney(product.deliveryPriceBani, locale)
                }
              />
              <Fact
                icon={<Package className="h-4 w-4" aria-hidden />}
                label={t.product.pickup}
                value={product.pickupAvailable ? t.common.yes : t.common.no}
              />
              {deliveryDistricts.length > 0 ? (
                <Fact
                  icon={<MapPin className="h-4 w-4" aria-hidden />}
                  label={t.product.deliveryRegions}
                  value={deliveryDistricts.join(', ')}
                />
              ) : null}
            </dl>
            {product.deliveryTerms ? (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {product.deliveryTerms}
              </p>
            ) : null}
          </Section>

          {product.documents.length > 0 ? (
            <Section id="documents" title={t.product.documents}>
              {/* Only APPROVED + isPublic rows reach here (PRODUCT_DETAIL_INCLUDE), and
                  the file itself is never linked — the type and validity are the whole
                  public surface of a verified document. */}
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {product.documents.map((link) => (
                  <li
                    key={link.document.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <FileCheck2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {t.verification.docTypes[
                        link.document.type as keyof typeof t.verification.docTypes
                      ] ?? link.document.type}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {link.document.expiresAt
                        ? fmt(t.productForm.documentExpires, {
                            date: formatDateShort(link.document.expiresAt, locale),
                          })
                        : t.verification.statuses.APPROVED}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="supplier" title={t.product.supplier}>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex gap-3.5">
                <Avatar
                  src={product.company.logoKey ?? undefined}
                  name={product.company.displayName}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-medium">
                    <Link href={supplierPath} className="hover:text-primary">
                      {product.company.displayName}
                    </Link>
                  </h3>
                  {product.company.ratingCount > 0 ? (
                    <Rating
                      className="mt-1"
                      value={product.company.ratingAvg}
                      count={product.company.ratingCount}
                      showValue
                      label={fmt(t.a11y.rating, {
                        value: product.company.ratingAvg.toFixed(1),
                      })}
                    />
                  ) : (
                    <p className="mt-1 text-caption text-muted-foreground">{t.company.noReviews}</p>
                  )}
                  {placeName ? (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-caption text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {placeName}
                    </p>
                  ) : null}
                </div>
              </div>

              <VerificationBadges
                className="mt-3"
                badges={product.company.badges}
                t={t}
                size="sm"
              />

              {product.company.description ? (
                <p className="clamp-3 mt-3 text-sm text-muted-foreground">
                  {product.company.description}
                </p>
              ) : null}

              <dl className="mt-3 space-y-2 text-sm">
                {product.company.minOrderBani > 0 ? (
                  <Fact
                    icon={<Package className="h-4 w-4" aria-hidden />}
                    label={t.company.minOrder}
                    value={formatMoney(product.company.minOrderBani, locale)}
                  />
                ) : null}
                {product.company.avgResponseMinutes !== null ? (
                  <Fact
                    icon={<CalendarClock className="h-4 w-4" aria-hidden />}
                    label={t.company.responseTime}
                    value={fmt(t.company.responseTimeValue, {
                      minutes: product.company.avgResponseMinutes,
                    })}
                  />
                ) : null}
                <Fact
                  icon={<MessageSquareQuote className="h-4 w-4" aria-hidden />}
                  label={t.company.dealsCompleted}
                  value={String(product.company.dealsCompleted)}
                />
              </dl>

              <Link
                href={supplierPath}
                className={cn(buttonVariants({ variant: 'outline', fullWidth: true }), 'mt-4')}
              >
                {t.company.about}
              </Link>
            </div>
          </Section>

          <Section id="reviews" title={t.product.reviews}>
            {reviews.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                {t.review.emptyText}
              </p>
            ) : (
              <>
                <ul className="space-y-3">
                  {reviews.map((review) => (
                    <li key={review.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {review.authorCompany.displayName}
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {formatDateShort(review.createdAt, locale)}
                        </span>
                      </div>
                      <Rating
                        className="mt-1.5"
                        value={review.overall}
                        showValue
                        label={fmt(t.review.ratingOf, { value: review.overall })}
                      />
                      {review.comment ? (
                        <p className="mt-2 whitespace-pre-line text-sm">{review.comment}</p>
                      ) : null}
                      {review.reply ? (
                        <div className="mt-3 rounded-md border-l-2 border-primary bg-muted/50 px-3 py-2">
                          <p className="text-caption font-medium text-muted-foreground">
                            {t.review.replyTitle}
                          </p>
                          <p className="mt-0.5 whitespace-pre-line text-sm">{review.reply.body}</p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`${supplierPath}?tab=reviews`}
                  className="mt-3 inline-flex text-sm font-medium text-primary hover:text-primary-hover"
                >
                  {t.common.showAll}
                </Link>
              </>
            )}
          </Section>
        </div>

        {/* ----------------------------------------------------------- aside */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-4 shadow-card">
            <p className="tnum text-h2 leading-none">
              {formatMoney(product.priceBani, locale)}
              <span className="ml-1.5 text-base font-normal text-muted-foreground">
                / {unitLabel}
              </span>
            </p>

            <dl className="mt-4 space-y-2 text-sm">
              <Fact
                icon={<Package className="h-4 w-4" aria-hidden />}
                label={t.product.minOrder}
                value={formatQuantity(product.minOrderQty, unitLabel, locale)}
              />
              <Fact
                icon={<Package className="h-4 w-4" aria-hidden />}
                label={t.product.available}
                value={
                  product.availableQty !== null
                    ? formatQuantity(product.availableQty, unitLabel, locale)
                    : t.product.availableUnlimited
                }
              />
              {product.supplyRegularity ? (
                <Fact
                  icon={<Repeat className="h-4 w-4" aria-hidden />}
                  label={t.product.supplyRegularity}
                  value={
                    t.regularity[product.supplyRegularity as keyof typeof t.regularity] ??
                    product.supplyRegularity
                  }
                />
              ) : null}
            </dl>

            {isOwner ? (
              <p className="mt-4 text-sm text-muted-foreground">{t.errors.ownProduct}</p>
            ) : (
              <div className="mt-4 space-y-2">
                <Link
                  href={contactHref}
                  className={buttonVariants({ size: 'lg', fullWidth: true })}
                >
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  {t.company.writeMessage}
                </Link>
                <Link
                  href={requestOfferHref}
                  className={buttonVariants({ variant: 'outline', fullWidth: true })}
                >
                  <MessageSquareQuote className="h-4 w-4" aria-hidden />
                  {t.product.requestOffer}
                </Link>
              </div>
            )}
          </div>

          <PriceCalculator
            basePriceBani={product.priceBani}
            tiers={product.priceTiers.map((tier) => ({
              minQty: tier.minQty,
              maxQty: tier.maxQty,
              priceBani: tier.priceBani,
            }))}
            minOrderQty={product.minOrderQty}
            unit={product.unit}
            deliveryPriceBani={product.deliveryPriceBani}
          />
        </aside>
      </div>

      {/* ------------------------------------------------------------ similar */}
      {similar.length > 0 ? (
        <section className="mt-10" aria-labelledby="similar-title">
          <h2 id="similar-title" className="text-h3">
            {t.product.similarProducts}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {similar.map((item) => (
              <ProductCard
                key={item.id}
                product={{
                  id: item.id,
                  slug: item.slug,
                  title: item.title,
                  priceBani: item.priceBani,
                  unit: item.unit,
                  minOrderQty: item.minOrderQty,
                  availableQty: item.availableQty,
                  pickupAvailable: item.pickupAvailable,
                  deliveryPriceBani: item.deliveryPriceBani,
                  isHighlighted: item.isHighlighted,
                  isUrgent: item.isUrgent,
                  photos: item.photos.map((photo) => ({ key: photo.key, alt: photo.alt })),
                  company: {
                    slug: item.company.slug,
                    displayName: item.company.displayName,
                    ratingAvg: item.company.ratingAvg,
                    ratingCount: 0,
                    district: null,
                    locality: null,
                    badges: [],
                  },
                }}
                locale={locale}
                t={t}
                showFavorite={false}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------- mobile sticky action bar */}
      {!isOwner ? (
        // Sits directly on top of the mobile bottom navigation (56px + the iOS inset).
        <div className="fixed inset-x-0 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom,0px))] z-30 border-t border-border bg-card/95 px-4 py-2.5 backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <p className="tnum min-w-0 flex-1 text-base font-semibold leading-tight">
              {formatMoney(product.priceBani, locale)}
              <span className="ml-1 text-caption font-normal text-muted-foreground">
                / {unitLabel}
              </span>
            </p>
            <Link href={contactHref} className={buttonVariants({ className: 'shrink-0' })}>
              <MessageSquare className="h-4 w-4" aria-hidden />
              {t.company.writeMessage}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-8" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-h3">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** A <div> wrapper is the only element allowed to group <dt>/<dd> inside a <dl>. */
function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="tnum min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  )
}

type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>

/** Category attributes first, then the food-safety fields a buyer checks before ordering. */
function buildSpecs(
  product: ProductDetail,
  locale: Locale,
  t: Dictionary,
): { label: string; value: string }[] {
  const specs: { label: string; value: string }[] = []

  for (const value of product.attributes) {
    const label =
      value.attribute.translations.find((translation) => translation.locale === locale)?.label ??
      value.attribute.translations[0]?.label ??
      value.attribute.key

    const optionLabel =
      value.option?.translations.find((translation) => translation.locale === locale)?.label ??
      value.option?.translations[0]?.label ??
      value.option?.value

    const rendered =
      optionLabel ??
      (value.valueBool !== null
        ? value.valueBool
          ? t.common.yes
          : t.common.no
        : value.valueNumber !== null
          ? `${value.valueNumber}${value.attribute.unit ? ` ${value.attribute.unit}` : ''}`
          : value.valueDate !== null
            ? formatDateShort(value.valueDate, locale)
            : (value.valueText ?? null))

    if (rendered) specs.push({ label, value: rendered })
  }

  const plain: [string, string | null][] = [
    [t.product.origin, product.originCountry],
    [t.product.manufacturer, product.manufacturer],
    [t.product.productionPlace, product.productionPlace],
    [t.product.batchNumber, product.batchNumber],
    [t.product.composition, product.composition],
    [t.product.allergens, product.allergens],
    [t.product.packaging, product.packaging],
    [t.product.storageConditions, product.storageConditions],
    [t.product.storageTemp, product.storageTempC],
  ]

  for (const [label, value] of plain) {
    if (value) specs.push({ label, value })
  }

  if (product.producedAt) {
    specs.push({ label: t.product.producedAt, value: formatDateShort(product.producedAt, locale) })
  }
  if (product.bestBefore) {
    specs.push({ label: t.product.bestBefore, value: formatDateShort(product.bestBefore, locale) })
  }

  return specs
}

/** `deliveryRegions` is a JSON array of district ids written by the seller wizard. */
async function resolveDeliveryDistricts(
  raw: string | null,
  locale: Locale,
): Promise<string[]> {
  if (!raw) return []

  let ids: unknown
  try {
    ids = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(ids)) return []

  const clean = ids.filter((id): id is string => typeof id === 'string').slice(0, 40)
  if (clean.length === 0) return []

  const districts = await db.district.findMany({
    where: { id: { in: clean } },
    select: { nameRu: true, nameRo: true },
    orderBy: locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' },
  })

  return districts.map((district) => (locale === 'ro' ? district.nameRo : district.nameRu))
}

/** `</script>` inside a JSON string would close the tag early. */
function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
