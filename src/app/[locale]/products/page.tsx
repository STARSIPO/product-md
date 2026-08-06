import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, PackageSearch } from 'lucide-react'
import { getDictionary, fmt, resolveLocale, type Dictionary } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { db } from '@/server/db'
import { getAllCategories } from '@/server/services/categories'
import { searchProducts } from '@/server/services/search'
import { getCurrentUser } from '@/server/auth/session'
import { productSearchSchema, type ProductSearchParams } from '@/lib/validation'
import { formatMoney } from '@/lib/money'
import { buildQuery } from '@/lib/utils'
import { ProductCard } from '@/components/product/product-card'
import { FilterPanel, FilterSheet, type FilterOption } from '@/components/catalog/filter-panel'
import { SortSelect } from '@/components/catalog/sort-select'
import { ActiveFilters, type ActiveFilterChip } from '@/components/catalog/active-filters'
import { EmptyState, Pagination, buttonVariants } from '@/components/ui'

/**
 * The catalogue.
 *
 * Everything that shapes the result set lives in the URL and is re-read on the server:
 * filters are links and GET forms, so a filtered view is shareable, crawlable and works
 * with JavaScript disabled. The only client code on the page is the mobile filter sheet
 * and the auto-submitting sort control.
 *
 * A hostile query string degrades to the default catalogue rather than a 500 — the
 * parse is a `safeParse` with the schema's own defaults as the fallback.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: t.seo.catalogTitle,
    description: t.seo.catalogDescription,
  }
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await getCurrentUser()

  const filters = parseProductFilters(searchParams)
  const basePath = localePath(locale, 'products')

  const [results, categories, districts] = await Promise.all([
    searchProducts(filters, locale),
    getAllCategories(),
    db.district.findMany({
      select: { id: true, nameRu: true, nameRo: true },
      orderBy: locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' },
    }),
  ])

  const categoryOptions: FilterOption[] = categories
    .map((category) => ({
      value: category.slugs[locale],
      label: category.trail.map((step) => step.name[locale]).join(' → '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))

  const districtOptions: FilterOption[] = districts.map((district) => ({
    value: district.id,
    label: locale === 'ro' ? district.nameRo : district.nameRu,
  }))

  const categoryLabel = categoryOptions.find((option) => option.value === filters.category)?.label
  const districtLabel = districtOptions.find((option) => option.value === filters.district)?.label

  const chips = buildChips({ filters, basePath, locale, t, categoryLabel, districtLabel })

  const panelProps = {
    action: basePath,
    values: toFilterValues(filters),
    categories: categoryOptions,
    districts: districtOptions,
    resetHref: basePath,
  }

  return (
    <div className="container py-6 md:py-8">
      <header>
        <h1 className="text-h1">{t.catalog.title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t.catalog.subtitle}</p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
        {/* ------------------------------------------------- desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-lg border border-border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">{t.filters.title}</h2>
            <FilterPanel {...panelProps} />
          </div>
        </aside>

        <div className="min-w-0">
          {/* ------------------------------------------------------- toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <FilterSheet {...panelProps} />

            <p aria-live="polite" className="tnum text-sm text-muted-foreground">
              {fmt(t.catalog.resultsCount, { count: results.total })}
            </p>

            <SortSelect
              className="ml-auto"
              action={basePath}
              value={filters.sort}
              hidden={hiddenSortFields(filters)}
            />
          </div>

          {chips.length > 0 ? (
            <div className="mt-4">
              <ActiveFilters chips={chips} resetHref={basePath} />
            </div>
          ) : null}

          {/* ------------------------------------------------------- results */}
          {results.items.length === 0 ? (
            <EmptyState
              className="mt-6 rounded-lg border border-border bg-card"
              icon={<PackageSearch aria-hidden />}
              title={t.catalog.emptyTitle}
              description={t.catalog.emptyText}
              action={
                <Link href={basePath} className={buttonVariants({ variant: 'outline' })}>
                  {t.catalog.emptyAction}
                </Link>
              }
              secondaryAction={
                <Link href={localePath(locale, 'requests', 'new')} className={buttonVariants()}>
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  {t.catalog.emptyCreateRequest}
                </Link>
              }
            />
          ) : (
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
                  hrefFor(basePath, filters, { page: page > 1 ? page : undefined })
                }
                labels={{
                  previous: t.a11y.previousPage,
                  next: t.a11y.nextPage,
                  pagination: t.a11y.pagination,
                }}
              />

              {/* The demand side of the marketplace, offered where the search ends. */}
              <p className="mt-8 rounded-lg border border-dashed border-border bg-card px-4 py-5 text-center text-sm text-muted-foreground">
                {t.catalog.emptyCreateRequest}{' '}
                <Link
                  href={localePath(locale, 'requests', 'new')}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {t.nav.postRequest}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* URL <-> filter plumbing                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A GET form submits empty fields as `unit=`, and `z.enum` rejects an empty string —
 * which would throw away every other filter with it. Blanks are dropped before the
 * schema ever sees them.
 */
function parseProductFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ProductSearchParams {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined && first !== '') raw[key] = first
  }

  const parsed = productSearchSchema.safeParse(raw)
  return parsed.success ? parsed.data : productSearchSchema.parse({})
}

type QueryValues = Record<string, string | number | undefined>

/** Bani back to the "95.5" form the schema accepts on the way in. */
function baniToInput(bani: number): string {
  return String(bani / 100)
}

