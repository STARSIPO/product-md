import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, MapPin, Package, Search, Store } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { getCurrentUser } from '@/server/auth/session'
import { globalSearch, logSearchQuery, searchProducts } from '@/server/services/search'
import { productSearchSchema, type ProductSearchParams } from '@/lib/validation'
import { formatQuantity } from '@/lib/money'
import { buildQuery } from '@/lib/utils'
import { ProductCard } from '@/components/product/product-card'
import { SortSelect } from '@/components/catalog/sort-select'
import {
  Button,
  EmptyState,
  Input,
  Pagination,
  Rating,
  buttonVariants,
} from '@/components/ui'

/**
 * Site-wide search.
 *
 * A wholesale buyer's query is ambiguous by design — "помидоры" may mean a category, a
 * listing, a supplier or somebody else's open request — so results are grouped rather
 * than merged into one ranked list. Only the products group paginates; the other three
 * are short, high-signal shortcuts that lead into their own sections.
 */

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  const query = firstValue(searchParams.q)

  return {
    title: query ? `${t.search.resultsTitle} — ${query}` : t.search.resultsTitle,
    description: t.seo.catalogDescription,
  }
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await getCurrentUser()

  const filters = parseFilters(searchParams)
  const query = filters.q ?? ''
  const basePath = localePath(locale, 'search')

  const [results, groups] = query
    ? await Promise.all([searchProducts(filters, locale), globalSearch(query, locale)])
    : [null, null]

  // Feeds "popular queries" on the empty overlay; awaited so the row is not lost when
  // the response finishes before the insert does.
  if (query && results) {
    await logSearchQuery(query, locale, results.total, user?.id ?? null)
  }

  const groupCount =
    (groups?.categories.length ?? 0) +
    (groups?.suppliers.length ?? 0) +
    (groups?.requests.length ?? 0)
  const nothingFound = query !== '' && (results?.total ?? 0) === 0 && groupCount === 0

  return (
    <div className="container py-6 md:py-8">
      <h1 className="text-h1">{t.search.resultsTitle}</h1>

      <form method="get" action={basePath} role="search" className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="site-search" className="sr-only">
          {t.common.search}
        </label>
        <Input
          id="site-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={t.search.placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 sm:max-w-lg"
        />
        <Button type="submit">
          <Search className="h-4 w-4" aria-hidden />
          {t.common.search}
        </Button>
      </form>

      {query === '' ? (
        <EmptyState
          className="mt-8 rounded-lg border border-border bg-card"
          icon={<Search aria-hidden />}
          title={t.common.search}
          description={t.search.placeholder}
          action={
            <Link href={localePath(locale, 'products')} className={buttonVariants()}>
              {t.catalog.title}
            </Link>
          }
        />
      ) : nothingFound ? (
        <EmptyState
          className="mt-8 rounded-lg border border-border bg-card"
          icon={<Search aria-hidden />}
          title={fmt(t.search.noResults, { query })}
          description={t.search.noResultsHint}
          action={
            <Link href={localePath(locale, 'requests', 'new')} className={buttonVariants()}>
              <ClipboardList className="h-4 w-4" aria-hidden />
              {t.catalog.emptyCreateRequest}
            </Link>
          }
          secondaryAction={
            <Link href={localePath(locale, 'products')} className={buttonVariants({ variant: 'outline' })}>
              {t.catalog.title}
            </Link>
          }
        />
      ) : (
        <div className="mt-8 space-y-10">
          {/* ------------------------------------------------------ categories */}
          {groups && groups.categories.length > 0 ? (
            <section aria-labelledby="group-categories">
              <h2 id="group-categories" className="text-h3">
                {t.search.groupCategories}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {groups.categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={localePath(locale, 'category', category.slug)}
                      className="inline-flex min-h-[44px] flex-col justify-center rounded-lg border border-border bg-card px-3.5 py-1.5 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="text-sm font-medium">{category.name}</span>
                      {category.trail && category.trail !== category.name ? (
                        <span className="text-caption text-muted-foreground">{category.trail}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* -------------------------------------------------------- products */}
          <section aria-labelledby="group-products">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="group-products" className="text-h3">
                {t.search.groupProducts}
              </h2>
              <p aria-live="polite" className="tnum text-sm text-muted-foreground">
                {fmt(t.catalog.resultsCount, { count: results?.total ?? 0 })}
              </p>
              {results && results.total > 0 ? (
                <SortSelect
                  className="ml-auto"
                  action={basePath}
                  value={filters.sort}
                  hidden={{ q: query }}
                />
              ) : null}
            </div>

            {results && results.items.length > 0 ? (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {results.items.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      locale={locale}
                      t={t}
                      showFavorite={user !== null}
                      priority={index < 4}
                    />
                  ))}
                </div>

                <Pagination
                  className="mt-8"
                  page={results.page}
                  pageCount={results.pageCount}
                  buildHref={(page) =>
                    `${basePath}${buildQuery({
                      q: query,
                      sort: filters.sort === 'relevance' ? undefined : filters.sort,
                      page: page > 1 ? page : undefined,
                    })}`
                  }
                  labels={{
                    previous: t.a11y.previousPage,
                    next: t.a11y.nextPage,
                    pagination: t.a11y.pagination,
                  }}
                />
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                {fmt(t.search.noResults, { query })}
              </p>
            )}
          </section>

          {/* ------------------------------------------------------- suppliers */}
          {groups && groups.suppliers.length > 0 ? (
            <section aria-labelledby="group-suppliers">
              <h2 id="group-suppliers" className="text-h3">
                {t.search.groupSuppliers}
              </h2>
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
                {groups.suppliers.map((supplier) => (
                  <li key={supplier.id}>
                    <Link
                      href={localePath(locale, 'suppliers', supplier.slug)}
                      className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {supplier.displayName}
                      </span>
                      {supplier.ratingAvg > 0 ? (
                        <Rating
                          value={supplier.ratingAvg}
                          size="sm"
                          showValue
                          label={fmt(t.a11y.rating, { value: supplier.ratingAvg.toFixed(1) })}
                        />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={`${localePath(locale, 'suppliers')}${buildQuery({ q: query })}`}
                className="mt-2 inline-flex text-sm font-medium text-primary hover:text-primary-hover"
              >
                {t.common.showAll}
              </Link>
            </section>
          ) : null}

          {/* -------------------------------------------------------- requests */}
          {groups && groups.requests.length > 0 ? (
            <section aria-labelledby="group-requests">
              <h2 id="group-requests" className="text-h3">
                {t.search.groupRequests}
              </h2>
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
                {groups.requests.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={localePath(locale, 'requests', request.slug)}
                      className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {request.title}
                      </span>
                      <span className="tnum shrink-0 text-caption text-muted-foreground">
                        {formatQuantity(
                          request.quantity,
                          t.units[request.unit as keyof typeof t.units] ?? request.unit,
                          locale,
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={`${localePath(locale, 'requests')}${buildQuery({ q: query })}`}
                className="mt-2 inline-flex text-sm font-medium text-primary hover:text-primary-hover"
              >
                {t.common.showAll}
              </Link>
            </section>
          ) : null}

          {/* ---------------------------------------------------------- regions */}
          {groups && groups.districts.length > 0 ? (
            <section aria-labelledby="group-regions">
              <h2 id="group-regions" className="text-h3">
                {t.search.groupRegions}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {groups.districts.map((district) => (
                  <li key={district.id}>
                    <Link
                      href={`${localePath(locale, 'products')}${buildQuery({
                        district: district.id,
                      })}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-[36px]"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {district.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ----------------------------------------------- cross-sell to demand */}
          <p className="rounded-lg border border-dashed border-border bg-card px-4 py-5 text-center text-sm text-muted-foreground">
            <Package className="mr-1.5 inline h-4 w-4 align-text-bottom" aria-hidden />
            {t.catalog.emptyCreateRequest}{' '}
            <Link
              href={localePath(locale, 'requests', 'new')}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {t.nav.postRequest}
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}

function firstValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return (raw ?? '').trim().slice(0, 200)
}

/** Search only carries q / sort / page; everything else belongs to the catalogue. */
function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ProductSearchParams {
  const raw: Record<string, string> = {}
  const query = firstValue(searchParams.q)
  if (query) raw.q = query

  const sort = firstValue(searchParams.sort)
  if (sort) raw.sort = sort

  const page = firstValue(searchParams.page)
  if (page) raw.page = page

  const parsed = productSearchSchema.safeParse(raw)
  return parsed.success ? parsed.data : productSearchSchema.parse({})
}
