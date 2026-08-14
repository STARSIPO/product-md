'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { RailBadge, RailPill } from '@/components/dashboard/section-rail'

/**
 * Dashboard navigation.
 *
 * One list, two shapes: a vertical rail on desktop and a horizontally scrollable strip
 * of pills on a phone. A phone cannot show a dozen sections at once, and collapsing them
 * behind a hamburger inside a page that is already behind a hamburger buries the whole
 * cabinet.
 *
 * Both shapes mark the current section by fill rather than by an outline or a rule: a
 * solid pill in the scroller, a soft-tinted block in the rail. The rail is a static
 * column where one strong green block out of eleven rows would shout, so it uses the
 * soft tint; the scroller is a moving strip where the current pill has to be findable
 * mid-scroll, so it uses the solid one.
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
    /**
     * `min-w-0` is load-bearing. This <nav> is a grid item, and a grid track sized `auto`
     * takes its minimum from the item's min-content width — which, for a strip of a dozen
     * `min-w-max` tabs, is well over 1000px. The inner `overflow-x-auto` never gets a chance
     * to scroll, because the track it lives in has already grown to fit, and the whole
     * page scrolls sideways instead. Overriding the automatic minimum lets the track
     * collapse to the column width and hands the overflow back to the strip.
     */
    <nav aria-label={label} className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      {/* Mobile: a scrollable strip of pills that keeps every section one tap away. */}
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:hidden">
        <ul className="flex min-w-max items-center gap-2">
          {items.map((item) => (
            <li key={item.href}>
              <RailPill
                href={item.href}
                label={item.label}
                badge={item.badge}
                active={isActive(item)}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Desktop: a vertical rail. */}
      <ul className="hidden gap-1 lg:flex lg:flex-col">
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
                  <RailBadge value={item.badge} />
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
