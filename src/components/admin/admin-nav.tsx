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
 * The sections are *grouped* from `lg` up (Люди / Контент / Деньги …) because fourteen
 * equally-weighted links tell an operator nothing about where to look. Below `lg` the
 * groups collapse into a single horizontally scrollable strip: a phone has no room for
 * headings, and a vertical accordion would bury the link the operator came for.
 */

export interface AdminNavItem {
  href: string
  label: string
  /** Rendered as a counter pill — open tasks, open complaints. Zero is hidden. */
  count?: number
}

export interface AdminNavGroup {
  /** Stable key; also used as the heading's id for `aria-labelledby`. */
  id: string
  /** Empty string renders the group without a heading (single-group surfaces). */
  label: string
  items: readonly AdminNavItem[]
}

export interface AdminNavProps {
  groups: readonly AdminNavGroup[]
  /** Accessible name for the <nav>; both surfaces render one on the same page. */
  label: string
  className?: string
}

function NavLink({ item, active }: { item: AdminNavItem; active: boolean }) {
  return (
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
  )
}

export function AdminNav({ groups, label, className }: AdminNavProps) {
  const pathname = usePathname()

  // Exact match, or a child route of this section — but never let the section root
  // ("/ru/admin") claim every page below it.
  function isActive(href: string): boolean {
    return (
      pathname === href || (href.split('/').length > 3 && pathname.startsWith(`${href}/`))
    )
  }

  const flat = groups.flatMap((group) => group.items)

  return (
    // `min-w-0` is load-bearing: a grid item defaults to `min-width: auto`, so without it
    // the nav grows to the width of the widest strip and drags the whole page into a
    // horizontal scroll on a phone.
    <nav aria-label={label} className={cn('min-w-0', className)}>
      {/* ------------------------------------------------- strip (< lg) */}
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 lg:hidden">
        <ul className="flex min-w-max gap-1">
          {flat.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item.href)} />
            </li>
          ))}
        </ul>
      </div>

      {/* ----------------------------------------------- grouped (lg+) */}
      <div className="hidden lg:block">
        {groups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={group.label ? `admin-nav-${group.id}` : undefined}
            className="mb-4 last:mb-0"
          >
            {group.label ? (
              <h2
                id={`admin-nav-${group.id}`}
                className="px-3 pb-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {group.label}
              </h2>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(item.href)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  )
}
