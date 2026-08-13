import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface BreadcrumbsProps {
  items: readonly BreadcrumbItem[]
  /** Accessible name for the <nav>, e.g. "Breadcrumb". */
  label: string
  className?: string
}

export function Breadcrumbs({ items, label, className }: BreadcrumbsProps) {
  if (items.length === 0) return null

  return (
    /* min-w-0: the trail is often a grid child and must not widen the page at 320px. */
    <nav aria-label={label} className={cn('no-scrollbar min-w-0 overflow-x-auto', className)}>
      <ol className="flex min-w-max items-center gap-1 text-caption text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-60" />
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-sm py-1 underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn('py-1', isLast && 'text-foreground')}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
