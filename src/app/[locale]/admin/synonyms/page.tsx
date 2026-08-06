import type { Metadata } from 'next'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { buildQuery, parsePage } from '@/lib/utils'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { TableToolbar } from '@/components/admin/data-table'
import {
  SuggestTester,
  SynonymRow,
  type CategoryOption,
  type SynonymValues,
} from '../categories/category-editor'
import { Input, Pagination, Select } from '@/components/ui'

/**
 * Synonym editor.
 *
 * This table is what makes the category picker feel like it understands Moldovan trade
 * vocabulary: «картошка» → «Картофель», "rosii" → «Помидоры», plus the misspellings
 * people actually type. `normalized` is recomputed by the server on every save — the
 * matcher only ever compares normalized strings, so a hand-edited value would be dead
 * weight in the index.
 *
 * The tester at the bottom runs the real suggester so a change can be verified in the
 * same breath as it is made.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 40

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.synonyms} — ${t.admin.title}`,
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

export default async function AdminSynonymsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'synonyms')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  const category = typeof searchParams.category === 'string' ? searchParams.category : undefined
  const synonymLocale = typeof searchParams.locale === 'string' ? searchParams.locale : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.CategorySynonymWhereInput = {
    ...(category ? { categoryId: category } : {}),
    ...(synonymLocale ? { locale: synonymLocale } : {}),
    ...(q ? { OR: [{ term: { contains: q } }, { normalized: { contains: q } }] } : {}),
  }

  const [total, rows, categories] = await Promise.all([
    db.categorySynonym.count({ where }),
    db.categorySynonym.findMany({
      where,
      orderBy: [{ categoryId: 'asc' }, { term: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        categoryId: true,
        locale: true,
        term: true,
        normalized: true,
        weight: true,
        isMisspelling: true,
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

  const options: CategoryOption[] = categories.map((row) => ({
    id: row.id,
    label: categoryLabel(row, locale),
  }))

  const blank: SynonymValues = {
    id: '',
    categoryId: category ?? '',
    locale: synonymLocale === 'ro' ? 'ro' : 'ru',
    term: '',
    normalized: '',
    weight: 100,
    isMisspelling: false,
  }

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
          <Input name="q" defaultValue={q ?? ''} placeholder={t.admin.synonymTerm} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.categories}</span>
          <Select name="category" defaultValue={category ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.synonymLocale}</span>
          <Select name="locale" defaultValue={synonymLocale ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            <option value="ru">ru</option>
            <option value="ro">ro</option>
          </Select>
        </label>
      </TableToolbar>

      <div>
        <p className="mb-3 tnum text-sm text-muted-foreground">
          {fmt(t.admin.totalRows, { count: total })}
        </p>

        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t.admin.empty}</p>
          ) : (
            rows.map((row) => (
              <SynonymRow
                key={row.id}
                synonym={{
                  id: row.id,
                  categoryId: row.categoryId,
                  locale: row.locale,
                  term: row.term,
                  normalized: row.normalized,
                  weight: row.weight,
                  isMisspelling: row.isMisspelling,
                }}
                categories={options}
              />
            ))
          )}

          <div className="bg-muted/40">
            <p className="px-4 pt-3 text-sm font-semibold">{t.admin.newSynonym}</p>
            <SynonymRow key={`new-${category ?? 'all'}`} synonym={blank} categories={options} />
          </div>
        </div>

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({
              q,
              category,
              locale: synonymLocale,
              page: target > 1 ? target : undefined,
            })}`
          }
          labels={{
            previous: t.a11y.previousPage,
            next: t.a11y.nextPage,
            pagination: t.a11y.pagination,
          }}
        />
      </div>

      <SuggestTester locale={locale} />
    </div>
  )
}
