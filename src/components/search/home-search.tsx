'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { Button } from '@/components/ui'

/** Large hero search. Submits to the full results page rather than opening an overlay. */
export function HomeSearch() {
  const { t, href } = useI18n()
  const router = useRouter()
  const [query, setQuery] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    router.push(trimmed ? `${href('search')}?q=${encodeURIComponent(trimmed)}` : href('products'))
  }

  return (
    <form onSubmit={submit} role="search" className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      <div className="relative min-w-0 flex-1">
        <label htmlFor="home-search" className="sr-only">
          {t.home.searchLabel}
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id="home-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.nav.searchPlaceholder}
          className="h-12 w-full rounded-md border border-input bg-card pl-11 pr-4 text-base shadow-card outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <Button type="submit" size="lg" className="sm:h-12 sm:min-h-0 sm:w-auto sm:px-8">
        {t.common.search}
      </Button>
    </form>
  )
}
