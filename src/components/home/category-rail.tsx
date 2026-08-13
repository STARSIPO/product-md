import Link from 'next/link'
import {
  Apple,
  Beef,
  Carrot,
  ChefHat,
  ChevronRight,
  Container,
  Croissant,
  CupSoda,
  Droplet,
  Drumstick,
  Egg,
  Fish,
  Hexagon,
  Milk,
  Package,
  ShoppingBasket,
  Snowflake,
  Soup,
  SprayCan,
  Truck,
  Utensils,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
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
  /** Icon key stored on the category row; unknown keys fall back to a basket. */
  icon?: string | null
}

/**
 * The taxonomy stores an icon *name*, not a component, so the mapping lives here —
 * next to the only place that renders it. Anything unmapped gets the basket rather
 * than an empty hole, which keeps the rail's left edge aligned.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  apple: Apple,
  beef: Beef,
  bread: Croissant,
  carrot: Carrot,
  'chef-hat': ChefHat,
  cup: CupSoda,
  droplet: Droplet,
  drumstick: Drumstick,
  egg: Egg,
  fish: Fish,
  honey: Hexagon,
  jar: Container,
  milk: Milk,
  package: Package,
  pepper: Soup,
  snowflake: Snowflake,
  spray: SprayCan,
  truck: Truck,
  utensils: Utensils,
  wheat: Wheat,
}

function iconFor(key: string | null | undefined): LucideIcon {
  return (key ? CATEGORY_ICONS[key] : undefined) ?? ShoppingBasket
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
        {/*
          The rail is taller now that every row carries an icon chip, so the sticky
          column scrolls inside itself instead of running past the viewport.
        */}
        <div className="surface sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-2">
          <h2 className="px-2 pb-1 pt-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            {t.home.catalogTitle}
          </h2>
          <ul className="mt-1">
            {categories.map((category) => {
              const Icon = iconFor(category.icon)

              return (
                <li key={category.id}>
                  <Link
                    href={localePath(locale, 'category', category.slug)}
                    className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-primary-soft/60 hover:text-primary"
                  >
                    <span className="icon-chip h-8 w-8">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
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
              )
            })}
          </ul>
          <Link
            href={localePath(locale, 'products')}
            className="mt-1 block rounded-md px-2 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary-soft/60"
          >
            {t.home.allCategories}
          </Link>
        </div>
      </nav>

      {/* ---------------------------------------------------------- mobile */}
      <nav aria-label={t.home.catalogTitle} className="min-w-0 lg:hidden">
        {/* The vertical padding is what keeps each chip's shadow from being clipped by
            the horizontal scroll container. */}
        <ul className="no-scrollbar -mx-4 -my-2 flex gap-2 overflow-x-auto px-4 py-2">
          {categories.map((category) => {
            const Icon = iconFor(category.icon)

            return (
              <li key={category.id}>
                <Link
                  href={localePath(locale, 'category', category.slug)}
                  className="flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full bg-card pl-2 pr-3.5 text-sm shadow-card transition-shadow duration-200 hover:shadow-hover"
                >
                  <span className="icon-chip h-8 w-8">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  {category.name}
                  {category.count > 0 ? (
                    <span className="tnum text-caption text-muted-foreground">
                      {category.count}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
          <li>
            <Link
              href={localePath(locale, 'products')}
              className="flex min-h-[44px] items-center whitespace-nowrap rounded-full bg-primary-soft px-4 text-sm font-medium text-primary shadow-card transition-shadow duration-200 hover:shadow-hover"
            >
              {t.home.allCategories}
            </Link>
          </li>
        </ul>
      </nav>
    </>
  )
}
