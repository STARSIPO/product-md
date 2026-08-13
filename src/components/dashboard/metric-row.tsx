import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The four numbers at the top of the overview.
 *
 * Deliberately not `StatTile`: those carry an icon and a hint as well, and seven of them
 * is what made the old overview a wall. This is one row — two columns on a 320px phone,
 * four from `md` — where each cell is a label and a figure and nothing else.
 *
 * The figure is the whole point of the cell, so it is set at the heading scale and given
 * room to breathe rather than being a slightly-bold body line. It steps up at `sm`
 * instead of `md` because that is where the cell stops being 140px wide: a truncated
 * balance is worse than a smaller one, and money is the widest thing that lands here.
 *
 * Values arrive pre-formatted (money through `formatMoney`, counts through
 * `formatNumber`) because this component has no locale and must not invent one.
 */

export type MetricTone = 'default' | 'attention' | 'warning'

const TONES: Record<MetricTone, string> = {
  default: 'text-foreground',
  attention: 'text-primary',
  warning: 'text-warning',
}

export interface MetricItem {
  key: string
  label: string
  value: string
  href: string
  tone?: MetricTone
}

export function MetricRow({ items, label }: { items: readonly MetricItem[]; label: string }) {
  if (items.length === 0) return null

  return (
    <section aria-label={label}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {items.map((item) => (
          <li key={item.key} className="min-w-0">
            <Link
              href={item.href}
              className="surface-interactive flex min-h-[96px] flex-col justify-between gap-2 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="text-caption leading-snug text-muted-foreground">{item.label}</span>
              <span
                className={cn(
                  'tnum truncate text-h3 font-semibold leading-none sm:text-h2',
                  TONES[item.tone ?? 'default'],
                )}
              >
                {item.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
