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
 *
 * Each row is its own raised surface separated by a gap, rather than a hairline inside
 * one boxed list. Six things that each want a tap are six targets, and a divided list
 * reads as one object you scan; separate cards read as a queue you work through. The
 * tone icon sits in a tinted chip so urgency is carried by a shape big enough to see at
 * arm's length, not by the colour of an 18px glyph.
 */

export type AttentionTone = 'destructive' | 'warning' | 'info'

/** Chip fill and glyph colour per tone; `.icon-chip` supplies the shape. */
const CHIPS: Record<AttentionTone, string> = {
  destructive: 'bg-destructive-soft text-destructive',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-primary-soft text-primary',
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
    // Nothing is stuck: a calm inset block, not a dashed outline around an absence.
    return <p className="surface-muted px-4 py-6 text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const Icon = ICONS[item.tone]
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              className="surface-interactive flex min-h-[64px] items-center gap-3 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-4 sm:p-4"
            >
              <span aria-hidden className={cn('icon-chip h-10 w-10', CHIPS[item.tone])}>
                <Icon className="h-5 w-5" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="clamp-2 block leading-snug">{item.text}</span>
                {item.meta ? (
                  <span className="mt-0.5 block text-caption text-muted-foreground">
                    {item.meta}
                  </span>
                ) : null}
              </span>

              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
