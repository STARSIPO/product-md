import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { localePath, type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n'

/**
 * The catalogue rail — a dense, always-visible list of every top-level category with
 * its live listing count.
 *
 * This is the primary navigation on a marketplace homepage: a visitor who came to buy
 * potatoes wants the category list, not a value proposition. It is a plain list of
 * links, so it is fully crawlable and works without JavaScript.
 *
 * Desktop: a sticky left column. Mobile: a horizontally scrollable chip row, because a
 * 21-item vertical list would push the actual listings off the first screen.
 */

export interface CategoryRailItem {
  id: string
  name: string
  slug: string
  count: number
}

export function CategoryRail({
  categories,
  locale,
  t,
}: {
  categories: CategoryRailItem[]
  locale: Locale
  t: Dictionary
}) {
  if (categories.length === 0) return null

  return (
    <>
      {/* --------------------------------------------------------- desktop */}
      {/*
        `min-w-0` on both navs is load-bearing, not decoration. As grid items they
        default to `min-width: auto`, which refuses to shrink below their content — the
        horizontally scrolling chip row then stretched the grid to ~1600px and the whole
        page scrolled sideways on every phone width.
      */}
      <nav aria-label={t.home.catalogTitle} className="hidden min-w-0 lg:block">
        <div className="sticky top-20 overflow-hidden rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            {t.home.catalogTitle}
          </h2>
          <ul className="py-1">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={localePath(locale, 'category', category.slug)}
                  className="group flex items-center gap-2 px-4 py-[7px] text-sm transition-colors hover:bg-primary-soft/50 hover:text-primary"
                >
                  <span className="min-w-0 flex-1 truncate">{category.name}</span>
                  {category.count > 0 ? (
                    <span className="tnum shrink-0 text-caption text-muted-foreground">
                      {category.count}
                    </span>
                  ) : null}
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={localePath(locale, 'products')}
            className="block border-t border-border px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary-soft/50"
          >
            {t.home.allCategories}
          </Link>
        </div>
      </nav>

      {/* ---------------------------------------------------------- mobile */}
      <nav aria-label={t.home.catalogTitle} className="min-w-0 lg:hidden">
        <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={localePath(locale, 'category', category.slug)}
                className="flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                {category.name}
                {category.count > 0 ? (
                  <span className="tnum text-caption text-muted-foreground">{category.count}</span>
                ) : null}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={localePath(locale, 'products')}
              className="flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-primary bg-primary-soft px-3.5 text-sm font-medium text-primary"
            >
              {t.home.allCategories}
            </Link>
          </li>
        </ul>
      </nav>
    </>
  )
}
