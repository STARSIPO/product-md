'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * Section navigation for the admin and moderation surfaces.
 *
 * A client component for one reason only: the active item has to be derived from the
 * current pathname, and a server component cannot know it. Everything else — labels,
 * hrefs, counters — is computed on the server and handed down already localized.
 *
 * On a phone it is a horizontally scrollable strip above the content; from `lg` it
 * becomes the sticky sidebar of a two-column layout.
 */

export interface AdminNavItem {
  href: string
  label: string
  /** Rendered as a counter pill — open tasks, open complaints. Zero is hidden. */
  count?: number
}

export interface AdminNavProps {
  items: readonly AdminNavItem[]
  /** Accessible name for the <nav>; both surfaces render one on the same page. */
  label: string
  className?: string
}

export function AdminNav({ items, label, className }: AdminNavProps) {
  const pathname = usePathname()

  return (
    <nav
      aria-label={label}
      className={cn(
        'no-scrollbar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0',
        className,
      )}
    >
      <ul className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
        {items.map((item) => {
          // Exact match, or a child route of this section — but never let the section
          // root ("/admin") claim every page below it.
          const active =
            pathname === item.href ||
            (item.href.split('/').length > 3 && pathname.startsWith(`${item.href}/`))

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'bg-primary-soft font-semibold text-primary'
                    : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="flex-1">{item.label}</span>
                {item.count !== undefined && item.count > 0 ? (
                  <span
                    className={cn(
                      'tnum inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-caption font-medium leading-none',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
