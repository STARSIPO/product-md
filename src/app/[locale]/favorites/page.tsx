import type { Metadata } from 'next'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Bell, BellOff, Heart, Search, Store, Trash2 } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { requireUser } from '@/server/auth/guards'
import { db } from '@/server/db'
import { PRODUCT_CARD_SELECT } from '@/server/services/search'
import { deleteSavedSearch, updateSavedSearchNotifications } from '@/server/actions/favorites'
import { decodeRecord } from '@/lib/json'
import { formatDate } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { buildQuery, cn } from '@/lib/utils'
import type { Dictionary } from '@/lib/i18n'
import { Badge, Button, EmptyState, buttonVariants } from '@/components/ui'
import { ProductCard } from '@/components/product/product-card'
import { CompanyCard } from '@/components/company/company-card'

/**
 * Everything the user chose to keep: products, suppliers and saved searches.
 *
 * The tabs are links rather than client state — each list is a separate URL, so a
 * buyer can bookmark "my saved searches" and the back button behaves. The whole page
 * needs no JavaScript at all: the saved-search controls are forms posting to server
 * actions, which is also what makes them work on a phone with a flaky connection.
 */

export const dynamic = 'force-dynamic'

type Tab = 'products' | 'suppliers' | 'searches'

const TABS: readonly Tab[] = ['products', 'suppliers', 'searches']

function resolveTab(value: string | undefined): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : 'products'
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.favorites.title, robots: { index: false, follow: false } }
}

// --- saved search helpers ----------------------------------------------------

const PRICE_KEYS = new Set(['priceMin', 'priceMax'])

/**
 * A saved search is stored as JSON-encoded search params. Both halves of this file
 * read it defensively: it was written by a different part of the app, possibly an
 * older version of it, and a malformed blob must degrade to "no filters" rather than
 * to a crash on somebody's favourites page.
 */
function searchEntries(raw: string): [string, string | number | boolean][] {
  const entries: [string, string | number | boolean][] = []
  for (const [key, value] of Object.entries(decodeRecord(raw))) {
    if (key === 'page') continue
    if (typeof value === 'string' && value !== '') entries.push([key, value])
    else if (typeof value === 'number' && Number.isFinite(value)) entries.push([key, value])
    else if (typeof value === 'boolean' && value) entries.push([key, value])
  }
  return entries
}

function summarizeSearch(raw: string, t: Dictionary, locale: Locale): string[] {
  const labels: Record<string, string | undefined> = {
    q: undefined,
    category: t.filters.category,
    priceMin: t.filters.priceFrom,
    priceMax: t.filters.priceTo,
    unit: t.filters.unit,
    district: t.filters.region,
    delivery: t.filters.deliveryAvailable,
    pickup: t.filters.pickup,
    verified: t.filters.verifiedOnly,
    origin: t.filters.origin,
    availability: t.filters.availability,
    regular: t.filters.regularSupply,
    urgent: t.filters.urgentOnly,
    ratingMin: t.filters.rating,
    sort: t.sort.label,
  }

  return searchEntries(raw).map(([key, value]) => {
    if (key === 'q') return `«${String(value)}»`
    const label = labels[key] ?? key
    if (typeof value === 'boolean') return label
    if (PRICE_KEYS.has(key) && typeof value === 'number') {
      return `${label}: ${formatMoney(value, locale)}`
    }
    return `${label}: ${String(value)}`
  })
}

/** Money is stored in bani; the catalogue URL expects a human amount. */
function searchHref(raw: string, target: string, locale: Locale): string {
  const query: Record<string, string | number | boolean> = {}
  for (const [key, value] of searchEntries(raw)) {
    query[key] =
      PRICE_KEYS.has(key) && typeof value === 'number' ? (value / 100).toFixed(2) : value
  }
  const base = localePath(locale, target === 'REQUEST' ? 'requests' : 'products')
  return `${base}${buildQuery(query)}`
}

// --- page --------------------------------------------------------------------

