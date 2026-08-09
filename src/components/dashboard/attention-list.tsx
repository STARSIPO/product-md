import Link from 'next/link'
import { AlertTriangle, ChevronRight, CircleAlert, Info } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * "What needs your attention".
 *
 * The overview's only list. Every row is a concrete thing that is stuck — a rejected
 * listing, an unanswered offer, a deal nobody confirmed, a document about to lapse —
 * and every row links to the screen where it can be unstuck. A row that cannot be acted
 * on does not belong here; that is what Statistics is for.
 *
 * Rows are ordered by the caller, most urgent first, and capped there too: a list that
 * needs scrolling stops being a to-do list.
 */

export type AttentionTone = 'destructive' | 'warning' | 'info'

const TONES: Record<AttentionTone, string> = {
  destructive: 'text-destructive',
  warning: 'text-warning',
  info: 'text-primary',
}

const ICONS: Record<AttentionTone, typeof AlertTriangle> = {
  destructive: CircleAlert,
  warning: AlertTriangle,
  info: Info,
}

export interface AttentionItem {
  key: string
  text: string
  href: string
  tone: AttentionTone
  /** Short trailing context — a date, a count. Never the only carrier of meaning. */
  meta?: string
}

export function AttentionList({
  items,
  emptyText,
}: {
  items: readonly AttentionItem[]
  emptyText: string
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        {emptyText}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-card">
      {items.map((item) => {
        const Icon = ICONS[item.tone]
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex min-h-[56px] items-center gap-3 px-3 py-3 text-sm transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
            >
              <Icon
                aria-hidden
                className={cn('h-[18px] w-[18px] shrink-0', TONES[item.tone])}
              />
              <span className="min-w-0 flex-1">
                <span className="clamp-2 block leading-snug">{item.text}</span>
                {item.meta ? (
                  <span className="mt-0.5 block text-caption text-muted-foreground">
                    {item.meta}
                  </span>
                ) : null}
              </span>
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
