'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, FolderTree, Loader2, Package, Search, Store, X, ClipboardList } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'

/**
 * Global search with a grouped result overlay.
 *
 * Before the user types anything the overlay is not empty — it offers popular
 * categories and their own recent queries, which is what turns the search box into a
 * navigation surface rather than a dead input.
 *
 * Requests are debounced at 250 ms and every in-flight fetch is aborted when a newer
 * keystroke arrives, so results can never arrive out of order.
 */

const RECENT_KEY = 'pmd:recent-searches'
const MAX_RECENT = 6
const DEBOUNCE_MS = 250

interface SuggestResponse {
  categories: { id: string; name: string; slug: string; trail: string }[]
  products: { id: string; slug: string; title: string; priceBani: number; unit: string }[]
  suppliers: { id: string; slug: string; displayName: string; ratingAvg: number }[]
  requests: { id: string; slug: string; title: string; quantity: number; unit: string }[]
  districts: { id: string; name: string }[]
}

const EMPTY_RESULTS: SuggestResponse = {
  categories: [],
  products: [],
  suppliers: [],
  requests: [],
  districts: [],
}

export function GlobalSearch({
  popularCategories,
}: {
  popularCategories: { id: string; name: string; slug: string; icon: string | null }[]
}) {
  const { t, locale, fmt, href } = useI18n()
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SuggestResponse>(EMPTY_RESULTS)
  const [recent, setRecent] = useState<string[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RECENT_KEY)
      if (stored) setRecent(JSON.parse(stored) as string[])
    } catch {
      // A corrupted or unavailable localStorage must not break the header.
    }
  }, [])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      abortRef.current?.abort()
      setResults(EMPTY_RESULTS)
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(trimmed)}&locale=${locale}`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('suggest failed')
        setResults((await response.json()) as SuggestResponse)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults(EMPTY_RESULTS)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [query, locale])

  const rememberQuery = useCallback((value: string) => {
    setRecent((previous) => {
      const next = [value, ...previous.filter((item) => item !== value)].slice(0, MAX_RECENT)
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        // Ignore quota / private-mode failures.
      }
      return next
    })
  }, [])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    rememberQuery(trimmed)
    setOpen(false)
    router.push(`${href('search')}?q=${encodeURIComponent(trimmed)}`)
  }

  function clearRecent() {
    setRecent([])
    try {
      window.localStorage.removeItem(RECENT_KEY)
    } catch {
      // Ignore.
    }
  }

  const hasResults =
    results.categories.length > 0 ||
    results.products.length > 0 ||
    results.suppliers.length > 0 ||
    results.requests.length > 0

  const showEmptyState = query.trim().length < 2

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={submit} role="search">
        <label htmlFor="global-search" className="sr-only">
          {t.common.search}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={t.search.placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls="global-search-results"
            /*
             * A filled pill rather than an outlined box: it is the one thing in the
             * header that should read as "start here". The transparent border keeps the
             * field the same height as the outlined inputs elsewhere and gives focus
             * something to colour.
             */
            className="h-11 w-full rounded-full border border-transparent bg-muted pl-10 pr-10 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {loading ? (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setResults(EMPTY_RESULTS)
              }}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              aria-label={t.common.clear}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </form>

      {open ? (
        <div
          id="global-search-results"
          role="listbox"
          aria-label={t.common.search}
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] animate-slide-up overflow-y-auto rounded-lg bg-card p-2 shadow-pop"
        >
          {showEmptyState ? (
            <>
              {recent.length > 0 ? (
                <Group
                  title={t.search.recentQueries}
                  action={
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="rounded text-caption text-muted-foreground hover:text-foreground"
                    >
                      {t.search.clearRecent}
                    </button>
                  }
                >
                  {recent.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setQuery(item)
                        router.push(`${href('search')}?q=${encodeURIComponent(item)}`)
                        setOpen(false)
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{item}</span>
                    </button>
                  ))}
                </Group>
              ) : null}

              <Group title={t.search.popularCategories}>
                <div className="flex flex-wrap gap-1.5 px-2 py-1">
                  {popularCategories.map((category) => (
                    <Link
                      key={category.id}
                      href={href('category', category.slug)}
                      onClick={() => setOpen(false)}
                      className="rounded-full bg-muted px-3.5 py-2 text-sm transition-colors hover:bg-primary-soft hover:text-primary"
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              </Group>
            </>
          ) : hasResults ? (
            <>
              {results.categories.length > 0 ? (
                <Group title={t.search.groupCategories}>
                  {results.categories.map((category) => (
                    <Row
                      key={category.id}
                      href={href('category', category.slug)}
                      onNavigate={() => setOpen(false)}
                      icon={<FolderTree className="h-4 w-4" aria-hidden />}
                      title={category.name}
                      subtitle={category.trail}
                    />
                  ))}
                </Group>
              ) : null}

              {results.products.length > 0 ? (
                <Group title={t.search.groupProducts}>
                  {results.products.map((product) => (
                    <Row
                      key={product.id}
                      href={href('products', product.slug)}
                      onNavigate={() => setOpen(false)}
                      icon={<Package className="h-4 w-4" aria-hidden />}
                      title={product.title}
                      subtitle={`${formatMoney(product.priceBani, locale)} / ${
                        t.units[product.unit as keyof typeof t.units] ?? product.unit
                      }`}
                    />
                  ))}
                </Group>
              ) : null}

              {results.suppliers.length > 0 ? (
                <Group title={t.search.groupSuppliers}>
                  {results.suppliers.map((supplier) => (
                    <Row
                      key={supplier.id}
                      href={href('suppliers', supplier.slug)}
                      onNavigate={() => setOpen(false)}
                      icon={<Store className="h-4 w-4" aria-hidden />}
                      title={supplier.displayName}
                      subtitle={
                        supplier.ratingAvg > 0
                          ? fmt(t.review.ratingOf, { value: supplier.ratingAvg.toFixed(1) })
                          : undefined
                      }
                    />
                  ))}
                </Group>
              ) : null}

              {results.requests.length > 0 ? (
                <Group title={t.search.groupRequests}>
                  {results.requests.map((request) => (
                    <Row
                      key={request.id}
                      href={href('requests', request.slug)}
                      onNavigate={() => setOpen(false)}
                      icon={<ClipboardList className="h-4 w-4" aria-hidden />}
                      title={request.title}
                      subtitle={`${request.quantity} ${
                        t.units[request.unit as keyof typeof t.units] ?? request.unit
                      }`}
                    />
                  ))}
                </Group>
              ) : null}

              <Link
                href={`${href('search')}?q=${encodeURIComponent(query.trim())}`}
                onClick={() => {
                  rememberQuery(query.trim())
                  setOpen(false)
                }}
                className="mt-1.5 block rounded-md bg-primary-soft/50 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
              >
                {fmt(t.search.seeAllResults, { query: query.trim() })}
              </Link>
            </>
          ) : loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t.common.loading}
            </p>
          ) : (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-medium">
                {fmt(t.search.noResults, { query: query.trim() })}
              </p>
              <p className="mt-1 text-caption text-muted-foreground">{t.search.noResultsHint}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Group({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="py-1">
      <div className="flex items-center justify-between px-2 py-1">
        <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({
  href,
  icon,
  title,
  subtitle,
  onNavigate,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle?: string
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      role="option"
      aria-selected={false}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted',
      )}
    >
      <span className="icon-chip h-9 w-9">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle ? (
          <span className="block truncate text-caption text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </Link>
  )
}
