'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { Button } from '@/components/ui'

/**
 * The marketplace search bar: a category scope plus a query, the way a classifieds
 * site works. Submitting with an empty query but a chosen category goes straight to
 * that category page rather than to an empty result list.
 */
export function CatalogSearch({
  categories,
}: {
  categories: { id: string; name: string; slug: string }[]
}) {
  const { t, href } = useI18n()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [categorySlug, setCategorySlug] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()

    if (!trimmed && categorySlug) {
      router.push(href('category', categorySlug))
      return
    }

    const params = new URLSearchParams()
    if (trimmed) params.set('q', trimmed)
    if (categorySlug) params.set('category', categorySlug)

    router.push(
      trimmed ? `${href('search')}?${params.toString()}` : `${href('products')}?${params.toString()}`,
    )
  }

  return (
    <form onSubmit={submit} role="search" className="flex flex-col gap-2 sm:flex-row">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:rounded-md sm:border sm:border-input sm:bg-background sm:focus-within:border-primary">
        <label htmlFor="catalog-search-category" className="sr-only">
          {t.filters.category}
        </label>
        <select
          id="catalog-search-category"
          value={categorySlug}
          onChange={(event) => setCategorySlug(event.target.value)}
          className="h-12 shrink-0 rounded-md border border-input bg-background px-3 text-base outline-none sm:w-52 sm:rounded-none sm:rounded-l-md sm:border-0 sm:border-r sm:border-border"
        >
          <option value="">{t.home.searchAllCategories}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>

        <div className="relative flex-1">
          <label htmlFor="catalog-search-query" className="sr-only">
            {t.common.search}
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground sm:left-3"
            aria-hidden
          />
          <input
            id="catalog-search-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.nav.searchPlaceholder}
            className="h-12 w-full rounded-md border border-input bg-background pl-11 pr-4 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary sm:rounded-none sm:rounded-r-md sm:border-0 sm:pl-10 sm:focus:border-0"
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="sm:w-auto sm:px-8">
        {t.common.search}
      </Button>
    </form>
  )
}
