import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The horizontal rail of section and filter tabs.
 *
 * One component for what used to be four near-identical copies — the cabinet menu on a
 * phone, the listing filters, the request filters and the settings tabs — all of which
 * drew the same underlined-tab strip with the same `after:` pseudo-element.
 *
 * Selection is now carried by a filled pill rather than a 2px rule under a word. On a
 * strip that scrolls sideways, an underline on the item that happens to be off-screen
 * tells you nothing; a filled pill is findable at a glance, and it survives being
 * scrolled past a fold. It also removes the container's `border-b`, which was the only
 * full-width line left on most of these screens.
 *
 * `min-w-0` on the <nav> is load-bearing wherever this sits in a grid or flex row: the
 * inner `min-w-max` list is about a thousand pixels wide, and without an explicit
 * minimum the track grows to fit it and the whole page scrolls sideways instead of the
 * strip. This has broken the layout at 320px three times already.
 */

export interface SectionRailItem {
  key: string
  href: string
  label: string
  /** A subdued figure inside the pill — "Active 12". Context, never a warning. */
  count?: number
  /** A figure that has to be noticed: unread messages, offers nobody has answered. */
  badge?: number
  active: boolean
}

export function SectionRail({
  items,
  label,
  className,
}: {
  items: readonly SectionRailItem[]
  label: string
  className?: string
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        // Bleeds to the viewport edge on a phone so the first pill is not indented away
        // from the screen edge, and reverts to the container gutter from `sm`.
        'no-scrollbar -mx-4 min-w-0 overflow-x-auto px-4 sm:mx-0 sm:px-0',
        className,
      )}
    >
      <ul className="flex min-w-max items-center gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <RailPill
              href={item.href}
              label={item.label}
              count={item.count}
              badge={item.badge}
              active={item.active}
            />
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * One pill. Exported because the dashboard menu builds its own list on the client from
 * `usePathname()` and cannot hand a precomputed `active` to the rail above.
 */
export function RailPill({
  href,
  label,
  count,
  badge,
  active,
  className,
}: {
  href: string
  label: string
  count?: number
  badge?: number
  active: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'bg-muted font-medium text-muted-foreground hover:bg-primary-soft hover:text-primary',
        className,
      )}
    >
      {label}
      {count !== undefined ? (
        <span
          className={cn(
            'tnum text-caption',
            active ? 'text-primary-foreground/75' : 'text-muted-foreground/75',
          )}
        >
          {count}
        </span>
      ) : null}
      {badge !== undefined && badge > 0 ? <RailBadge onSolid={active} value={badge} /> : null}
    </Link>
  )
}

/**
 * A count that has to be seen — always a filled chip, never an outlined one.
 *
 * `onSolid` is for the one place where the chip sits inside an already-solid primary
 * pill and a second block of the same green would disappear into it.
 */
export function RailBadge({ value, onSolid = false }: { value: number; onSolid?: boolean }) {
  return (
    <span
      className={cn(
        'tnum inline-flex min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-caption font-semibold leading-none',
        onSolid ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary text-primary-foreground',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}
