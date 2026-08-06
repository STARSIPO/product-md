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
          <span
            aria-hidden="true"
            className="shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className={cn('tnum mt-1.5 text-xl font-semibold leading-tight', TONES[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-caption text-muted-foreground">{hint}</p> : null}
    </>
  )

  const base = 'block min-h-[88px] rounded-lg border border-border bg-card px-4 py-3.5 shadow-card'

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'transition-[border-color,box-shadow] duration-150 hover:border-primary/35 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        {content}
      </Link>
    )
  }

  return <div className={cn(base, className)}>{content}</div>
}
