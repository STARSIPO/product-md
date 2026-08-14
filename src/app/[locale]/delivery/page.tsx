import type { Metadata } from 'next'
import Link from 'next/link'
import { PackageSearch, Store } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { listRetailCompanies, searchRetailProducts } from '@/server/services/retail'
import { buildQuery, parsePage } from '@/lib/utils'
import { CartBar } from '@/components/retail/cart-bar'
import { RetailProductCard } from '@/components/retail/retail-product-card'
import { ShopCard } from '@/components/retail/shop-card'
import { StorefrontFilters } from '@/components/retail/storefront-filters'
import { EmptyState, Pagination, buttonVariants } from '@/components/ui'
import { getRetailCategoryOptions } from './category-options'

/**
 * «Доставка продуктов» — the consumer half of the marketplace.
 *
 * Two things, in the order a shopper needs them: which shops deliver to Moldova at all
 * and on what terms, then everything they sell in one browsable grid. The shops come
 * first because the delivery fee and the free-delivery threshold decide the basket, and
 * discovering them at checkout is the thing that makes people abandon one.
 *
 * Server-rendered and indexable. The only client code is the search/category form and
 * the add-to-cart control on each card.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  return {
    title: t.seo.deliveryTitle,
    description: t.seo.deliveryDescription,
    alternates: { canonical: localePath(locale, 'delivery') },
    openGraph: {
      type: 'website',
      title: t.seo.deliveryTitle,
      description: t.seo.deliveryDescription,
    },
  }
}

export default async function DeliveryPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { q?: string | string[]; category?: string | string[]; page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const q = firstValue(searchParams.q)
  const category = firstValue(searchParams.category)
  const page = parsePage(searchParams.page)
  const basePath = localePath(locale, 'delivery')

  const [shops, results, categoryOptions] = await Promise.all([
    listRetailCompanies(),
    searchRetailProducts({
      ...(q ? { q } : {}),
      ...(category ? { category } : {}),
      page,
    }),
    getRetailCategoryOptions(locale),
  ])

  const hasFilters = q !== undefined || category !== undefined

  return (
    // The extra bottom padding leaves room for the floating basket.
    <div className="container py-8 pb-28 md:py-10 md:pb-24">
      <header className="max-w-2xl">
        <h1 className="text-h1">{t.retail.title}</h1>
        <p className="mt-2 text-muted-foreground">{t.retail.subtitle}</p>
        <p className="mt-3 text-sm text-muted-foreground">{t.retail.intro}</p>
      </header>

      {/* ------------------------------------------------------------- shops */}
      <section className="mt-10" aria-labelledby="retail-shops">
        <h2 id="retail-shops" className="text-h2">
          {t.retail.shopsTitle}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{t.retail.shopsSubtitle}</p>

        {shops.length === 0 ? (
          <EmptyState
            className="surface mt-4"
            icon={<Store aria-hidden />}
            title={t.retail.shopsEmpty}
            description={t.retail.shopsEmptyText}
            action={
              <Link href={localePath(locale, 'products')} className={buttonVariants()}>
                {t.sales.emptyAction}
              </Link>
            }
          />
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {shops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} locale={locale} t={t} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- products */}
      {shops.length > 0 ? (
        <section className="mt-10" aria-labelledby="retail-products">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-3">
            <h2 id="retail-products" className="text-h2">
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
            />
          ) : (
            <>
              {/* Two columns at 320px — a grocery grid is scanned, not read. */}
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
                {results.items.map((product, index) => (
                  <RetailProductCard
                    key={product.id}
                    product={product}
                    locale={locale}
                    t={t}
                    showShop
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
      ) : null}

      <CartBar cartHref={localePath(locale, 'cart')} />
    </div>
  )
}

/** A repeated query parameter is a hand-edited URL, not a real filter — take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === undefined || first === '' ? undefined : first
}
