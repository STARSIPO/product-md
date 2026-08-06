import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardList, PackageSearch } from 'lucide-react'
import { env } from '@/env'
import { getDictionary, fmt, resolveLocale, type Dictionary } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { db } from '@/server/db'
import {
  getCategoryBySlug,
  getCategoryById,
  getChildren,
  type CategoryNode,
} from '@/server/services/categories'
import { searchProducts } from '@/server/services/search'
import { getCurrentUser } from '@/server/auth/session'
import { productSearchSchema, type ProductSearchParams } from '@/lib/validation'
import { formatMoney } from '@/lib/money'
import { buildQuery } from '@/lib/utils'
import { ProductCard } from '@/components/product/product-card'
import { FilterPanel, FilterSheet, type FilterOption } from '@/components/catalog/filter-panel'
import { SortSelect } from '@/components/catalog/sort-select'
import { ActiveFilters, type ActiveFilterChip } from '@/components/catalog/active-filters'
import { Breadcrumbs, EmptyState, Pagination, buttonVariants } from '@/components/ui'

/**
 * A category landing page.
 *
 * This is the indexable half of the catalogue: one stable URL per category, per
 * language, with the products of the whole subtree beneath it. The facets are the same
 * GET form as /products — only the category moves from the query string into the path,
 * where it can carry a breadcrumb trail and structured data.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const category = await getCategoryBySlug(params.slug, locale)

  if (!category) {
    return { title: t.states.notFoundTitle, robots: { index: false, follow: false } }
  }

  const name = category.names[locale]
  return {
    title: fmt(t.seo.categoryTitle, { category: name }),
    description: fmt(t.seo.categoryDescription, { category: name }),
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await getCurrentUser()

  const category = await getCategoryBySlug(params.slug, locale)
  if (!category) notFound()

  const categorySlug = category.slugs[locale]
  const basePath = localePath(locale, 'category', categorySlug)
  const filters = parseProductFilters(searchParams)

  const [results, children, trailNodes, districts] = await Promise.all([
    // The path wins over anything a crafted query string might claim.
    searchProducts({ ...filters, category: categorySlug }, locale),
    getChildren(category.id),
    Promise.all(category.trail.map((step) => getCategoryById(step.id))),
    db.district.findMany({
      select: { id: true, nameRu: true, nameRo: true },
      orderBy: locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' },
    }),
  ])

  const trail = trailNodes.filter((node): node is CategoryNode => node !== null)

  const districtOptions: FilterOption[] = districts.map((district) => ({
    value: district.id,
    label: locale === 'ro' ? district.nameRo : district.nameRu,
  }))
  const districtLabel = districtOptions.find((option) => option.value === filters.district)?.label

  const chips = buildChips({ filters, basePath, locale, t, districtLabel })

  const panelProps = {
    action: basePath,
    values: { ...toFilterValues(filters), category: categorySlug },
    categories: [] as FilterOption[],
    districts: districtOptions,
    lockCategory: true,
    resetHref: basePath,
  }

  const breadcrumbs = [
    { label: t.catalog.breadcrumbHome, href: localePath(locale) },
    { label: t.catalog.title, href: localePath(locale, 'products') },
    ...trail.map((node) => ({
      label: node.names[locale],
      href: localePath(locale, 'category', node.slugs[locale]),
    })),
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: `${env.APP_URL}${crumb.href}`,
    })),
  }

  return (
    <div className="container py-6 md:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <Breadcrumbs label={t.a11y.breadcrumb} items={breadcrumbs} />

      <header className="mt-4">
        <h1 className="text-h1">{category.names[locale]}</h1>
        <p className="mt-2 text-muted-foreground">
          {fmt(t.seo.categoryDescription, { category: category.names[locale] })}
        </p>
      </header>

      {children.length > 0 ? (
        <nav aria-label={t.catalog.subcategories} className="mt-5">
          <h2 className="text-sm font-semibold">{t.catalog.subcategories}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={localePath(locale, 'category', child.slugs[locale])}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-card px-3.5 text-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-[36px]"
                >
                  {child.names[locale]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-lg border border-border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">{t.filters.title}</h2>
            <FilterPanel {...panelProps} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <FilterSheet {...panelProps} />

            <p aria-live="polite" className="tnum text-sm text-muted-foreground">
              {fmt(t.catalog.resultsCount, { count: results.total })}{' '}
              {fmt(t.catalog.inCategory, { category: category.names[locale] })}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* URL <-> filter plumbing (the category itself lives in the path, not the query) */
/* -------------------------------------------------------------------------- */

function parseProductFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ProductSearchParams {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'category') continue
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined && first !== '') raw[key] = first
  }

  const parsed = productSearchSchema.safeParse(raw)
  return parsed.success ? parsed.data : productSearchSchema.parse({})
}

type QueryValues = Record<string, string | number | undefined>

function baniToInput(bani: number): string {
  return String(bani / 100)
}

function toQueryValues(filters: ProductSearchParams): QueryValues {
  return {
    q: filters.q,
    priceMin: filters.priceMin !== undefined ? baniToInput(filters.priceMin) : undefined,
    priceMax: filters.priceMax !== undefined ? baniToInput(filters.priceMax) : undefined,
    unit: filters.unit,
    minOrderMax: filters.minOrderMax,
    district: filters.district,
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

function hrefFor(basePath: string, filters: ProductSearchParams, overrides: QueryValues): string {
  return `${basePath}${buildQuery({ ...toQueryValues(filters), ...overrides })}`
}

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
  districtLabel,
}: {
  filters: ProductSearchParams
  basePath: string
  locale: Locale
  t: Dictionary
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