export default async function FavoritesPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { tab?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await requireUser(locale, localePath(locale, 'favorites'))

  const tab = resolveTab(searchParams.tab)

  /**
   * Both handlers delegate to the existing favourites actions, which re-derive the
   * user from the session and scope every write by `userId` — so a forged id in the
   * hidden field updates nothing.
   */
  async function removeSearch(formData: FormData): Promise<void> {
    'use server'
    const id = String(formData.get('id') ?? '')
    if (id) await deleteSavedSearch(id)
    revalidatePath('/[locale]/favorites', 'page')
  }

  async function updateSearchNotifications(formData: FormData): Promise<void> {
    'use server'
    const id = String(formData.get('id') ?? '')
    if (!id) return
    await updateSavedSearchNotifications(id, {
      notifyNew: formData.get('notifyNew') === '1',
      notifyPriceDrop: formData.get('notifyPriceDrop') === '1',
    })
    revalidatePath('/[locale]/favorites', 'page')
  }

  const [products, companies, searches, counts] = await Promise.all([
    tab === 'products'
      ? db.favorite.findMany({
          where: { userId: user.id, productId: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 60,
          select: { id: true, product: { select: PRODUCT_CARD_SELECT } },
        })
      : Promise.resolve([]),
    tab === 'suppliers'
      ? db.favorite.findMany({
          where: { userId: user.id, companyId: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 60,
          select: {
            id: true,
            company: {
              select: {
                id: true,
                slug: true,
                displayName: true,
                description: true,
                logoKey: true,
                ratingAvg: true,
                ratingCount: true,
                district: { select: { nameRu: true, nameRo: true } },
                locality: { select: { nameRu: true, nameRo: true } },
                badges: { where: { status: 'APPROVED' }, select: { type: true } },
                _count: { select: { products: { where: { status: 'ACTIVE' } } } },
              },
            },
          },
        })
      : Promise.resolve([]),
    tab === 'searches'
      ? db.savedSearch.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 60,
        })
      : Promise.resolve([]),
    Promise.all([
      db.favorite.count({ where: { userId: user.id, productId: { not: null } } }),
      db.favorite.count({ where: { userId: user.id, companyId: { not: null } } }),
      db.savedSearch.count({ where: { userId: user.id } }),
    ]),
  ])

  const [productCount, supplierCount, searchCount] = counts

  const tabItems: { id: Tab; label: string; count: number }[] = [
    { id: 'products', label: t.favorites.products, count: productCount },
    { id: 'suppliers', label: t.favorites.suppliers, count: supplierCount },
    { id: 'searches', label: t.favorites.searches, count: searchCount },
  ]

  return (
    <div className="container py-6">
      <h1 className="text-h1">{t.favorites.title}</h1>

      {/* Links, not a tablist: each pane is its own addressable URL. */}
      <nav aria-label={t.favorites.title} className="mt-4 border-b border-border">
        <ul className="no-scrollbar flex min-w-max gap-1 overflow-x-auto">
          {tabItems.map((item) => {
            const active = item.id === tab
            return (
              <li key={item.id}>
                <Link
                  href={`${localePath(locale, 'favorites')}?tab=${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-t-sm px-3 pb-2.5 pt-2 text-sm transition-colors',
                    'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full',
                    active
                      ? 'font-semibold text-primary after:bg-primary'
                      : 'font-medium text-muted-foreground after:bg-transparent hover:text-foreground',
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      'tnum inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-caption font-medium leading-none',
                      active ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {item.count}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-5">
        {tab === 'products' ? (
          products.length === 0 ? (
            <EmptyState
              icon={<Heart aria-hidden />}
              title={t.favorites.emptyProducts}
              description={t.favorites.emptyProductsText}
              action={
                <Link href={localePath(locale, 'products')} className={buttonVariants()}>
                  {t.catalog.title}
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {products.map((favorite) =>
                favorite.product ? (
                  <ProductCard
                    key={favorite.id}
                    product={favorite.product}
                    locale={locale}
                    t={t}
                    isFavorite
                  />
                ) : null,
              )}
            </div>
          )
        ) : null}

        {tab === 'suppliers' ? (
          companies.length === 0 ? (
            <EmptyState
              icon={<Store aria-hidden />}
              title={t.favorites.emptySuppliers}
              description={t.favorites.emptySuppliersText}
              action={
                <Link href={localePath(locale, 'suppliers')} className={buttonVariants()}>
                  {t.nav.suppliers}
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {companies.map((favorite) =>
                favorite.company ? (
                  <CompanyCard
                    key={favorite.id}
                    company={favorite.company}
                    locale={locale}
                    t={t}
                  />
                ) : null,
              )}
            </div>
          )
        ) : null}

        {tab === 'searches' ? (
          searches.length === 0 ? (
            <EmptyState
              icon={<Search aria-hidden />}
              title={t.favorites.emptySearches}
              description={t.favorites.emptySearchesText}
              action={
                <Link href={localePath(locale, 'products')} className={buttonVariants()}>
                  {t.search.resultsTitle}
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {searches.map((search) => {
                const chips = summarizeSearch(search.query, t, locale)
                return (
                  <li
                    key={search.id}
                    className="rounded-lg border border-border bg-card p-4 shadow-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={searchHref(search.query, search.target, locale)}
                          className="rounded text-base font-medium hover:text-primary"
                        >
                          {search.name}
                        </Link>
                        <p className="mt-0.5 text-caption text-muted-foreground">
                          {fmt(t.favorites.savedOn, {
                            date: formatDate(search.createdAt, locale),
                          })}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Link
                          href={searchHref(search.query, search.target, locale)}
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          <Search className="h-4 w-4" aria-hidden />
                          {t.favorites.openSearch}
                        </Link>

                        <form action={removeSearch}>
                          <input type="hidden" name="id" value={search.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            aria-label={`${t.favorites.deleteSearch}: ${search.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            {t.common.delete}
                          </Button>
                        </form>
                      </div>
                    </div>

                    {chips.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {chips.map((chip) => (
                          <li key={chip}>
                            <Badge variant="neutral" size="sm">
                              {chip}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-caption text-muted-foreground">
                        {t.favorites.queryEmpty}
                      </p>
                    )}

                    {/*
                      Each toggle is a one-click form: the hidden fields already carry
                      the state the click should produce, so no checkbox needs a
                      separate "save".
                    */}
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                      <form action={updateSearchNotifications}>
                        <input type="hidden" name="id" value={search.id} />
                        <input type="hidden" name="notifyNew" value={search.notifyNew ? '0' : '1'} />
                        <input
                          type="hidden"
                          name="notifyPriceDrop"
                          value={search.notifyPriceDrop ? '1' : '0'}
                        />
                        <Button
                          type="submit"
                          variant={search.notifyNew ? 'secondary' : 'outline'}
                          size="sm"
                          aria-pressed={search.notifyNew}
                        >
                          {search.notifyNew ? (
                            <Bell className="h-4 w-4" aria-hidden />
                          ) : (
                            <BellOff className="h-4 w-4" aria-hidden />
                          )}
                          {t.favorites.notifyNew}
                        </Button>
                      </form>

                      <form action={updateSearchNotifications}>
                        <input type="hidden" name="id" value={search.id} />
                        <input type="hidden" name="notifyNew" value={search.notifyNew ? '1' : '0'} />
                        <input
                          type="hidden"
                          name="notifyPriceDrop"
                          value={search.notifyPriceDrop ? '0' : '1'}
                        />
                        <Button
                          type="submit"
                          variant={search.notifyPriceDrop ? 'secondary' : 'outline'}
                          size="sm"
                          aria-pressed={search.notifyPriceDrop}
                        >
                          {search.notifyPriceDrop ? (
                            <Bell className="h-4 w-4" aria-hidden />
                          ) : (
                            <BellOff className="h-4 w-4" aria-hidden />
                          )}
                          {t.favorites.notifyPriceDrop}
                        </Button>
                      </form>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
      </div>
    </div>
  )
}
