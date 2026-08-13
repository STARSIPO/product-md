import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type BadgeVariant =
  'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'accent' | 'outline'
export type BadgeSize = 'sm' | 'md'

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'border-transparent bg-muted text-muted-foreground',
  primary: 'border-transparent bg-primary-soft text-primary',
  success: 'border-transparent bg-success-soft text-success',
  warning: 'border-transparent bg-warning-soft text-warning',
  destructive: 'border-transparent bg-destructive-soft text-destructive',
  accent: 'border-transparent bg-accent-soft text-accent',
  outline: 'border-border bg-card text-foreground',
}

const SIZES: Record<BadgeSize, string> = {
  sm: 'min-h-[22px] gap-1 px-2 text-caption',
  md: 'min-h-[26px] gap-1.5 px-3 text-caption',
}

export interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'neutral', size = 'md', icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        // Pill shape: a badge is a chip, not a miniature card.
        'inline-flex items-center rounded-full border font-medium leading-none',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  )
}

/**
 * One explicit mapping for every lifecycle status in the product. Kept as data rather
 * than a switch so a missing status is a compile error, not a silently grey badge.
 */
const STATUS_VARIANTS = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  CHANGES_REQUESTED: 'warning',
  ACTIVE: 'success',
  PAUSED: 'neutral',
  REJECTED: 'destructive',
  SOLD_OUT: 'neutral',
  EXPIRED: 'neutral',
  ARCHIVED: 'neutral',
  BLOCKED: 'destructive',
  RECEIVING_OFFERS: 'primary',
  SUPPLIER_SELECTED: 'primary',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  DISPUTED: 'destructive',
  AWAITING_CONFIRMATION: 'warning',
  CONFIRMED: 'primary',
  PREPARING: 'primary',
  SHIPPED: 'primary',
  DELIVERED: 'success',
  SENT: 'neutral',
  VIEWED: 'neutral',
  SHORTLISTED: 'accent',
  ACCEPTED: 'success',
  WITHDRAWN: 'neutral',
  APPROVED: 'success',
  OPEN: 'primary',
  IN_REVIEW: 'warning',
  RESOLVED: 'success',
} satisfies Record<string, BadgeVariant>

export type StatusValue = keyof typeof STATUS_VARIANTS

export interface StatusBadgeProps {
  /** Any product / request / deal / offer / document status string. */
  status: StatusValue | (string & {})
  /** Already-translated status text — the badge never invents copy. */
  label: string
  size?: BadgeSize
  className?: string
}

export function StatusBadge({ status, label, size = 'md', className }: StatusBadgeProps) {
  const lookup: Partial<Record<string, BadgeVariant>> = STATUS_VARIANTS
  return (
    <Badge variant={lookup[status] ?? 'neutral'} size={size} className={className}>
      {label}
    </Badge>
  )
}
