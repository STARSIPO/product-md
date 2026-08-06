import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import {
  AttributeList,
  CategoryEditor,
  type AttributeFormValues,
  type CategoryFormValues,
  type CategoryOption,
} from './category-editor'
import { Badge, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Category tree editor.
 *
 * The taxonomy is the spine of the catalogue: `path` powers subtree queries, the
 * localized slugs are public URLs in two languages, and the attributes decide what a
 * seller is asked to fill in. All of it is editable here rather than in a migration,
 * because the taxonomy of a food marketplace changes with the seasons.
 *
 * Selection lives in `?id=`, so a particular category is a link a colleague can be sent.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.categories} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

const EMPTY_CATEGORY: CategoryFormValues = {
  id: '',
  parentId: '',
  slug: '',
  nameRu: '',
  nameRo: '',
  slugRu: '',
  slugRo: '',
  sortOrder: 0,
  isPopular: false,
  isActive: true,
  defaultUnit: 'KG',
  icon: '',
}

function translationOf(
  translations: readonly { locale: string; name: string; slug: string }[],
  locale: Locale,
): { name: string; slug: string } {
  const match = translations.find((row) => row.locale === locale)
  return { name: match?.name ?? '', slug: match?.slug ?? '' }
}

export default async function AdminCategoriesPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'categories')
  const selectedId = typeof searchParams.id === 'string' ? searchParams.id : undefined
  const creating = selectedId === 'new'

  const categories = await db.category.findMany({
    orderBy: [{ path: 'asc' }],
    select: {
      id: true,
      parentId: true,
      slug: true,
      path: true,
      level: true,
      isActive: true,
      isPopular: true,
      sortOrder: true,
      defaultUnit: true,
      icon: true,
      translations: { select: { locale: true, name: true, slug: true } },
      _count: { select: { products: true, children: true } },
    },
  })

  const selected =
    !creating && selectedId ? categories.find((row) => row.id === selectedId) : undefined

  const attributes: AttributeFormValues[] = selected
    ? (
        await db.categoryAttribute.findMany({
          where: { categoryId: selected.id },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            categoryId: true,
            key: true,
            type: true,
            unit: true,
            isRequired: true,
            isFilterable: true,
            appliesTo: true,
            sortOrder: true,
            inherited: true,
            translations: { select: { locale: true, label: true, hint: true } },
            options: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                value: true,
                sortOrder: true,
                translations: { select: { locale: true, label: true } },
              },
            },
          },
        })
      ).map((attribute) => ({
        id: attribute.id,
        categoryId: attribute.categoryId,
        key: attribute.key,
        type: attribute.type,
        unit: attribute.unit ?? '',
        isRequired: attribute.isRequired,
        isFilterable: attribute.isFilterable,
        appliesTo: attribute.appliesTo,
        sortOrder: attribute.sortOrder,
        inherited: attribute.inherited,
        labelRu: attribute.translations.find((row) => row.locale === 'ru')?.label ?? '',
        labelRo: attribute.translations.find((row) => row.locale === 'ro')?.label ?? '',
        hintRu: attribute.translations.find((row) => row.locale === 'ru')?.hint ?? '',
        hintRo: attribute.translations.find((row) => row.locale === 'ro')?.hint ?? '',
        options: attribute.options.map((option) => ({
          id: option.id,
          value: option.value,
          sortOrder: option.sortOrder,
          labelRu: option.translations.find((row) => row.locale === 'ru')?.label ?? '',
          labelRo: option.translations.find((row) => row.locale === 'ro')?.label ?? '',
        })),
      }))
    : []

  const values: CategoryFormValues = selected
    ? {
        id: selected.id,
        parentId: selected.parentId ?? '',
        slug: selected.slug,
        nameRu: translationOf(selected.translations, 'ru').name,
        nameRo: translationOf(selected.translations, 'ro').name,
        slugRu: translationOf(selected.translations, 'ru').slug,
        slugRo: translationOf(selected.translations, 'ro').slug,
        sortOrder: selected.sortOrder,
        isPopular: selected.isPopular,
        isActive: selected.isActive,
        defaultUnit: selected.defaultUnit,
        icon: selected.icon ?? '',
      }
    : EMPTY_CATEGORY

  // A category may not be moved under itself or one of its own descendants.
  const parentOptions: CategoryOption[] = categories
    .filter(
      (row) =>
        !selected || (row.id !== selected.id && !row.path.startsWith(`${selected.path}/`)),
    )
    .map((row) => ({
      id: row.id,
      label: `${'— '.repeat(row.level)}${translationOf(row.translations, locale).name || row.slug}`,
    }))

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      {/* ------------------------------------------------------------- tree */}
      <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-h3">{t.admin.categoryTree}</h2>
          <Link
            href={`${basePath}?id=new`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {t.common.add}
          </Link>
        </div>

        <ul className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card py-1">
          {categories.map((row) => {
            const active = row.id === selected?.id
            return (
              <li key={row.id}>
                <Link
                  href={`${basePath}?id=${encodeURIComponent(row.id)}`}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex min-h-[44px] items-center gap-2 px-3 py-1.5 text-sm transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                      ? 'bg-primary-soft font-semibold text-primary'
                      : 'hover:bg-muted',
                  )}
                  style={{ paddingLeft: `${12 + row.level * 14}px` }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {translationOf(row.translations, locale).name || row.slug}
                  </span>
                  {!row.isActive ? (
                    <Badge variant="neutral" size="sm">
                      {t.admin.flagDisabled}
                    </Badge>
                  ) : null}
                  <span className="tnum text-caption text-muted-foreground">
                    {row._count.products}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ----------------------------------------------------------- editor */}
      <div className="min-w-0 space-y-5">
        <CategoryEditor
          key={values.id || 'new'}
          category={values}
          parents={parentOptions}
          basePath={basePath}
        />

        {selected ? (
          <AttributeList
            key={`attributes-${selected.id}`}
            categoryId={selected.id}
            attributes={attributes}
          />
        ) : null}
      </div>
    </div>
  )
}
