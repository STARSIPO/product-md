import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The four numbers at the top of the overview.
 *
 * Deliberately not `StatTile`: those carry an icon, a hint and 88px of height each, and
 * seven of them is what made the old overview a wall. This is one row — two columns on a
 * 320px phone, four from `sm` — where each cell is a label and a figure and nothing else.
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
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {items.map((item) => (
          <li key={item.key} className="min-w-0">
            <Link
              href={item.href}
              className="flex min-h-[76px] flex-col justify-between gap-1 rounded-lg border border-border bg-card px-3 py-2.5 transition-[border-color,box-shadow] duration-150 hover:border-primary/35 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="text-caption leading-snug text-muted-foreground">{item.label}</span>
              <span
                className={cn(
                  'tnum truncate text-lg font-semibold leading-tight',
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
