import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface PaginationLabels {
  previous: string
  next: string
  /** Accessible name for the <nav>, e.g. "Pagination". */
  pagination: string
}

export interface PaginationProps {
  page: number
  pageCount: number
  buildHref: (page: number) => string
  labels: PaginationLabels
  className?: string
}

type Slot = number | 'gap'

/** First, last and a one-page window around the current page, with gaps collapsed. */
function pageSlots(page: number, pageCount: number): Slot[] {
  const wanted = [1, pageCount, page - 1, page, page + 1]
  const visible = [...new Set(wanted)]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b)

  const slots: Slot[] = []
  let previous = 0
  for (const value of visible) {
    if (previous !== 0 && value - previous > 1) slots.push('gap')
    slots.push(value)
    previous = value
  }
  return slots
}

const cellClasses =
  'inline-flex h-11 min-w-[44px] items-center justify-center rounded-md border px-3 text-sm transition-colors duration-150'

export function Pagination({ page, pageCount, buildHref, labels, className }: PaginationProps) {
  if (pageCount <= 1) return null

  const current = Math.min(Math.max(page, 1), pageCount)
  const slots = pageSlots(current, pageCount)

  return (
    <nav aria-label={labels.pagination} className={cn('flex justify-center', className)}>
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          {current > 1 ? (
            <Link
              href={buildHref(current - 1)}
              rel="prev"
              aria-label={labels.previous}
              className={cn(cellClasses, 'border-input bg-card text-foreground hover:bg-muted')}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : (
            <span
              aria-hidden="true"
              className={cn(cellClasses, 'border-border bg-card text-muted-foreground/45')}
            >
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
        </li>

        {slots.map((slot, index) =>
          slot === 'gap' ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 text-sm text-muted-foreground"
            >
              …
            </li>
          ) : (
            <li key={slot}>
              <Link
                href={buildHref(slot)}
                aria-current={slot === current ? 'page' : undefined}
                className={cn(
                  cellClasses,
                  'tnum',
                  slot === current
                    ? 'border-primary bg-primary font-semibold text-primary-foreground'
                    : 'border-input bg-card text-foreground hover:bg-muted',
                )}
              >
                {slot}
              </Link>
            </li>
          ),
        )}

        <li>
          {current < pageCount ? (
            <Link
              href={buildHref(current + 1)}
              rel="next"
              aria-label={labels.next}
              className={cn(cellClasses, 'border-input bg-card text-foreground hover:bg-muted')}
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : (
            <span
              aria-hidden="true"
              className={cn(cellClasses, 'border-border bg-card text-muted-foreground/45')}
            >
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
