import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * One number on the dashboard overview.
 *
 * The value is pre-formatted by the caller — money through `formatMoney`, counts
 * through `formatNumber` — because this component has no locale and must not invent
 * one. When a tile has a `href` the whole card becomes the link target rather than
 * just the label, which is the difference between a 44px touch target and a 14px one.
 *
 * The label is set above the figure and the figure carries the heading scale: on a page
 * of totals the number is what someone is reading, and the caption tells them which one
 * they just read.
 */

export type StatTone = 'default' | 'success' | 'warning' | 'destructive'

const TONES: Record<StatTone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
}

export interface StatTileProps {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  href?: string
  tone?: StatTone
  className?: string
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  href,
  tone = 'default',
  className,
}: StatTileProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-caption text-muted-foreground">{label}</span>
        {icon ? (
          <span aria-hidden="true" className="icon-chip h-9 w-9 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        ) : null}
      </div>
      <p className={cn('tnum mt-2 text-h2 font-semibold leading-none', TONES[tone])}>{value}</p>
      {hint ? <p className="mt-1.5 text-caption text-muted-foreground">{hint}</p> : null}
    </>
  )

  const base = 'block min-h-[100px] p-4'

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          'surface-interactive',
          base,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        {content}
      </Link>
    )
  }

  return <div className={cn('surface', base, className)}>{content}</div>
}
