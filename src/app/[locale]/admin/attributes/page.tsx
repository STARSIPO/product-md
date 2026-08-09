import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { buildQuery, parsePage } from '@/lib/utils'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { Badge, Input, Pagination, Select, buttonVariants } from '@/components/ui'

/**
 * Every category attribute in one list.
 *
 * Editing happens on the category screen, where an attribute makes sense next to its
 * siblings and its options. What is impossible there is the cross-cutting question an
 * operator actually has: "did we call it `weight` under Мясо and `ves` under Овощи?" —
 * inconsistent keys are what make a filter silently return nothing, and they are only
 * visible when the whole taxonomy is on one page.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 40

const ATTRIBUTE_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'MULTISELECT', 'BOOL', 'DATE'] as const

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.attributes} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

function categoryLabel(
  row: { slug: string; level: number; translations: { locale: string; name: string }[] },
  locale: Locale,
): string {
  const name = row.translations.find((item) => item.locale === locale)?.name ?? row.slug
  return `${'— '.repeat(row.level)}${name}`
}

export default async function AdminAttributesPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'attributes')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  const category = typeof searchParams.category === 'string' ? searchParams.category : undefined
  const type = typeof searchParams.type === 'string' ? searchParams.type : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.CategoryAttributeWhereInput = {
    ...(category ? { categoryId: category } : {}),
    ...(type ? { type } : {}),
    ...(q ? { key: { contains: q } } : {}),
  }

  const [total, rows, categories] = await Promise.all([
    db.categoryAttribute.count({ where }),
    db.categoryAttribute.findMany({
      where,
      orderBy: [{ key: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        key: true,
        type: true,
        unit: true,
        isRequired: true,
        isFilterable: true,
        appliesTo: true,
        inherited: true,
        translations: { select: { locale: true, label: true } },
        category: {
          select: {
            id: true,
            slug: true,
            level: true,
            translations: { select: { locale: true, name: true } },
          },
        },
        _count: { select: { options: true } },
      },
    }),
    db.category.findMany({
      orderBy: { path: 'asc' },
      select: {
        id: true,
        slug: true,
        level: true,
        translations: { select: { locale: true, name: true } },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const attributeTypes = t.admin.attributeTypes as Record<string, string | undefined>
  const appliesToLabels = t.admin.appliesTo as Record<string, string | undefined>

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'attribute',
      header: t.admin.attributeKey,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-medium">
            {row.translations.find((item) => item.locale === locale)?.label ?? row.key}
          </span>
          <p className="font-mono text-caption text-muted-foreground">{row.key}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: t.admin.categories,
      cell: (row) => (
        <Link
          href={`${localePath(locale, 'admin', 'categories')}?id=${encodeURIComponent(row.category.id)}`}
          className="rounded text-sm text-primary hover:text-primary-hover"
        >
          {categoryLabel(row.category, locale)}
        </Link>
      ),
    },
    {
      key: 'type',
      header: t.admin.attributeType,
      cell: (row) => (
        <span className="text-sm">
          {attributeTypes[row.type] ?? row.type}
          {row.unit ? ` · ${row.unit}` : ''}
        </span>
      ),
    },
    {
      key: 'flags',
      header: t.admin.attributeAppliesTo,
      cell: (row) => (
        <span className="flex flex-wrap gap-1">
          <Badge variant="outline" size="sm">
            {appliesToLabels[row.appliesTo] ?? row.appliesTo}
          </Badge>
          {row.isRequired ? (
            <Badge variant="warning" size="sm">
              {t.admin.attributeRequired}
            </Badge>
          ) : null}
          {row.isFilterable ? (
            <Badge variant="primary" size="sm">
              {t.admin.attributeFilterable}
            </Badge>
          ) : null}
          {row.inherited ? (
            <Badge variant="neutral" size="sm">
              {t.admin.attributeInherited}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'options',
      header: t.admin.attributeOptionsCount,
      align: 'right',
      cell: (row) => (
        <span className="tnum text-sm text-muted-foreground">{row._count.options}</span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      align: 'right',
      cell: (row) => (
        <Link
          href={`${localePath(locale, 'admin', 'categories')}?id=${encodeURIComponent(row.category.id)}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {t.admin.editInCategory}
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <TableToolbar
        action={basePath}
        label={t.common.filters}
        submitLabel={t.filters.apply}
        resetHref={basePath}
        resetLabel={t.filters.reset}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.search}</span>
          <Input name="q" defaultValue={q ?? ''} placeholder={t.admin.attributeKey} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.categories}</span>
          <Select name="category" defaultValue={category ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {categories.map((row) => (
              <option key={row.id} value={row.id}>
                {categoryLabel(row, locale)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.attributeType}</span>
          <Select name="type" defaultValue={type ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {ATTRIBUTE_TYPES.map((value) => (
              <option key={value} value={value}>
                {attributeTypes[value] ?? value}
              </option>
            ))}
          </Select>
        </label>
      </TableToolbar>

      <div>
        <p className="mb-3 tnum text-sm text-muted-foreground">
          {fmt(t.admin.totalRows, { count: total })}
        </p>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty={t.admin.empty}
          caption={t.admin.attributeIndex}
        />

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({ q, category, type, page: target > 1 ? target : undefined })}`
          }
          labels={{
            previous: t.a11y.previousPage,
            next: t.a11y.nextPage,
            pagination: t.a11y.pagination,
          }}
        />
      </div>
    </div>
  )
}
