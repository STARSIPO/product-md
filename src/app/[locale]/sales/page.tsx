import type { Metadata } from 'next'
import Link from 'next/link'
import { Percent, Tag } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { db } from '@/server/db'
import { getAllCategories } from '@/server/services/categories'
import { searchSales } from '@/server/services/sales'
import { getCurrentUser } from '@/server/auth/session'
import { buildQuery, parsePage } from '@/lib/utils'
import { ProductCard } from '@/components/product/product-card'
import { SaleFilters, type SaleFilterOption } from '@/components/sales/sale-filters'
import { saleEndsLabel } from '@/components/sales/sale-price'
import { EmptyState, Pagination, buttonVariants } from '@/components/ui'

/**
 * «Акции» — every listing whose price actually went down.
 *
 * Server-rendered and indexable, because this is the page a shopper searches for by
 * name. Filters live in the URL as a GET form, so a filtered view is shareable and
 * survives JavaScript being off.
 *
 * The ordering is fixed at "ending soonest" rather than offered as a choice: the one
 * thing a discount list has to answer is what is about to disappear. The fairness note
 * under the heading is not decoration — a discount page invites the suspicion that
 * position was bought, and the answer is that a listing is here only because its
 * seller lowered the price.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  return {
    title: t.seo.salesTitle,
    description: t.seo.salesDescription,
    alternates: { canonical: localePath(locale, 'sales') },
    openGraph: {
      type: 'website',
      title: t.seo.salesTitle,
      description: t.seo.salesDescription,
    },
  }
}

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { category?: string | string[]; district?: string | string[]; page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await getCurrentUser()

  const category = firstValue(searchParams.category)
  const district = firstValue(searchParams.district)
  const page = parsePage(searchParams.page)
  const basePath = localePath(locale, 'sales')

  const [results, categories, districts] = await Promise.all([
    searchSales(
      { ...(category ? { category } : {}), ...(district ? { district } : {}), page },
      locale,
    ),
    getAllCategories(),
    db.district.findMany({
      select: { id: true, nameRu: true, nameRo: true },
      orderBy: locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' },
    }),
  ])

  const categoryOptions: SaleFilterOption[] = categories
    .map((node) => ({
      value: node.slugs[locale],
      label: node.trail.map((step) => step.name[locale]).join(' → '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))

  const districtOptions: SaleFilterOption[] = districts.map((row) => ({
    value: row.id,
    label: locale === 'ro' ? row.nameRo : row.nameRu,
  }))

  return (
    <div className="container py-8 md:py-10">
      <header className="max-w-2xl">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip h-9 w-9 bg-accent-soft text-accent">
            <Percent className="h-4 w-4" aria-hidden />
          </span>
          <h1 className="text-h1">{t.sales.title}</h1>
        </div>
        <p className="mt-2 text-muted-foreground">{t.sales.subtitle}</p>
        <p className="mt-3 text-caption text-muted-foreground">{t.sales.fairnessNote}</p>
      </header>

      <div className="mt-6">
        <SaleFilters
          action={basePath}
          categories={categoryOptions}
          districts={districtOptions}
          values={{ category, district }}
          resetHref={basePath}
          t={t}
        />
      </div>

      {results.items.length === 0 ? (
        <EmptyState
          className="surface mt-6"
          icon={<Tag aria-hidden />}
          title={t.sales.emptyTitle}
          description={t.sales.emptyText}
          action={
            <Link href={localePath(locale, 'products')} className={buttonVariants()}>
              {t.sales.emptyAction}
            </Link>
          }
        />
      ) : (
        <>
          <p aria-live="polite" className="tnum mt-6 text-sm text-muted-foreground">
            {fmt(t.sales.count, { count: results.total })}
          </p>

          {/* Same density as the catalogue: two columns at 320px, never one. */}
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {results.items.map((product, index) => {
              const endsLabel = saleEndsLabel(product.discountEndsAt, locale, t)

              return (
                <li key={product.id} className="min-w-0">
                  <ProductCard
                    product={product}
                    locale={locale}
                    t={t}
                    showFavorite={user !== null}
                    priority={index < 4}
                  />
                  {endsLabel ? (
                    <p className="mt-1.5 px-1 text-caption text-muted-foreground">{endsLabel}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>

          <Pagination
            className="mt-8"
            page={results.page}
            pageCount={results.pageCount}
            buildHref={(target) =>
              `${basePath}${buildQuery({
                category,
                district,
                page: target > 1 ? target : undefined,
              })}`
            }
            labels={{
              pagination: t.a11y.pagination,
              previous: t.a11y.previousPage,
              next: t.a11y.nextPage,
            }}
          />
        </>
      )}
    </div>
  )
}

/** A repeated `?category=` arrives as an array; take the first and ignore the rest. */
function firstValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === undefined || first === '' ? undefined : first
}
