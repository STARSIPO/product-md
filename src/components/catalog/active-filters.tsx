'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'

/**
 * The chips above the grid: one per active facet, each a link back to the same URL
 * without that parameter.
 *
 * Removal is a navigation, not a state update — which keeps this consistent with the
 * filter form (both only ever change the URL) and means a chip works before hydration.
 */

export interface ActiveFilterChip {
  key: string
  label: string
  /** Current URL minus this one filter. */
  href: string
}

export function ActiveFilters({
  chips,
  resetHref,
}: {
  chips: readonly ActiveFilterChip[]
  resetHref: string
}) {
  const { t } = useI18n()
  if (chips.length === 0) return null

  return (
    <ul aria-label={t.filters.title} className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Link
            href={chip.href}
            aria-label={`${t.common.remove}: ${chip.label}`}
            // A chip is a filled pill, not a miniature outlined card: removing the
            // outline is what stops a row of active facets from reading as a toolbar.
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-muted px-3.5 text-sm text-foreground transition-colors hover:bg-destructive-soft hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-[34px]"
          >
            <span className="max-w-[16rem] truncate">{chip.label}</span>
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}

      {chips.length > 1 ? (
        <li>
          <Link
            href={resetHref}
            className="inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-[34px]"
          >
            {t.filters.reset}
          </Link>
        </li>
      ) : null}
    </ul>
  )
}
