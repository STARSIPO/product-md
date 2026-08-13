import type { Metadata } from 'next'
import type { Prisma } from '@prisma/client'
import Link from 'next/link'
import { Search, Store } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { db } from '@/server/db'
import { getCategoryBySlug, getSubtreeIds } from '@/server/services/categories'
import { supplierSearchSchema } from '@/lib/validation'
import { PAGE_SIZE } from '@/lib/constants'
import { buildQuery } from '@/lib/utils'
import { CompanyCard } from '@/components/company/company-card'
import {
  Button,
  Checkbox,
  EmptyState,
  Input,
  Pagination,
  Select,
  buttonVariants,
} from '@/components/ui'

/**
 * The supplier directory.
 *
 * Ordered by rating first: a buyer scanning this page is choosing who to trust, and
 * only companies with a real deal history can earn a rating — so the ordering doubles as
 * a proof-of-work ranking. Filters are a plain GET form, like everywhere else in the
 * public surface, so a filtered directory is a shareable URL.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: t.seo.suppliersTitle,
    description: t.seo.suppliersDescription,
  }
}

export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined && first !== '') raw[key] = first
  }
  const parsed = supplierSearchSchema.safeParse(raw)
  const filters = parsed.success ? parsed.data : supplierSearchSchema.parse({})

  const basePath = localePath(locale, 'suppliers')

  // A category filter reaches suppliers through their live listings, so the directory
  // can answer "who sells meat" without a second denormalized table.
  const categoryNode = filters.category ? await getCategoryBySlug(filters.category, locale) : null
  const categoryIds = categoryNode ? await getSubtreeIds(categoryNode.id) : null

  const where: Prisma.CompanyWhereInput = {
    status: 'ACTIVE',
    isSeller: true,
    deletedAt: null,
    ...(filters.q ? { displayName: { contains: filters.q } } : {}),
    ...(filters.district ? { districtId: filters.district } : {}),
    ...(filters.verified
      ? { badges: { some: { type: 'TRUSTED_SUPPLIER', status: 'APPROVED' } } }
      : {}),
    ...(filters.category
      ? {
          products: categoryIds
            ? { some: { categoryId: { in: categoryIds }, status: 'ACTIVE', deletedAt: null } }
            : // Unknown category slug must return nothing, not everything.
              { some: { id: '__no_such_category__' } },
        }
      : {}),
  }

  const page = Math.max(1, filters.page)

  const [total, companies, districts] = await Promise.all([
    db.company.count({ where }),
    db.company.findMany({
      where,
      include: {
        district: true,
        locality: true,
        badges: { where: { status: 'APPROVED' }, select: { type: true } },
        _count: { select: { products: { where: { status: 'ACTIVE', deletedAt: null } } } },
      },
      orderBy: [{ ratingAvg: 'desc' }, { dealsCompleted: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.district.findMany({
      select: { id: true, nameRu: true, nameRo: true },
      orderBy: locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function hrefForPage(target: number): string {
    return `${basePath}${buildQuery({
      q: filters.q,
      district: filters.district,
      category: filters.category,
      verified: filters.verified ? 'true' : undefined,
      page: target > 1 ? target : undefined,
    })}`
  }

  return (
    <div className="container py-8 md:py-10">
      <header>
        <h1 className="text-h1">{t.nav.suppliers}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t.seo.suppliersDescription}</p>
      </header>

      <form
        method="get"
        action={basePath}
        aria-label={t.filters.title}
        className="surface mt-6 min-w-0 p-5"
      >
        {filters.category ? (
          <input type="hidden" name="category" value={filters.category} />
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{t.common.search}</span>
            <Input
              name="q"
              type="search"
              autoComplete="off"
              defaultValue={filters.q ?? ''}
              placeholder={t.company.displayNamePlaceholder}
            />
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

          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-1.5 text-sm font-medium">{t.filters.title}</legend>
            <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
              <Checkbox name="verified" value="true" defaultChecked={filters.verified === true} />
              {t.filters.verifiedOnly}
            </label>
          </fieldset>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden />
            {t.filters.apply}
          </Button>
          <Link href={basePath} className={buttonVariants({ variant: 'ghost' })}>
            {t.filters.reset}
          </Link>
        </div>
      </form>

      <p aria-live="polite" className="tnum mt-6 text-sm text-muted-foreground">
        {fmt(t.catalog.resultsCount, { count: total })}
      </p>

      {companies.length === 0 ? (
        <EmptyState
          className="surface mt-4"
          icon={<Store aria-hidden />}
          title={t.catalog.emptyTitle}
          description={t.catalog.emptyText}
          action={
            <Link href={basePath} className={buttonVariants({ variant: 'outline' })}>
              {t.filters.reset}
            </Link>
          }
          secondaryAction={
            <Link href={localePath(locale, 'requests', 'new')} className={buttonVariants()}>
              {t.catalog.emptyCreateRequest}
            </Link>
          }
        />
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
            {companies.map((company) => (
              <CompanyCard key={company.id} company={company} locale={locale} t={t} />
            ))}
          </div>

          <Pagination
            className="mt-8"
            page={page}
            pageCount={pageCount}
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
