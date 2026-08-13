import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, SlidersHorizontal } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { db } from '@/server/db'
import { getPopularCategories } from '@/server/services/categories'
import { searchRequests } from '@/server/services/search'
import { requestSearchSchema } from '@/lib/validation'
import { REQUEST_SORTS } from '@/lib/constants'
import { buildQuery } from '@/lib/utils'
import { RequestCard } from '@/components/request/request-card'
import {
  Button,
  Checkbox,
  EmptyState,
  Pagination,
  Select,
  buttonVariants,
} from '@/components/ui'

/**
 * The public request board — the demand side of the marketplace.
 *
 * Only PUBLIC requests in an open status ever reach this page, and no offer content
 * does: a supplier browsing here sees what is needed and how many suppliers have already
 * answered, never what any of them quoted.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: t.seo.requestsTitle,
    description: t.seo.requestsDescription,
  }
}

export default async function RequestsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  // A hostile query string must degrade to the default board, never to a crash.
  const parsed = requestSearchSchema.safeParse(searchParams)
  const filters = parsed.success ? parsed.data : requestSearchSchema.parse({})

  const [results, categories, districts] = await Promise.all([
    searchRequests(filters, locale),
    getPopularCategories(12),
    db.district.findMany({
      select: { id: true, nameRu: true, nameRo: true },
      orderBy: locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' },
    }),
  ])

  const basePath = localePath(locale, 'requests')

  function hrefForPage(page: number): string {
    return `${basePath}${buildQuery({
      q: filters.q,
      category: filters.category,
      district: filters.district,
      recurring: filters.recurring ? 'true' : undefined,
      urgent: filters.urgent ? 'true' : undefined,
      sort: filters.sort === 'newest' ? undefined : filters.sort,
      page: page > 1 ? page : undefined,
    })}`
  }

  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">{t.request.title}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t.request.subtitle}</p>
        </div>
        <Link
          href={localePath(locale, 'requests', 'new')}
          className={buttonVariants({ variant: 'outline' })}
        >
          <ClipboardList className="mr-2 h-4 w-4" aria-hidden />
          {t.nav.postRequest}
        </Link>
      </div>

      {/* ----------------------------------------------------------- filters */}
      <form
        method="get"
        action={basePath}
        aria-label={t.filters.title}
        className="surface mt-6 p-4 md:p-5"
      >
        <div className="grid gap-4 md:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t.filters.category}</span>
            <Select name="category" defaultValue={filters.category ?? ''}>
              <option value="">{t.catalog.allCategories}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slugs[locale]}>
                  {category.names[locale]}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t.filters.region}</span>
            <Select name="district" defaultValue={filters.district ?? ''}>
              <option value="">{t.common.all}</option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {locale === 'ro' ? district.nameRo : district.nameRu}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t.sort.label}</span>
            <Select name="sort" defaultValue={filters.sort}>
              {REQUEST_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t.sort[sort]}
                </option>
              ))}
            </Select>
          </label>

          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-1.5 text-sm font-medium">{t.filters.title}</legend>
            <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
              <Checkbox name="recurring" value="true" defaultChecked={filters.recurring === true} />
              {t.filters.regularSupply}
            </label>
            <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
              <Checkbox name="urgent" value="true" defaultChecked={filters.urgent === true} />
              {t.filters.urgentOnly}
            </label>
          </fieldset>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit">
            <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
            {t.filters.apply}
          </Button>
          <Link
            href={basePath}
            className={buttonVariants({ variant: 'ghost', size: 'md' })}
          >
            {t.filters.reset}
          </Link>
        </div>
      </form>

      {/* ----------------------------------------------------------- results */}
      <p aria-live="polite" className="mt-6 text-sm text-muted-foreground">
        {fmt(t.catalog.resultsCount, { count: results.total })}
      </p>

      {results.items.length === 0 ? (
        <EmptyState
          className="surface mt-4"
          icon={<ClipboardList aria-hidden />}
          title={t.request.emptyTitle}
          description={t.request.emptyText}
          action={
            <Link href={localePath(locale, 'requests', 'new')} className={buttonVariants()}>
              {t.nav.postRequest}
            </Link>
          }
          secondaryAction={
            <Link href={basePath} className={buttonVariants({ variant: 'outline' })}>
              {t.filters.reset}
            </Link>
          }
        />
      ) : (
        <>
          {/* Density is deliberate: a buyer scanning the board needs many needs at once,
              so the column count does not drop — only the gap breathes above md. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {results.items.map((request) => (
              <RequestCard key={request.id} request={request} locale={locale} t={t} />
            ))}
          </div>

          <Pagination
            className="mt-8"
            page={results.page}
            pageCount={results.pageCount}
            buildHref={hrefForPage}
            labels={{
              previous: t.a11y.previousPage,
              next: t.a11y.nextPage,
              pagination: t.a11y.pagination,
            }}
          />
        </>
      )}
    </div>
  )
}
