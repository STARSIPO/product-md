'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * Dashboard navigation.
 *
 * One list, two shapes: a vertical rail on desktop and a horizontally scrollable strip
 * of tabs on a phone. A phone cannot show eleven sections at once, and collapsing them
 * behind a hamburger inside a page that is already behind a hamburger buries the whole
 * cabinet.
 *
 * Which sections exist is decided on the server from the company's actual roles — a
 * pure buyer is never sent a "my listings" link, so there is nothing here to hide.
 *
 * Hrefs arrive already localized (`/ro/cabinet/produse`), which is exactly what the
 * address bar holds, so matching against `usePathname()` is a straight comparison.
 */

export interface SidebarNavItem {
  href: string
  label: string
  badge?: number
  /** The overview matches its own path only; everything else matches its subtree. */
  exact?: boolean
}

export function SidebarNav({
  items,
  label,
}: {
  items: readonly SidebarNavItem[]
  label: string
}) {
  const pathname = usePathname()

  function isActive(item: SidebarNavItem): boolean {
    if (item.exact) return pathname === item.href
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  }

  return (
    <nav aria-label={label} className="lg:sticky lg:top-4 lg:self-start">
      {/* Mobile: a scrollable tab strip that keeps every section one tap away. */}
      <div className="no-scrollbar -mx-4 overflow-x-auto border-b border-border px-4 lg:hidden">
        <ul className="flex min-w-max items-end gap-1">
          {items.map((item) => {
            const active = isActive(item)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-t-sm px-3 pb-2.5 pt-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:content-['']",
                    active
                      ? 'font-semibold text-primary after:bg-primary'
                      : 'font-medium text-muted-foreground after:bg-transparent hover:text-foreground',
                  )}
                >
                  {item.label}
                  {item.badge !== undefined && item.badge > 0 ? (
                    <Badge active={active} value={item.badge} />
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Desktop: a vertical rail. */}
      <ul className="hidden gap-0.5 lg:flex lg:flex-col">
        {items.map((item) => {
          const active = isActive(item)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'bg-primary-soft font-semibold text-primary'
                    : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 ? (
                  <Badge active={active} value={item.badge} />
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Badge({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={cn(
        'tnum inline-flex min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-caption font-medium leading-none',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}