function toQueryValues(filters: ProductSearchParams): QueryValues {
  return {
    q: filters.q,
    category: filters.category,
    priceMin: filters.priceMin !== undefined ? baniToInput(filters.priceMin) : undefined,
    priceMax: filters.priceMax !== undefined ? baniToInput(filters.priceMax) : undefined,
    unit: filters.unit,
    minOrderMax: filters.minOrderMax,
    district: filters.district,
    // `z.coerce.boolean()` reads "false" as true, so a disabled flag must be absent.
    delivery: filters.delivery ? 'true' : undefined,
    pickup: filters.pickup ? 'true' : undefined,
    verified: filters.verified ? 'true' : undefined,
    origin: filters.origin,
    availability: filters.availability,
    regular: filters.regular ? 'true' : undefined,
    ratingMin: filters.ratingMin,
    since: filters.since,
    sort: filters.sort === 'relevance' ? undefined : filters.sort,
    page: filters.page > 1 ? filters.page : undefined,
  }
}

/** Same URL with a few parameters replaced — used by pagination and by every chip. */
function hrefFor(
  basePath: string,
  filters: ProductSearchParams,
  overrides: QueryValues,
): string {
  return `${basePath}${buildQuery({ ...toQueryValues(filters), ...overrides })}`
}

/** Everything except `sort` and `page`, as hidden inputs for the sort form. */
function hiddenSortFields(filters: ProductSearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(toQueryValues(filters))) {
    if (key === 'sort' || key === 'page' || value === undefined) continue
    out[key] = String(value)
  }
  return out
}

function toFilterValues(filters: ProductSearchParams) {
  return {
    q: filters.q,
    category: filters.category,
    priceMin: filters.priceMin !== undefined ? baniToInput(filters.priceMin) : undefined,
    priceMax: filters.priceMax !== undefined ? baniToInput(filters.priceMax) : undefined,
    unit: filters.unit,
    minOrderMax: filters.minOrderMax !== undefined ? String(filters.minOrderMax) : undefined,
    district: filters.district,
    delivery: filters.delivery === true,
    pickup: filters.pickup === true,
    verified: filters.verified === true,
    origin: filters.origin,
    availability: filters.availability,
    regular: filters.regular === true,
    ratingMin: filters.ratingMin !== undefined ? String(filters.ratingMin) : undefined,
    since: filters.since,
    sort: filters.sort === 'relevance' ? undefined : filters.sort,
  }
}

function buildChips({
  filters,
  basePath,
  locale,
  t,
  categoryLabel,
  districtLabel,
}: {
  filters: ProductSearchParams
  basePath: string
  locale: Locale
  t: Dictionary
  categoryLabel?: string | undefined
  districtLabel?: string | undefined
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []
  const drop = (key: string) => hrefFor(basePath, filters, { [key]: undefined, page: undefined })

  const sinceLabels: Record<'24h' | '7d' | '30d', string> = {
    '24h': t.filters.publishedLast24h,
    '7d': t.filters.publishedLast7d,
    '30d': t.filters.publishedLast30d,
  }

  if (filters.q) {
    chips.push({ key: 'q', label: fmt(t.catalog.forQuery, { query: filters.q }), href: drop('q') })
  }
  if (filters.category) {
    chips.push({ key: 'category', label: categoryLabel ?? filters.category, href: drop('category') })
  }
  if (filters.priceMin !== undefined) {
    chips.push({
      key: 'priceMin',
      label: `${t.filters.priceFrom}: ${formatMoney(filters.priceMin, locale)}`,
      href: drop('priceMin'),
    })
  }
  if (filters.priceMax !== undefined) {
    chips.push({
      key: 'priceMax',
      label: `${t.filters.priceTo}: ${formatMoney(filters.priceMax, locale)}`,
      href: drop('priceMax'),
    })
  }
  if (filters.unit) {
    chips.push({
      key: 'unit',
      label: `${t.filters.unit}: ${t.units[filters.unit]}`,
      href: drop('unit'),
    })
  }
  if (filters.minOrderMax !== undefined) {
    chips.push({
      key: 'minOrderMax',
      label: `${t.filters.minOrderUpTo}: ${filters.minOrderMax}`,
      href: drop('minOrderMax'),
    })
  }
  if (filters.district) {
    chips.push({
      key: 'district',
      label: `${t.filters.region}: ${districtLabel ?? filters.district}`,
      href: drop('district'),
    })
  }
  if (filters.availability) {
    chips.push({
      key: 'availability',
      label: t.availability[filters.availability],
      href: drop('availability'),
    })
  }
  if (filters.origin) {
    chips.push({
      key: 'origin',
      label: `${t.filters.origin}: ${filters.origin}`,
      href: drop('origin'),
    })
  }
  if (filters.ratingMin !== undefined) {
    chips.push({
      key: 'ratingMin',
      label: fmt(t.filters.ratingFrom, { value: filters.ratingMin }),
      href: drop('ratingMin'),
    })
  }
  if (filters.since) {
    chips.push({ key: 'since', label: sinceLabels[filters.since], href: drop('since') })
  }
  if (filters.delivery) {
    chips.push({ key: 'delivery', label: t.filters.deliveryAvailable, href: drop('delivery') })
  }
  if (filters.pickup) {
    chips.push({ key: 'pickup', label: t.filters.pickup, href: drop('pickup') })
  }
  if (filters.verified) {
    chips.push({ key: 'verified', label: t.filters.verifiedOnly, href: drop('verified') })
  }
  if (filters.regular) {
    chips.push({ key: 'regular', label: t.filters.regularSupply, href: drop('regular') })
  }

  return chips
}
