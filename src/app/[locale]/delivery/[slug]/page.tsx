import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PackageSearch, Truck } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { db } from '@/server/db'
import { searchRetailProducts } from '@/server/services/retail'
import { formatMoney } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { CartBar } from '@/components/retail/cart-bar'
import { RetailProductCard } from '@/components/retail/retail-product-card'
import { StorefrontFilters } from '@/components/retail/storefront-filters'
import {
  Avatar,
  Badge,
  Breadcrumbs,
  EmptyState,
  Pagination,
  Rating,
  buttonVariants,
} from '@/components/ui'
import { getRetailCategoryOptions } from '../category-options'

/**
 * One shop's storefront.
 *
 * The header exists to answer «сколько стоит доставка и с какой суммы бесплатно» before
 * the shopper starts filling a basket, because that is the number that decides whether
 * they fill it at all. Everything below is the same grid as the index, scoped to this
 * seller — which is also what the basket enforces: one order, one shop.
 */

async function getShop(slug: string) {
  return db.company.findFirst({
    where: { slug, status: 'ACTIVE', isRetail: true },
    select: {
      id: true,
      slug: true,
      displayName: true,
      kind: true,
      logoKey: true,
      description: true,
      ratingAvg: true,
      ratingCount: true,
      retailDeliveryFeeBani: true,
      retailFreeFromBani: true,
      retailDeliveryNote: true,
      locality: { select: { nameRu: true, nameRo: true } },
    },
  })
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const shop = await getShop(params.slug)

  if (!shop) return { title: t.errors.notFound }

  const title = fmt(t.seo.shopTitle, { company: shop.displayName })

  return {
    title,
    description: shop.description ?? t.seo.deliveryDescription,
    alternates: { canonical: localePath(locale, 'delivery', shop.slug) },
    openGraph: { type: 'website', title, description: t.seo.deliveryDescription },
  }
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string }
  searchParams: { q?: string | string[]; category?: string | string[]; page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const shop = await getShop(params.slug)
  if (!shop) notFound()

  const q = firstValue(searchParams.q)
  const category = firstValue(searchParams.category)
  const page = parsePage(searchParams.page)
  const basePath = localePath(locale, 'delivery', shop.slug)

  const [results, categoryOptions] = await Promise.all([
    searchRetailProducts({
      companyId: shop.id,
      ...(q ? { q } : {}),
      ...(category ? { category } : {}),
      page,
    }),
    getRetailCategoryOptions(locale, shop.id),
  ])

  const placeName = shop.locality
    ? locale === 'ro'
      ? shop.locality.nameRo
      : shop.locality.nameRu
    : null

  const kindLabel = t.company.kinds[shop.kind as keyof typeof t.company.kinds]
  const hasFilters = q !== undefined || category !== undefined

  return (
    // The extra bottom padding leaves room for the floating basket.
    <div className="container py-8 pb-28 md:py-10 md:pb-24">
      <Breadcrumbs
        label={t.a11y.breadcrumb}
        items={[
          { label: t.retail.title, href: localePath(locale, 'delivery') },
          { label: shop.displayName },
        ]}
      />

      {/* ------------------------------------------------------------ header */}
      <header className="surface mt-4 p-5 md:p-6">
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-4">
            <Avatar src={shop.logoKey} name={shop.displayName} size="xl" />

            <div className="min-w-0">
              <h1 className="text-h2">{shop.displayName}</h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {kindLabel ? (
                  <Badge variant="neutral" size="sm">
                    {kindLabel}
                  </Badge>
                ) : null}
                {placeName ? (
                  <span className="text-caption text-muted-foreground">{placeName}</span>
                ) : null}
                {shop.ratingCount > 0 ? (
                  <Rating
                    value={shop.ratingAvg}
                    count={shop.ratingCount}
                    size="sm"
                    showValue
                    label={fmt(t.a11y.rating, { value: shop.ratingAvg.toFixed(1) })}
                  />
                ) : null}
              </div>

              {shop.description ? (
                <p className="clamp-3 mt-3 max-w-prose text-sm text-muted-foreground">
                  {shop.description}
                </p>
              ) : null}
            </div>
          </div>

          <DeliveryTerms
            title={t.retail.deliveryFee}
            fee={
              shop.retailDeliveryFeeBani === null
                ? t.retail.deliveryNotSet
                : shop.retailDeliveryFeeBani === 0
                  ? t.retail.deliveryFree
                  : formatMoney(shop.retailDeliveryFeeBani, locale)
            }
            freeFrom={
              shop.retailFreeFromBani === null
                ? null
                : fmt(t.retail.freeFrom, {
                    amount: formatMoney(shop.retailFreeFromBani, locale),
                  })
            }
            note={shop.retailDeliveryNote}
          />
        </div>
      </header>

      {/* ---------------------------------------------------------- products */}
      <section className="mt-8" aria-labelledby="shop-products">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-3">
          <h2 id="shop-products" className="text-h2">
            {t.retail.productsTitle}
          </h2>
          <p aria-live="polite" className="tnum text-sm text-muted-foreground">
            {fmt(t.catalog.resultsCount, { count: results.total })}
          </p>
        </div>

        <StorefrontFilters
          className="mt-4"
          action={basePath}
          q={q}
          category={category}
          categories={categoryOptions}
        />

        {results.items.length === 0 ? (
          <EmptyState
            className="surface mt-6"
            icon={<PackageSearch aria-hidden />}
            title={t.retail.emptyTitle}
            description={t.retail.emptyText}
            action={
              hasFilters ? (
                <Link href={basePath} className={buttonVariants({ variant: 'outline' })}>
                  {t.sales.filterReset}
                </Link>
              ) : null
            }
            secondaryAction={
              <Link
                href={localePath(locale, 'delivery')}
                className={buttonVariants({ variant: 'ghost' })}
              >
                {t.retail.allShops}
              </Link>
            }
          />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {results.items.map((product, index) => (
                <RetailProductCard
                  key={product.id}
                  product={product}
                  locale={locale}
                  t={t}
                  priority={index < 4}
                />
              ))}
            </div>

            <Pagination
              className="mt-8"
              page={results.page}
              pageCount={results.pageCount}
              buildHref={(target) =>
                `${basePath}${buildQuery({
                  q,
                  category,
                  page: target > 1 ? target : undefined,
                })}`
              }
              labels={{
                previous: t.a11y.previousPage,
                next: t.a11y.nextPage,
                pagination: t.a11y.pagination,
              }}
            />
          </>
        )}
      </section>

      <CartBar cartHref={localePath(locale, 'cart')} />
    </div>
  )
}

/** The shop's terms, already localized by the caller — this only lays them out. */
function DeliveryTerms({
  title,
  fee,
  freeFrom,
  note,
}: {
  title: string
  fee: string
  freeFrom: string | null
  note: string | null
}) {
  return (
    <div className="surface-muted min-w-0 p-4 md:w-64 md:shrink-0">
      <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
        <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {title}
      </p>
      <p className="tnum mt-1 text-base font-semibold">{fee}</p>

      {freeFrom ? <p className="mt-2 text-caption text-muted-foreground">{freeFrom}</p> : null}
      {note ? <p className="mt-2 text-caption text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function firstValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === undefined || first === '' ? undefined : first
}
